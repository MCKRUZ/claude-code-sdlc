// The ONE place Studio ever shells out from. Every plugin-script call and every
// claude/uv/git/gh invocation goes through runCommand() — that is what makes "every command
// Studio runs appears in the console... nothing runs that does not appear there" true by
// construction rather than by convention: there is nowhere else in the app that can spawn
// a process. The renderer never gets direct process-spawning access at all (see preload).

import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import type { ConsoleEntry } from '../../shared/types'

export type { ConsoleEntry }

const log: ConsoleEntry[] = []
const listeners = new Set<(entry: ConsoleEntry) => void>()

export function onConsoleEntry(listener: (entry: ConsoleEntry) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getConsoleLog(): ConsoleEntry[] {
  return log
}

let nextId = 1

// Spec 0009's first acceptance check: Studio "never prompts for, stores or displays a
// password or token." An HTTPS git remote routinely embeds one directly in the URL, and
// ordinary git/gh output (git remote -v, push progress, most push failures) echoes it back
// verbatim — so redaction runs centrally here, on every command/arg/stdout/stderr, before
// anything reaches the log. This is a defense-in-depth backstop: Studio's own git/gh calls
// never pass a credential explicitly, but nothing upstream of this function is trusted to
// guarantee that on its own.
const CREDENTIALED_URL_RE = /(https?:\/\/)[^/@\s]+@/g
const GITHUB_TOKEN_RE = /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g
const GITHUB_PAT_RE = /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g

export function redact(text: string): string {
  return text
    .replace(CREDENTIALED_URL_RE, '$1***@')
    .replace(GITHUB_TOKEN_RE, '***')
    .replace(GITHUB_PAT_RE, '***')
}

// Windows installs of git and gh from scoop, npm or Chocolatey are batch shims, and a batch
// file can only be started through the command interpreter — so tooling.ts resolves those to
// `cmd.exe /c <shim>`. That hands the interpreter the arguments, and it re-reads them:
// Node quotes an argument only when it contains a space or a quote, so a value with none,
// like a branch name, arrives unquoted and its `&` starts a second command.
//
// Measured on this machine, with a control. Through `cmd.exe /c <shim>`, an argument of
// `main&echo>FILE` reached the shim as just `main` and the injected command RAN. Spawned
// directly against an executable, the identical value arrived intact as one argument and
// nothing ran. So this is the shim routing, not the payload — and git happily permits these
// characters in a branch name, which a cloned repository chooses.
//
// Refused here rather than in git.ts because this is the only function that can start a
// process, so this is the only place the guarantee can actually hold. Nothing Studio does
// needs a branch name or document path containing these characters.
const CMD_METACHARACTERS = /[&|<>^%\r\n"]/

export class UnsafeArgumentError extends Error {}

function isCommandInterpreter(command: string): boolean {
  return /(^|[\\/])cmd(\.exe)?$/i.test(command.trim())
}

export interface RunCommandOptions {
  /** Merged ONTO process.env (never replaces it) — for e.g. GIT_INDEX_FILE, matching the
   * plugin's own run_git() contract exactly. */
  env?: Record<string, string>
  /** Written to the child's stdin, then stdin is closed — for e.g. `git hash-object --stdin`.
   * Stdin is always closed even when this is omitted, so a command that happens to read
   * stdin can never hang Studio waiting for input that will never come. */
  input?: string
}

/** Runs `command args` in `cwd`, records the full result to the console log (always —
 * success or failure), and returns it. Never throws: a failed command is a normal,
 * recorded ConsoleEntry with ok:false, not an exception the caller has to remember to
 * catch — a command that fails must still show up in the console and leave the project
 * untouched, per spec 0008's own acceptance check. */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  opts?: RunCommandOptions,
): Promise<ConsoleEntry> {
  const startedAt = new Date().toISOString()
  const start = performance.now()

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const finish = (exitCode: number | null, extraStderr?: string) => {
      const entry: ConsoleEntry = {
        id: String(nextId++),
        command: redact(command),
        args: args.map(redact),
        cwd,
        startedAt,
        durationMs: Math.round(performance.now() - start),
        exitCode,
        stdout: redact(stdout),
        stderr: redact(extraStderr ? `${stderr}\n${extraStderr}`.trim() : stderr),
        ok: exitCode === 0,
      }
      log.push(entry)
      for (const listener of listeners) listener(entry)
      resolve(entry)
    }

    if (isCommandInterpreter(command)) {
      // args[0] is '/c' and args[1] is the shim's own path, both Studio's; everything after
      // is caller data, which is what must not be re-read as commands. A refusal is recorded
      // like any other outcome — a command Studio declined to run still belongs in the
      // console, and silently doing nothing would be the worse failure.
      const unsafe = args.slice(2).find((a) => CMD_METACHARACTERS.test(a))
      if (unsafe !== undefined) {
        finish(null, `Refused to run: ${JSON.stringify(unsafe)} contains characters the Windows command interpreter would read as commands.`)
        return
      }
    }

    const env = opts?.env ? { ...process.env, ...opts.env } : undefined
    const child = spawn(command, args, { cwd, windowsHide: true, env })

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.stdin.end(opts?.input)

    child.on('error', (err) => finish(null, err.message))
    child.on('close', (code) => finish(code))
  })
}
