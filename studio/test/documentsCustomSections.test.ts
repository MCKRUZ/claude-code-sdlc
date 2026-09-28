/** A document that has drifted from its template must stay editable, against the REAL plugin
 * scripts — not a mock of them.
 *
 * Two things a person does to a document that used to throw all of it back to raw text:
 * trims a section the template has, and adds one the template never had. The first is the
 * costly one: every section of a template is now in its shape, so before the shape library
 * learned that an optional section may be absent, deleting any of them un-shaped the whole
 * document. The second used to leave the added section as unstyled markdown.
 *
 * Skipped, not failed, only where `requirePlugin` says no plugin checkout is available.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDocument, setField } from '../electron/main/documents'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const SCRIPTS_DIR = PLUGIN.scriptsDir
const DOC = '.sdlc/artifacts/00-discovery/problem-statement.md'

describe.skipIf(!PLUGIN.available)('a document that has drifted from its template', () => {
  let project = ''
  let original = ''

  const write = (text: string) => writeFileSync(join(project, DOC), text, 'utf-8')

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'studio-custom-'))
    mkdirSync(join(project, '.sdlc', 'artifacts', '00-discovery'), { recursive: true })
    cpSync(join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'problem-statement.md'), join(project, DOC))
    original = readFileSync(join(project, DOC), 'utf-8')
  })

  afterEach(() => {
    if (project) rmSync(project, { recursive: true, force: true })
  })

  it('stays field-editable when an optional section is trimmed away', async () => {
    const trimmed = original.replace(/^## Opportunity Statement[\s\S]*?(?=^## |(?![\s\S]))/m, '')
    expect(trimmed).not.toBe(original) // the section really was there to remove
    write(trimmed)

    const doc = await openDocument(project, SCRIPTS_DIR, DOC)
    expect(doc.ok, doc.error).toBe(true)
    expect(doc.shaped, `fell back to raw text: ${doc.warnings.join('; ')}`).toBe(true)
    expect(doc.sections.some((s) => s.heading === 'Opportunity Statement')).toBe(false)
  })

  it('shows a section the person added as an editable section, not raw text', async () => {
    write(`${original.trimEnd()}\n\n## Stakeholder Quotes\n\n> We lose a day a week.\n`)

    const doc = await openDocument(project, SCRIPTS_DIR, DOC)
    expect(doc.shaped, `fell back to raw text: ${doc.warnings.join('; ')}`).toBe(true)

    const added = doc.sections.find((s) => s.heading === 'Stakeholder Quotes')
    expect(added, 'the added section should be its own section').toBeDefined()
    expect(added!.kind).toBe('section')
    expect(added!.custom).toBe(true)
    expect(added!.fields.Content?.type).toBe('longtext')
    expect(added!.fields.Content?.value).toContain('We lose a day a week.')
  })

  it('saves an edit to an added section without touching the rest of the document', async () => {
    const withAdded = `${original.trimEnd()}\n\n## Stakeholder Quotes\n\n> We lose a day a week.\n`
    write(withAdded)

    const result = await setField(project, SCRIPTS_DIR, DOC, 'Stakeholder Quotes', 'Content', '> Two days, actually.\n')
    expect(result.ok, result.error).toBe(true)

    const after = readFileSync(join(project, DOC), 'utf-8')
    expect(after).toBe(withAdded.replace('> We lose a day a week.\n', '> Two days, actually.\n'))
    // Everything above the added section is byte-for-byte what it was.
    expect(after.startsWith(original.trimEnd())).toBe(true)
  })

  it('still shows the sections that ARE there when a REQUIRED section is missing, and names the gap', async () => {
    // A document missing a required section used to be thrown back to raw text as a whole. Every
    // section that is found was found by its heading, so it is shown; the missing one is reported.
    const stripped = original.replace(/^## Executive Summary[\s\S]*?(?=^## )/m, '')
    expect(stripped).not.toBe(original)
    write(stripped)

    const doc = await openDocument(project, SCRIPTS_DIR, DOC)
    expect(doc.ok, doc.error).toBe(true)
    expect(doc.shaped).toBe(true)
    expect(doc.warnings.join(' ')).toContain('Executive Summary')
    expect(doc.sections.filter((s) => s.kind === 'section').length).toBeGreaterThan(1)
  })

  it('reads a document in which NOTHING is recognized as plain text', async () => {
    write('# A note\n\n## Totally Unrelated\n\nhello\n')

    const doc = await openDocument(project, SCRIPTS_DIR, DOC)
    expect(doc.ok, doc.error).toBe(true)
    expect(doc.shaped).toBe(false)
    expect(doc.warnings.join(' ')).toContain('Executive Summary')
  })
})
