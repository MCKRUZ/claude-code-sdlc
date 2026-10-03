import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getStageGuide } from '../electron/main/activities'

// The Guide tab reads the plugin's own phase file. `definition` arrives from the plugin's JSON, so
// it is treated as untrusted: nothing outside the plugin, and only markdown.

describe('getStageGuide', () => {
  let root: string
  let scriptsDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'stage-guide-'))
    scriptsDir = join(root, 'plugin', 'scripts')
    mkdirSync(scriptsDir, { recursive: true })
    mkdirSync(join(root, 'plugin', 'phases'), { recursive: true })
    writeFileSync(join(root, 'plugin', 'phases', '00-discovery.md'), '# Discovery — “what this is for”\n')
    writeFileSync(join(root, 'secret.md'), 'private')
    writeFileSync(join(root, 'plugin', 'phases', 'notes.txt'), 'not markdown')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('returns the phase file from the plugin root as UTF-8 text', () => {
    expect(getStageGuide(scriptsDir, 'phases/00-discovery.md')).toEqual({
      ok: true, markdown: '# Discovery — “what this is for”\n',
    })
  })

  it.each([
    ['a parent segment', '../secret.md'],
    ['a parent segment after a folder', 'phases/../../secret.md'],
    ['a backslash parent segment', 'phases\\..\\..\\secret.md'],
    ['a non-markdown file', 'phases/notes.txt'],
  ])('refuses %s', (_name, definition) => {
    const result = getStageGuide(scriptsDir, definition)
    expect(result.ok).toBe(false)
    expect(result.markdown).toBeUndefined()
  })

  it('refuses an absolute path, even one that points at a real markdown file', () => {
    const result = getStageGuide(scriptsDir, resolve(root, 'secret.md'))
    expect(result.ok).toBe(false)
    expect(result.markdown).toBeUndefined()
  })

  it('reports a missing file as an error rather than throwing', () => {
    const result = getStageGuide(scriptsDir, 'phases/99-gone.md')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
