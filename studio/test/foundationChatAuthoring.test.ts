/** The path a chat proposal takes for a Foundation document nobody has started yet, against the
 * plugin's real templates, real shape files and real shape library — not mocks.
 *
 * Reported from a real project: a person answered Foundation's questions in the chat and
 * `foundation-report.md` stayed "Not started yet". Two independent things stood in the way —
 * the file did not exist and nothing would create it, and no Foundation template had a shape,
 * so even an existing file refused field writes ("no usable shape"). Either alone is enough to
 * stop it; this proves both are gone together. */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCommand } from '../electron/main/commandRunner'
import { ensureDocumentFromTemplate, openDocument, setField } from '../electron/main/documents'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const REPORT = '.sdlc/artifacts/03-foundation/foundation-report.md'
const HANDOFF = '.sdlc/artifacts/03-foundation/build-handoff.md'

describe.skipIf(!PLUGIN.available)('Foundation documents authored through chat, against the real plugin', () => {
  let project = ''

  beforeAll(async () => {
    project = mkdtempSync(join(tmpdir(), 'studio-foundation-'))
    const init = await runCommand(PLUGIN.python, [
      join(PLUGIN.scriptsDir, 'init_project.py'),
      '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], PLUGIN.scriptsDir)
    expect(init.ok, init.stderr).toBe(true)
  }, 120_000)

  afterAll(() => rmSync(project, { recursive: true, force: true }))

  it.each([REPORT, HANDOFF])('%s: starts from its template, reads as a shaped document, and takes a field write', async (rel) => {
    expect(existsSync(join(project, rel))).toBe(false) // CONTROL: a blank project really has neither

    expect(ensureDocumentFromTemplate(project, PLUGIN.scriptsDir, rel)).toEqual({ ok: true, created: true })

    const opened = await openDocument(project, PLUGIN.scriptsDir, rel)
    expect(opened.ok, opened.error).toBe(true)
    expect(opened.shaped).toBe(true)
    const section = opened.sections.find((s) => s.kind === 'section' && Object.keys(s.fields).length > 0)!
    const [label] = Object.keys(section.fields)

    const written = await setField(project, PLUGIN.scriptsDir, rel, section.key, label, 'Written through the chat.\n')
    expect(written.ok, written.error).toBe(true)
    expect(readFileSync(join(project, rel), 'utf-8')).toContain('Written through the chat.')
  }, 60_000)

  it('a second start leaves what was written alone', async () => {
    expect(ensureDocumentFromTemplate(project, PLUGIN.scriptsDir, REPORT)).toEqual({ ok: true, created: false })
    expect(readFileSync(join(project, REPORT), 'utf-8')).toContain('Written through the chat.')
  })
})
