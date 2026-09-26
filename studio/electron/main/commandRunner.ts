// The ONE place Studio ever shells out from. Every plugin-script call and every
// claude/uv/git/gh invocation goes through runCommand() — that is what makes "every command
// Studio runs appears in the console... nothing runs that does not appear there" true by
// construction rather than by convention: there is nowhere else in the app that can spawn
// a process. The renderer never gets direct process-spawning access at all (see preload).

import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import type { ConsoleEntry } from '../../shared/types'

export type { ConsoleEntry }

// The console log is kept in memory and shown in a panel. Studio pulls every two minutes and
// runs several commands per document each time, so an app left open all day accumulates
// thousands of entries holding every byte those commands printed. Two caps, both about
// keeping a long session healthy rather than about any attack:
//
//   MAX_LOG_ENTRIES — oldest entries fall off. Nobody scrolls back past a few hundred, and
//                     the alternative is a window that slowly eats the machine.
//   MAX_CAPTURED    — one command's output. A project can legitimately contain a very large
//                     file, and reading one whole into a string can take the app down.
const MAX_LOG_ENTRIES = 500
const MAX_CAPTURED = 1_000_000

const log: ConsoleEntry[] = []
const listeners = new Set<(entry: ConsoleEntry) => void>()

/** Keeps the first MAX_CAPTURED characters and says plainly that it stopped there, rather
 * than silently handing back a truncated value that reads like the whole thing. */
function capture(text: string, dropped: number): string {
  return dropped > 0 ? `${text}\n…[${dropped} more characters not captured]` : text
}

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
//
// The list below covers more than GitHub because Studio spawns more than git and gh. The
// `claude` CLI runs through here too and prints its own credential errors; a repository's
// git remote can point anywhere; and a person pasting a console excerpt into a bug report
// has no idea which line carried a secret. Anything that gets this wrong is unrecoverable
// by redacting later — a token that has already been shown must be rotated, not hidden.
const REDACTIONS: Array<[RegExp, string]> = [
  // A credential embedded in a remote URL — the original case, and still the likeliest.
  [/(https?:\/\/)[^/@\s]+@/g, '$1***@'],
  // GitHub's own token shapes.
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '***'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '***'],
  // Other hosts and vendors Studio or its child processes can encounter.
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, '***'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, '***'],
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '***'],
  // Bearer headers and JSON Web Tokens, which carry the credential in the clear.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{20,}/gi, '$1 ***'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '***'],
  // A labelled secret in any shape — the catch-all, deliberately last so a more precise
  // pattern above gets to describe what it matched first.
  [/\b(pass(?:word)?|token|secret|api[_-]?key|auth)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi, '$1=***'],
]

export function redact(text: string): string {
  return REDACTIONS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
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
  /** Kills the child and records a timeout failure after this many milliseconds. Only for
   * probes that must never hang the app (a broken PATH entry with no such command) —
   * ordinary git/gh/plugin-script calls have no ceiling here, since a slow clash resolution
   * or npm audit taking a while is normal, not a hang. */
  timeoutMs?: number
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
    let settled = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    const finish = (exitCode: number | null, extraStderr?: string) => {
      // A timeout kill() triggers 'close' too — without this guard that would record and
      // notify twice for one actual command.
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)

      const fullStdout = redact(stdout)
      const fullStderr = redact(extraStderr ? `${stderr}\n${extraStderr}`.trim() : stderr)
      const base = {
        id: String(nextId++),
        command: redact(command),
        args: args.map(redact),
        cwd,
        startedAt,
        durationMs: Math.round(performance.now() - start),
        exitCode,
        ok: exitCode === 0,
      }

      // The CALLER gets everything. Its stdout is parsed as JSON, and for `git show` it is
      // the actual content of a document being merged — truncating that would silently
      // corrupt someone's work, which is far worse than the memory it costs.
      const entry: ConsoleEntry = { ...base, stdout: fullStdout, stderr: fullStderr }

      // The LOG gets a bounded copy. It is for a person reading a panel, and it is the part
      // that accumulates for as long as the app is open.
      log.push({
        ...base,
        stdout: capture(fullStdout.slice(0, MAX_CAPTURED), fullStdout.length - MAX_CAPTURED),
        stderr: capture(fullStderr.slice(0, MAX_CAPTURED), fullStderr.length - MAX_CAPTURED),
      })
      if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES)

      for (const listener of listeners) listener(log[log.length - 1])
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

    if (opts?.timeoutMs) {
      timeoutHandle = setTimeout(() => {
        child.kill()
        finish(null, `Timed out after ${opts.timeoutMs}ms with no response.`)
      }, opts.timeoutMs)
    }

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.stdin.end(opts?.input)

    child.on('error', (err) => finish(null, err.message))
    child.on('close', (code) => finish(code))
  })
}
