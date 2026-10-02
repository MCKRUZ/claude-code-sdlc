import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureDocumentFromTemplate } from '../electron/main/documents'

// A chat proposal for a document nobody has started yet used to fail outright ("not found"):
// nothing in Studio created a document from its template, so a stage whose documents are
// authored through chat could never write its first one.

const TEMPLATE = '# Foundation Report\n\n## Infrastructure\n\n- [ ] Dev environment provisioned\n'
const REL = '.sdlc/artifacts/03-foundation/foundation-report.md'

describe('ensureDocumentFromTemplate', () => {
  let root: string
  let project: string
  let scriptsDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ensure-doc-'))
    project = join(root, 'project')
    scriptsDir = join(root, 'plugin', 'scripts')
    mkdirSync(project, { recursive: true })
    mkdirSync(scriptsDir, { recursive: true })
    mkdirSync(join(root, 'plugin', 'templates', 'phases', '03-foundation'), { recursive: true })
    writeFileSync(join(root, 'plugin', 'templates', 'phases', '03-foundation', 'foundation-report.md'), TEMPLATE)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('creates a missing document from the template that mirrors its path, byte for byte', () => {
    const result = ensureDocumentFromTemplate(project, scriptsDir, REL)
    expect(result).toEqual({ ok: true, created: true })
    expect(readFileSync(join(project, REL), 'utf-8')).toBe(TEMPLATE)
  })

  it('creates the missing artifact folder too (a stage nobody has written to yet has none)', () => {
    expect(existsSync(join(project, '.sdlc', 'artifacts'))).toBe(false)
    expect(ensureDocumentFromTemplate(project, scriptsDir, REL).ok).toBe(true)
    expect(existsSync(join(project, REL))).toBe(true)
  })

  it('never touches a document that already exists — a person\'s work is not reset to the template', () => {
    mkdirSync(join(project, '.sdlc', 'artifacts', '03-foundation'), { recursive: true })
    writeFileSync(join(project, REL), '# Mine\n\nreal content\n')
    const result = ensureDocumentFromTemplate(project, scriptsDir, REL)
    expect(result).toEqual({ ok: true, created: false })
    expect(readFileSync(join(project, REL), 'utf-8')).toBe('# Mine\n\nreal content\n')
  })

  it('says so, and creates nothing, when the plugin has no template for that document', () => {
    const result = ensureDocumentFromTemplate(project, scriptsDir, '.sdlc/artifacts/03-foundation/not-a-real-doc.md')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no template/i)
    expect(existsSync(join(project, '.sdlc', 'artifacts', '03-foundation', 'not-a-real-doc.md'))).toBe(false)
  })

  it('refuses a path outside the project\'s editable documents, before looking at any template', () => {
    const result = ensureDocumentFromTemplate(project, scriptsDir, '../outside.md')
    expect(result.ok).toBe(false)
  })

  it('does not let a ".." folder segment reach a template outside templates/phases', () => {
    mkdirSync(join(root, 'plugin', 'templates'), { recursive: true })
    writeFileSync(join(root, 'plugin', 'templates', 'frozen-layer.md'), 'not a phase template')
    const result = ensureDocumentFromTemplate(project, scriptsDir, '.sdlc/artifacts/../frozen-layer.md')
    expect(result.ok).toBe(false)
    expect(existsSync(join(project, '.sdlc', 'frozen-layer.md'))).toBe(false)
  })

  it('refuses a document outside .sdlc/artifacts (specs are scaffolded by their own command, not copied from a template here)', () => {
    const result = ensureDocumentFromTemplate(project, scriptsDir, 'specs/0001-x.md')
    expect(result.ok).toBe(false)
  })
})
