/** Spec 0029's "Write the registry and index": exactly one plugin script call, no model, and what the
 * script says is read back into the shape the screen uses. */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeRegistry } from '../electron/main/batchRegistry'
import { getConsoleLog } from '../electron/main/commandRunner'
import { makeIntakeProject, writeSummary } from './batchHarness'
import { differences, snapshot } from './draftHarness'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)

describe.skipIf(!PLUGIN.available)('writeRegistry against the real plugin scripts', () => {
  let project = ''
  beforeEach(() => {
    project = makeIntakeProject(PLUGIN, { files: { 'a.md': '# a\n', 'b.md': '# b\n', 'c.md': '# c\n', 'd.md': '# d\n' }, skip: ['DOC-004'] })
  })
  afterEach(() => rmSync(project, { recursive: true, force: true }))

  it('runs exactly intake_documents.py --state <state> --registry --json, and nothing else', async () => {
    const before = getConsoleLog().length
    await writeRegistry(project, PLUGIN.scriptsDir)

    const ran = getConsoleLog().slice(before)
    expect(ran).toHaveLength(1)
    expect(ran[0].command).toBe(PLUGIN.python) // a plugin script; no claude, so no model
    expect(ran[0].args).toEqual([
      join(PLUGIN.scriptsDir, 'intake_documents.py'), '--state', join(project, '.sdlc', 'state.yaml'), '--registry', '--json',
    ])
  })

  it('says how many documents are summarised, which are not, and whether the index fits its budget', async () => {
    writeSummary(project, 'DOC-001', 'a')
    const result = await writeRegistry(project, PLUGIN.scriptsDir)

    expect(result).toMatchObject({
      ok: true, documents: 4, summarised: 1, missingSummaries: ['DOC-002', 'DOC-003'], // DOC-004 is skipped: not missing
      indexWithinBudget: true, indexBudget: 5000, trimmed: [], registryCreated: true, warnings: [],
      registry: '.sdlc/artifacts/00-discovery/document-registry.md', index: '.sdlc/context/intake/index.md',
    })
    expect(result.indexTokens).toBeGreaterThan(0)
    expect(existsSync(join(project, '.sdlc', 'artifacts', '00-discovery', 'document-registry.md'))).toBe(true)
    expect(readFileSync(join(project, '.sdlc', 'context', 'intake', 'index.md'), 'utf-8')).toContain('DOC-001')
  })

  it('changes only the registry and the index', async () => {
    const before = snapshot(project)
    await writeRegistry(project, PLUGIN.scriptsDir)
    expect(differences(before, snapshot(project))).toEqual([
      '.sdlc/artifacts/00-discovery/document-registry.md', '.sdlc/context/intake/index.md',
    ])
  })

  it('reports the second write as an update of the registry, not a creation', async () => {
    await writeRegistry(project, PLUGIN.scriptsDir)
    expect(await writeRegistry(project, PLUGIN.scriptsDir)).toMatchObject({ ok: true, registryCreated: false })
  })

  it("answers a project with no catalogue with the script's own one line, and zeros", async () => {
    rmSync(join(project, '.sdlc', 'context', 'intake', 'catalog.json'))
    const result = await writeRegistry(project, PLUGIN.scriptsDir)
    expect(result).toEqual({
      ok: false, error: 'no catalog to build a registry from; run intake first', documents: 0, summarised: 0,
      missingSummaries: [], indexTokens: 0, indexBudget: 0, indexWithinBudget: false, trimmed: [], registryCreated: false, warnings: [],
    })
  })

  it('refuses a folder that is not a project, without running anything', async () => {
    const before = getConsoleLog().length
    expect(await writeRegistry(join(project, 'docs'), PLUGIN.scriptsDir)).toMatchObject({ ok: false, error: 'Open a project first.' })
    expect(getConsoleLog().length).toBe(before)
  })
})
