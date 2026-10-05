import { describe, expect, it } from 'vitest'
import { isAllowlisted, resolveProjectDocument, UnsafePathError } from '../electron/main/projectPaths'

// Spec 0026: the reference-document catalogue and per-document summaries are shared with the rest
// of the team like any other project data. The generated reports are not: they are throwaway pages
// that stay on the computer that made them.
describe('the sync allowlist and the intake catalogue (spec 0026)', () => {
  it.each([
    '.sdlc/context/intake/catalog.json',
    '.sdlc/context/intake/summaries/DOC-001.md',
    '.sdlc/context/intake/index.md',
  ])('allows %s', (path) => {
    expect(isAllowlisted(path)).toBe(true)
    expect(isAllowlisted(path.replace(/\//g, '\\'))).toBe(true)
  })

  it.each([
    '.sdlc/reports/00-discovery-report.html',
    '.sdlc/reports/index.html',
    '.sdlc/reports/',
    '.sdlc/context/intake/',
    '.sdlc/context/intake',
    '.sdlc/context/other/catalog.json',
    '.sdlc/context/intakes/catalog.json',
    'docs/intake/a.md',
  ])('does not allow %s', (path) => {
    expect(isAllowlisted(path)).toBe(false)
  })

  it('still lets the existing frozen-layer folder through', () => {
    expect(isAllowlisted('.sdlc/context/layers/phase0-discovery.md')).toBe(true)
  })

  it('refuses a report page as a project document, since it is not on the list', () => {
    expect(() => resolveProjectDocument('/p', '.sdlc/reports/00-discovery-report.html')).toThrow(UnsafePathError)
  })
})
