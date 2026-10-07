// studio-observatory.md §8.4 / §11: the Wave 0–3 layers (UI kit, motion, palette, scenes, theme,
// shortcuts, stores) add ZERO `window.studio.*` calls. They hold and present what a screen already
// fetched; every subprocess the renderer starts is still started from a component under
// `src/components/` (or `App.tsx`), so the set of IPC call sites — and so the security review's
// surface — does not grow with the overhaul. This is a plain file walk, no shell: it runs the
// same on Windows and in CI.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const STUDIO_ROOT = path.resolve(__dirname, '..')

/** The directories under `src/` that must never reach the preload bridge. `src/components` is
 * deliberately absent — that is where the calls belong. */
const IPC_FREE_DIRS = ['ui', 'motion', 'palette', 'scenes', 'theme', 'shortcuts', 'stores']

const SOURCE_EXT = new Set(['.ts', '.tsx'])

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.has(path.extname(name))) out.push(full)
  }
  return out
}

/** Comments are removed before matching: the contract files and the stores say in prose that
 * they never call `window.studio` — the rule is about CODE reaching the bridge, and a doc comment
 * naming the thing it avoids must not trip it. Block comments go first, then `//` comments
 * (only where `//` starts a line or follows whitespace, so a `://` inside a string survives).
 * Strings are left alone: a `'window.studio'` string literal in these directories would be
 * exactly as suspicious as a call, and should fail. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')
}

/** Every `window.studio` occurrence with its file and 1-based line, so a failure names the exact
 * place rather than a count. Line numbers are of the comment-stripped text and so approximate
 * when a block comment spanned lines above the match; the file and the line's text are exact. */
function findMatches(files: string[]): string[] {
  const matches: string[] = []
  for (const file of files) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (line.includes('window.studio')) {
        matches.push(`${path.relative(STUDIO_ROOT, file)}:${i + 1}: ${line.trim()}`)
      }
    })
  }
  return matches
}

describe('the Wave 0 renderer layers add no window.studio.* calls', () => {
  it('finds zero occurrences of "window.studio" under the IPC-free directories', () => {
    const files = IPC_FREE_DIRS.flatMap((dir) => walk(path.join(STUDIO_ROOT, 'src', dir)))
    // At least the Wave 0-0 contract files exist, so an empty walk means the paths are wrong,
    // not that the rule is trivially satisfied.
    expect(files.length).toBeGreaterThan(0)
    expect(findMatches(files)).toEqual([])
  })

  it('the walker itself sees a call where one exists (so the rule is not vacuous)', () => {
    // `App.tsx` owns the console-log subscription; if this ever stops matching, the walker has
    // silently gone blind and the test above means nothing.
    const matches = findMatches([path.join(STUDIO_ROOT, 'src', 'App.tsx')])
    expect(matches.length).toBeGreaterThan(0)
  })
})
