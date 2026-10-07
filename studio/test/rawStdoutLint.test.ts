import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A source-level lint, not a behaviour test. commandRunner's ConsoleEntry carries the stdout the
// *window* shows (truncated, redacted — whatever the console needs), while the untouched text a
// plugin script printed rides alongside under RAW_OUTPUT and is read back with rawStdout(entry).
// JSON must only ever be parsed from the raw text: a `--json` document clipped for display is not
// a shorter document, it is an unreadable one, and the failure shows up far from its cause (a
// panel reporting "could not be read" for a project whose script answered perfectly well).
//
// The pattern below catches `JSON.parse(entry.stdout)`, `JSON.parse(listed.stdout)` and the like
// in every main-process module. It is deliberately narrow — it does not try to follow a
// `const stdout = entry.stdout` indirection — so the complementary rule is: a helper that takes
// a `stdout: string` and parses it must be handed rawStdout(entry) at the call site (handoff.ts
// and settings.ts's gate-auth parser are the two existing examples).
const MAIN_DIR = join(__dirname, '..', 'electron', 'main')
const FORBIDDEN = /JSON\.parse\(\s*[\w.]*\.stdout/

// File names (relative to electron/main) where a direct `JSON.parse(<x>.stdout` is accepted,
// each with the reason it is safe. Add an entry only when the `.stdout` in question is provably
// not a ConsoleEntry's (a plain record that was itself built from rawStdout, or a child_process
// result that never passed through commandRunner), and say so.
const ALLOWLIST: Record<string, string> = {
  // auditArtifacts() in history.ts is a thin wrapper returning `{ ok, stdout: rawStdout(entry), stderr }`
  // (a plain record, not a ConsoleEntry), so the `listed.stdout` / `history.stdout` parsed there
  // already hold the raw text.
  'history.ts': 'auditArtifacts() returns stdout: rawStdout(entry); the parsed field is already the raw text',
}

describe('main-process JSON parsing reads rawStdout(entry), never entry.stdout', () => {
  const files = readdirSync(MAIN_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))

  it('scans the main-process modules (guards against an empty glob certifying nothing)', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files)('%s', (file) => {
    const source = readFileSync(join(MAIN_DIR, file), 'utf-8')
    const offending = source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => FORBIDDEN.test(line))
    if (file in ALLOWLIST) {
      // An allowlisted file that no longer needs the exemption should lose it, so the list
      // never outlives the reason it was written for.
      expect(offending.length, `${file} is allowlisted ("${ALLOWLIST[file]}") but has no offending line — remove it from ALLOWLIST`).toBeGreaterThan(0)
      return
    }
    expect(
      offending.map(({ n, line }) => `${file}:${n}: ${line.trim()}`),
      `${file} parses JSON from a ConsoleEntry's display stdout; use rawStdout(entry) from './commandRunner'`,
    ).toEqual([])
  })

  it('the allowlist only names files that exist', () => {
    for (const name of Object.keys(ALLOWLIST)) expect(files).toContain(name)
  })
})
