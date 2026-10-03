import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureDocumentFromTemplate } from '../electron/main/documents'

// Spec 0024: an activity starts documents that live in sub-folders of a stage
// (`02-design/data/data-contract.md`) and a review report that shares ONE template across every
// phase. The single-level behaviour is pinned, unmodified, by ensureDocument.test.ts.

const DATA = '.sdlc/artifacts/02-design/data/data-contract.md'
const REVIEW = '.sdlc/artifacts/02-design/review-report.md'

describe('ensureDocumentFromTemplate — nested paths and the shared review report', () => {
  let root: string
  let project: string
  let scriptsDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ensure-nested-'))
    project = join(root, 'project')
    scriptsDir = join(root, 'plugin', 'scripts')
    mkdirSync(project, { recursive: true })
    mkdirSync(scriptsDir, { recursive: true })
    mkdirSync(join(root, 'plugin', 'templates', 'phases', '02-design', 'data'), { recursive: true })
    writeFileSync(join(root, 'plugin', 'templates', 'phases', '02-design', 'data', 'data-contract.md'), '# Data contract\n')
    writeFileSync(join(root, 'plugin', 'templates', 'review-report.md'), '# Review report\n')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('starts a document in a nested folder from the template that mirrors the path', () => {
    expect(ensureDocumentFromTemplate(project, scriptsDir, DATA)).toEqual({ ok: true, created: true })
    expect(readFileSync(join(project, DATA), 'utf-8')).toBe('# Data contract\n')
  })

  it('maps a review report in any phase to the one shared template', () => {
    expect(ensureDocumentFromTemplate(project, scriptsDir, REVIEW)).toEqual({ ok: true, created: true })
    expect(readFileSync(join(project, REVIEW), 'utf-8')).toBe('# Review report\n')
  })

  it('leaves an existing nested document exactly as it is', () => {
    mkdirSync(join(project, '.sdlc', 'artifacts', '02-design', 'data'), { recursive: true })
    writeFileSync(join(project, DATA), '# Mine\n')
    expect(ensureDocumentFromTemplate(project, scriptsDir, DATA)).toEqual({ ok: true, created: false })
    expect(readFileSync(join(project, DATA), 'utf-8')).toBe('# Mine\n')
  })

  it.each([
    ['a ".." segment inside the stage', '.sdlc/artifacts/02-design/../../../escape.md'],
    ['a "." segment', '.sdlc/artifacts/02-design/./data/data-contract.md'],
    ['a path outside .sdlc/artifacts', 'docs/02-design/data/data-contract.md'],
    ['an empty segment', '.sdlc/artifacts/02-design//data-contract.md'],
    ['a file with no stage folder', '.sdlc/artifacts/data-contract.md'],
  ])('refuses %s and writes nothing', (_name, rel) => {
    const result = ensureDocumentFromTemplate(project, scriptsDir, rel)
    expect(result.ok).toBe(false)
    expect(existsSync(join(project, '.sdlc', 'artifacts', '02-design', 'data'))).toBe(false)
    expect(existsSync(join(root, 'escape.md'))).toBe(false)
  })

  it('says there is no template, and writes nothing, for a nested path the plugin does not have', () => {
    const result = ensureDocumentFromTemplate(project, scriptsDir, '.sdlc/artifacts/02-design/data/other.md')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no template/i)
    expect(existsSync(join(project, '.sdlc', 'artifacts', '02-design', 'data', 'other.md'))).toBe(false)
  })
})
