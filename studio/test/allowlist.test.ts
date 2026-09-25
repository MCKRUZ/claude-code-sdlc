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
    // REVERSED for spec 0012, deliberately. This file previously asserted the roster was
    // refused, on the reasoning that "the roster is not a document" — which was true when
    // nothing could change it. Spec 0012's settings screen edits people and teams and
    // requires that change to reach the repository as an ordinary commit, so the question
    // this list answers is not "is it a document" but "may Studio change and commit it".
    // The roster now is. Left excluded, an edit would have sat on one person's machine
    // looking saved.
    '.sdlc/team.yaml',
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
