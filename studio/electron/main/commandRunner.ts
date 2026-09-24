// The ONE place Studio ever shells out from. Every plugin-script call and every
// claude/uv invocation goes through runCommand() — that is what makes "every command
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

/** Runs `command args` in `cwd`, records the full result to the console log (always —
 * success or failure), and returns it. Never throws: a failed command is a normal,
 * recorded ConsoleEntry with ok:false, not an exception the caller has to remember to
 * catch — a command that fails must still show up in the console and leave the project
 * untouched, per spec 0008's own acceptance check. */
export function runCommand(command: string, args: string[], cwd: string): Promise<ConsoleEntry> {
  const startedAt = new Date().toISOString()
  const start = performance.now()

  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    const finish = (exitCode: number | null, extraStderr?: string) => {
      const entry: ConsoleEntry = {
        id: String(nextId++),
        command,
        args,
        cwd,
        startedAt,
        durationMs: Math.round(performance.now() - start),
        exitCode,
        stdout,
        stderr: extraStderr ? `${stderr}\n${extraStderr}`.trim() : stderr,
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
