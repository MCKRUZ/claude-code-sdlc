/** Which plugin Studio drives (studio-improvements F2).
 *
 * The README promised "the plugin Studio drives is always the one beside it" while detection
 * scanned the marketplace cache first and picked an older copy over the checkout. Now the order
 * is: the path a person set, then the checkout Studio ships in, then the cache — and every answer
 * says which it was and what version it declares. Proven against THIS checkout: `studio/` really
 * does sit beside the plugin's `scripts/`.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { detectPluginScripts, PLUGIN_MARKER, siblingPluginScripts } from '../electron/main/tooling'

const STUDIO_ROOT = resolve(__dirname, '..') // what index.ts sets APP_ROOT to when unpackaged
const PLUGIN_ROOT = resolve(STUDIO_ROOT, '..')
const EXPECTED_VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf-8')).version as string

const made: string[] = []
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }) })
const tempDir = () => { const d = mkdtempSync(join(tmpdir(), 'studio-tooling-')); made.push(d); return d }

describe('siblingPluginScripts', () => {
  it('finds the checkout Studio ships in', () => {
    expect(siblingPluginScripts(STUDIO_ROOT)).toBe(join(PLUGIN_ROOT, 'scripts'))
  })

  it('is null with no app root (a packaged build) or a root with no plugin beside it', () => {
    expect(siblingPluginScripts(undefined)).toBeNull()
    expect(siblingPluginScripts(join(tempDir(), 'app'))).toBeNull()
  })
})

describe('detectPluginScripts', () => {
  it('prefers the checkout beside Studio over anything cached, and says so with its version', async () => {
    const status = await detectPluginScripts(undefined, STUDIO_ROOT)
    expect(status.found).toBe(true)
    expect(status.path).toBe(join(PLUGIN_ROOT, 'scripts'))
    expect(status.source).toBe('sibling')
    expect(status.pluginVersion).toBe(EXPECTED_VERSION)
  })

  it('a path the person set wins, is verified by the marker, and is labelled as theirs', async () => {
    const status = await detectPluginScripts(join(PLUGIN_ROOT, 'scripts'), STUDIO_ROOT)
    expect(status.found).toBe(true)
    expect(status.source).toBe('override')
    expect(status.pluginVersion).toBe(EXPECTED_VERSION)
  })

  it('refuses a path without the marker, naming the file it looked for', async () => {
    const empty = tempDir()
    writeFileSync(join(empty, 'generate_status.py'), '# the OLD marker alone is an older plugin')
    const status = await detectPluginScripts(empty, STUDIO_ROOT)
    expect(status.found).toBe(false)
    expect(status.error).toContain(PLUGIN_MARKER)
    expect(status.error).toContain(empty)
  })

  it('a version it cannot read is left absent, never invented', async () => {
    const root = tempDir()
    const scripts = join(root, 'scripts')
    mkdirSync(scripts, { recursive: true })
    writeFileSync(join(scripts, PLUGIN_MARKER), '')
    const status = await detectPluginScripts(scripts, STUDIO_ROOT)
    expect(status.found).toBe(true)
    expect(status.pluginVersion).toBeUndefined()
  })
})

