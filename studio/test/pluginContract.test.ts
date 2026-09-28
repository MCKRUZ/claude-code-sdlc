/** Studio and the plugin ship separately, so Studio can be running against a plugin older than
 * itself — it already happened once: a marketplace-cached 1.5.1 was picked up in place of
 * 1.5.2 and the person saw a raw argparse dump. The version number could not have caught it;
 * it had not been bumped for months.
 *
 * So Studio recognises an old plugin by CAPABILITY. `document_shape_cli.py read` states the
 * contract it honours; an older plugin never emitted the key. Absent means old.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPECTED_READ_CONTRACT, pluginIsBehind } from '../shared/pluginContract'

describe('pluginIsBehind', () => {
  it('treats a missing contract as an old plugin — the case that actually happens', () => {
    expect(pluginIsBehind(undefined)).toBe(true)
  })

  it('treats a lower contract as behind', () => {
    expect(pluginIsBehind(EXPECTED_READ_CONTRACT - 1)).toBe(true)
  })

  it('is satisfied by the expected contract', () => {
    expect(pluginIsBehind(EXPECTED_READ_CONTRACT)).toBe(false)
  })

  it('is not bothered by a plugin NEWER than this Studio', () => {
    // A newer plugin only adds; an older Studio ignores what it does not know.
    expect(pluginIsBehind(EXPECTED_READ_CONTRACT + 1)).toBe(false)
  })
})

// --- through the real document-opening path -------------------------------------------------

vi.mock('../electron/main/sectionMerge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/sectionMerge')>()),
  readShapeFromBytes: vi.fn(),
}))

import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDocument } from '../electron/main/documents'
import * as sectionMerge from '../electron/main/sectionMerge'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const DOC = '.sdlc/artifacts/00-discovery/constitution.md'

describe.skipIf(!PLUGIN.available)('opening a document against an older or current plugin', () => {
  let project = ''
  let realRead: typeof sectionMerge.readShapeFromBytes

  beforeEach(async () => {
    project = mkdtempSync(join(tmpdir(), 'studio-contract-'))
    mkdirSync(join(project, '.sdlc', 'artifacts', '00-discovery'), { recursive: true })
    cpSync(join(PLUGIN.scriptsDir, 'tests', 'fixtures', 'documents', 'constitution.md'), join(project, DOC))
    realRead = (await vi.importActual<typeof import('../electron/main/sectionMerge')>(
      '../electron/main/sectionMerge',
    )).readShapeFromBytes
    return () => rmSync(project, { recursive: true, force: true })
  })

  it('does not flag the current plugin', async () => {
    vi.mocked(sectionMerge.readShapeFromBytes).mockImplementation(realRead)
    const doc = await openDocument(project, PLUGIN.scriptsDir, DOC)
    expect(doc.ok, doc.error).toBe(true)
    expect(doc.pluginBehind).toBe(false)
  })

  it('flags an older plugin, whose output is the real output minus the marker it never sent', async () => {
    vi.mocked(sectionMerge.readShapeFromBytes).mockImplementation(async (...args) => {
      const { contract: _sent, ...whatAnOldPluginSent } = await realRead(...args)
      return whatAnOldPluginSent
    })
    const doc = await openDocument(project, PLUGIN.scriptsDir, DOC)
    expect(doc.ok, doc.error).toBe(true)
    expect(doc.pluginBehind).toBe(true)
    // Still fully readable: an old plugin degrades what Studio can offer, it does not break it.
    expect(doc.sections.length).toBeGreaterThan(0)
  })
})
