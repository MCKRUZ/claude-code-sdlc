/** "Start this document": the handler behind the button that replaced Edit on a document that does not exist.
 *
 * Found by the smoke suite (docs/studio-smoke-review-2026-10-05.md, bug 2): a document that has not been
 * created yet showed a blue Edit button, and pressing it failed with "<path> does not exist". The function
 * that creates a document from the plugin's own template already existed (the chat and the Create activity
 * use it); what was missing was a way to ask for it from where the person is looking.
 *
 * The renderer is untrusted, so the handler is checked as the boundary it is: only a document Studio can
 * start from a template, only inside the project, never over a document that is already there.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { registerActivityHandlers } from '../electron/main/activities'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const made: string[] = []
const DOC = '.sdlc/artifacts/00-discovery/constitution.md'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>
function handlers(scriptsDir: string | null): Map<string, Handler> {
  const table = new Map<string, Handler>()
  registerActivityHandlers({ handle: (channel: string, fn: Handler) => { table.set(channel, fn) } } as never, async () => scriptsDir)
  return table
}

const project = () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-start-doc-'))
  made.push(dir)
  mkdirSync(join(dir, '.sdlc'), { recursive: true })
  return dir
}
const start = (table: Map<string, Handler>, dir: string, rel: unknown) =>
  table.get('studio:startDocument')!({}, dir, rel) as Promise<{ ok: boolean; created?: boolean; error?: string }>

afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

describe.skipIf(!PLUGIN.available)('studio:startDocument', () => {
  it('is registered', () => {
    expect(handlers(PLUGIN.scriptsDir).has('studio:startDocument')).toBe(true)
  })

  it('creates a missing document from its template, and says it did', async () => {
    const dir = project()
    const result = await start(handlers(PLUGIN.scriptsDir), dir, DOC)
    expect(result).toEqual({ ok: true, created: true })
    expect(existsSync(join(dir, DOC))).toBe(true)
    expect(readFileSync(join(dir, DOC), 'utf-8').length).toBeGreaterThan(50)
  })

  it('never replaces a document that is already there', async () => {
    const dir = project()
    mkdirSync(join(dir, '.sdlc', 'artifacts', '00-discovery'), { recursive: true })
    writeFileSync(join(dir, DOC), 'my own words, not the template\n')
    const result = await start(handlers(PLUGIN.scriptsDir), dir, DOC)
    expect(result).toEqual({ ok: true, created: false })
    expect(readFileSync(join(dir, DOC), 'utf-8')).toBe('my own words, not the template\n')
  })

  it.each([
    ['a path outside the project', '../escape.md'],
    ['an absolute path', process.platform === 'win32' ? 'C:/Windows/evil.md' : '/etc/evil.md'],
    ['a file that is not a project document', 'src/app.md'],
    ['a document with no template', '.sdlc/artifacts/00-discovery/not-a-real-document.md'],
  ])('refuses %s and writes nothing', async (_label, rel) => {
    const dir = project()
    const result = await start(handlers(PLUGIN.scriptsDir), dir, rel)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(existsSync(join(dir, 'src'))).toBe(false)
    expect(existsSync(join(dir, '..', 'escape.md'))).toBe(false)
  })

  it.each([[undefined], [42], [null], [{}]])('refuses a path that is not text (%j)', async (rel) => {
    const result = await start(handlers(PLUGIN.scriptsDir), project(), rel)
    expect(result.ok).toBe(false)
  })

  it('refuses, in words, when the plugin cannot be found', async () => {
    const result = await start(handlers(null), project(), DOC)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/plugin/i)
  })
})
