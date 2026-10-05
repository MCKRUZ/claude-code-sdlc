// Running workshop_brief.py for the brief form (spec 0032) and reading its one JSON document. The
// answers are shown to a person, so a refusal is the plugin's own one `Error:` line (an absolute path
// in it reduced to its file name, the project's folder layout is not the person's business) and every
// other failure is a fixed plain line: a python traceback, argparse's usage text or "can't open file"
// never reaches the screen.

import { rawStdout } from './commandRunner'
import { runPluginScript } from './project'

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
export const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// A drive path may have spaces in its folders ("Code Repos"); its last segment ends at the first space.
const WINDOWS_PATH = /[A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n]+[\\/])*[^\\/:*?"<>|\s]+/g
const POSIX_PATH = /(?<![\w.:\\/])\/(?:[^/\r\n]+\/)+[^/\s]+/g

/** The message with every absolute path replaced by the file name at its end. */
export function plainPaths(text: string): string {
  const lastSegment = (path: string) => path.split(/[\\/]/).pop() ?? path
  return text.replace(WINDOWS_PATH, lastSegment).replace(POSIX_PATH, lastSegment)
}

/** The plugin's refusal: its first `Error:` line, for a script that exited 1. Null for anything else. */
function refusal(stdout: string, stderr: string): string | null {
  for (const line of `${stderr}\n${stdout}`.split(/\r?\n/)) {
    const m = /^error:\s*(.+)$/i.exec(line.trim())
    // A Windows console pipe hands a dash from python's stderr over as U+FFFD.
    if (m) return plainPaths(m[1].replace(/�/g, '-').trim())
  }
  return null
}

export type BriefRun = { ok: true; raw: Record<string, unknown> } | { ok: false; error: string }

/** Runs `workshop_brief.py <args>` and reads stdout as exactly one JSON object. `unreadable` is the
 * one line shown for every outcome that is not a result and not a plugin refusal. */
export async function runBriefScript(scriptsDir: string, args: string[], unreadable: string): Promise<BriefRun> {
  const entry = await runPluginScript(scriptsDir, 'workshop_brief.py', args)
  const fail = (error: string): BriefRun => ({ ok: false, error })
  if (entry.exitCode === 1) return fail(refusal(entry.stdout, entry.stderr) ?? unreadable)
  if (entry.exitCode !== 0) return fail(unreadable)
  try {
    // Read from the exact output: the masked copy rewrites anything shaped like `token: value`, and a
    // quoted passage from a document can be shaped like that.
    const raw: unknown = JSON.parse(rawStdout(entry))
    return isRecord(raw) ? { ok: true, raw } : fail(unreadable)
  } catch {
    return fail(unreadable)
  }
}
