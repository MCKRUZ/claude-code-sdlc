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
    const env = opts?.env ? { ...process.env, ...opts.env } : undefined
    const child = spawn(command, args, { cwd, windowsHide: true, env })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.stdin.end(opts?.input)

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

    child.on('error', (err) => finish(null, err.message))
    child.on('close', (code) => finish(code))
  })
}
