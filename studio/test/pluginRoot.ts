/** Locating the plugin the integration tests run against — and refusing to be quiet about it.
 *
 * Studio drives the claude-code-sdlc plugin's own scripts, so its most valuable tests need a
 * real plugin checkout with a real Python environment. When one cannot be located, those tests
 * skip. That is the right behaviour: somebody who has cloned Studio alone should still be able
 * to run its unit tests.
 *
 * What is NOT right is what used to happen next. A run where 31 of 33 window tests skipped
 * printed "2 passed" and exited 0, which is indistinguishable from a run that proved
 * everything. It caused a false report of what had been verified — the same failure this whole
 * product is built to prevent, sitting in its own test suite.
 *
 * So an unavailable plugin is now an ERROR by default, naming what was looked for and how to
 * point at the right place, and a person who genuinely wants the Studio-only tests says so out
 * loud with STUDIO_SKIP_PLUGIN_TESTS=1. Silence is no longer one of the options.
 *
 * The search deliberately includes git worktrees of the sibling checkout. The plugin is
 * developed on branches in worktrees, and the main checkout regularly does not yet have the
 * scripts a Studio branch is written against — which is exactly why the tests were skipping
 * while a perfectly good plugin sat one directory away.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** A file every usable plugin checkout has, and older ones do not — so a checkout on a branch
 * that predates Studio's needs is correctly treated as unusable rather than half-usable. */
const MARKER = join('scripts', 'document_shape_cli.py')

function venvPython(root: string): string {
  return process.platform === 'win32'
    ? join(root, 'scripts', '.venv', 'Scripts', 'python.exe')
    : join(root, 'scripts', '.venv', 'bin', 'python')
}

function isUsable(root: string): boolean {
  return existsSync(join(root, MARKER)) && existsSync(venvPython(root))
}

function candidates(testDir: string): string[] {
  const out: string[] = []
  if (process.env.SDLC_PLUGIN_ROOT) out.push(process.env.SDLC_PLUGIN_ROOT)

  const sibling = resolve(testDir, '..', '..', 'claude-code-sdlc')
  out.push(sibling)

  // Worktrees of the sibling checkout. The plugin is developed on branches, and the main
  // checkout often does not yet carry the scripts a Studio branch is written against.
  const worktrees = join(sibling, '.claude', 'worktrees')
  if (existsSync(worktrees)) {
    try {
      for (const e of readdirSync(worktrees, { withFileTypes: true })) {
        if (e.isDirectory()) out.push(join(worktrees, e.name))
      }
    } catch { /* unreadable is simply no candidate */ }
  }
  return out
}

export interface PluginLocation {
  root: string | null
  scriptsDir: string
  python: string
  available: boolean
  searched: string[]
}

export function locatePlugin(testDir: string): PluginLocation {
  const searched = candidates(testDir)
  const root = searched.find(isUsable) ?? null
  return {
    root,
    scriptsDir: root ? join(root, 'scripts') : '',
    python: root ? venvPython(root) : '',
    available: root !== null,
    searched,
  }
}

/** Call once per integration test file, at module scope.
 *
 * Throws when no plugin can be located, unless the person has explicitly opted out. Throwing at
 * module scope fails the file loudly rather than letting it report success having run nothing.
 */
export function requirePlugin(testDir: string): PluginLocation {
  const found = locatePlugin(testDir)
  if (found.available) return found
  if (process.env.STUDIO_SKIP_PLUGIN_TESTS === '1') return found

  throw new Error(
    'No usable claude-code-sdlc checkout was located, so the tests that prove Studio actually '
    + 'drives the plugin cannot run.\n\n'
    + `A usable checkout has both ${MARKER} and a Python environment under scripts/.venv.\n\n`
    + 'Looked in:\n'
    + found.searched.map((c) => `  - ${c}`).join('\n')
    + '\n\nPoint at one with SDLC_PLUGIN_ROOT=<path>, or run the Studio-only tests deliberately '
    + 'with STUDIO_SKIP_PLUGIN_TESTS=1. This used to skip quietly and report success, which is '
    + 'how a run that proved nothing came to look like a run that proved everything.',
  )
}
