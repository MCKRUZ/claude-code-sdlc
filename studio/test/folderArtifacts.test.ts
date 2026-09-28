/** A stage can list a FOLDER as one of its documents (`adrs/` in Design). Studio treated every
 * entry as a single file: the plugin crashed reading the folder as text, the Design stage showed
 * a raw traceback, and even with that fixed the row would have offered to open a directory as a
 * document. These pin the Studio half, against the real plugin scripts.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDocument } from '../electron/main/documents'
import { getStageReadiness } from '../electron/main/readiness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const ADRS = '.sdlc/artifacts/02-design/adrs'

describe.skipIf(!PLUGIN.available)('a stage whose document is a folder', () => {
  let project = ''

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'studio-folder-'))
    execFileSync(PLUGIN.python, [
      join(PLUGIN.scriptsDir, 'init_project.py'),
      '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: PLUGIN.scriptsDir })
    return () => rmSync(project, { recursive: true, force: true })
  })

  const withAdrs = (files: string[]) => {
    mkdirSync(join(project, ADRS), { recursive: true })
    for (const f of files) writeFileSync(join(project, ADRS, f), '# ADR\n\nUse PostgreSQL.\n', 'utf-8')
  }

  it('shows the Design stage instead of an error', async () => {
    withAdrs(['ADR-001.md'])
    const stage = await getStageReadiness(project, PLUGIN.scriptsDir, '2')
    expect(stage.ok, stage.error).toBe(true)
    expect(stage.error).toBeUndefined()
  })

  it('marks the folder as a folder, present and complete', async () => {
    withAdrs(['ADR-001.md'])
    const stage = await getStageReadiness(project, PLUGIN.scriptsDir, '2')
    const adrs = stage.documents.find((d) => d.name.replace(/\/$/, '') === 'adrs')
    expect(adrs, 'the folder should be listed').toBeDefined()
    expect(adrs!.folder).toBe(true)
    expect(adrs!.exists).toBe(true)
    expect(adrs!.ready).toBe(true)
  })

  it('does not mark an ordinary document as a folder', async () => {
    withAdrs(['ADR-001.md'])
    const stage = await getStageReadiness(project, PLUGIN.scriptsDir, '2')
    expect(stage.documents.find((d) => d.name === 'design-doc.md')!.folder).toBe(false)
  })

  it('reports an empty folder as work to do, without trying to open it as a document', async () => {
    withAdrs([])
    const stage = await getStageReadiness(project, PLUGIN.scriptsDir, '2')
    expect(stage.ok, stage.error).toBe(true)
    const finding = stage.findings.find((f) => f.path.endsWith('/adrs'))
    expect(finding?.reason).toMatch(/empty/)
  })

  it('refuses to open a folder as a document, cleanly rather than by throwing', async () => {
    withAdrs(['ADR-001.md'])
    const opened = await openDocument(project, PLUGIN.scriptsDir, ADRS)
    expect(opened.ok).toBe(false)
    expect(opened.error).toMatch(/folder/i)
  })
})
