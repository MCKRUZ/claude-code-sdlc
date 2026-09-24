import { describe, it, expect } from 'vitest'
import { isAllowlisted } from '../electron/main/sync'

// This is the whole boundary Studio's git layer will ever look at, read, or write — see
// sync.ts's own header comment. Never trusts .gitignore (the plugin's own install_harness.py
// doesn't actually write the ignore lines it documents — a real, separate defect this
// allowlist makes harmless for Studio specifically).
describe('isAllowlisted', () => {
  it.each([
    '.sdlc/artifacts/01-requirements/requirements.md',
    '.sdlc/artifacts/02-design/design-doc.md',
    '.sdlc/state.yaml',
    '.sdlc/decision-log.md',
    '.sdlc/constitution.md',
    '.sdlc/approval-settings.yaml',
    '.sdlc/metrics/loop-events.jsonl',
    '.sdlc/metrics/spec-log.jsonl',
    'specs/0009-studio-repo-sync.md',
    'specs/0001-spec-people-fields.md',
  ])('allows %s', (path) => {
    expect(isAllowlisted(path)).toBe(true)
  })

  it.each([
    'src/main.ts',
    'package.json',
    '.sdlc/versions/objects/ab/abcdef0123456789',
    '.sdlc/refresh/foo/candidates.json',
    '.git/config',
    '.gitignore',
    '.env',
    'README.md',
    '.sdlc/team.yaml', // deliberately not in the allowlist — the roster is not a document
  ])('refuses %s', (path) => {
    expect(isAllowlisted(path)).toBe(false)
  })

  it('normalizes Windows backslashes before matching', () => {
    expect(isAllowlisted('.sdlc\\artifacts\\01-requirements\\requirements.md')).toBe(true)
    expect(isAllowlisted('specs\\0009-studio-repo-sync.md')).toBe(true)
  })

  it('does not allow a path that merely starts similarly', () => {
    expect(isAllowlisted('.sdlc-backup/state.yaml')).toBe(false)
    expect(isAllowlisted('specsfile.md')).toBe(false)
  })
})
