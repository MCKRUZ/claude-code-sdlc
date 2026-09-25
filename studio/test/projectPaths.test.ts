/** The path boundary: what Studio may touch, and where it is allowed to end up.
 *
 * Spec 0010's security pass found the gap these tests close. The allowlist answered a
 * question about the path STRING and nothing answered the question about the path's real
 * DESTINATION — so a repository could check in a document that was really a link to a private
 * key, and every ordinary read followed it.
 *
 * The link cases create real symlinks, which Windows refuses without Developer Mode or
 * elevation. They skip themselves rather than fail there — a skipped test says "unproven on
 * this machine", which is honest, where a silently-passing one would say "proven" and be
 * wrong. They still run on macOS and Linux, which is where git materializes links by default
 * and therefore where the attack actually lands.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  UnsafePathError, isAllowlisted, isSafeInProject, resolveInProject, resolveProjectDocument,
} from '../electron/main/projectPaths'

// Built at module scope, NOT in beforeAll: `skipIf` is evaluated when the tests are collected,
// which happens first, so a flag set in beforeAll is still false by then and every link case
// silently skips on a machine that can create links perfectly well. That is the worst outcome
// available here — the suite reports "skipped", nobody looks, and the check goes unproven.
const base = mkdtempSync(join(tmpdir(), 'studio-paths-'))
const project = join(base, 'project')
const outside = join(base, 'outside')

mkdirSync(join(project, '.sdlc', 'artifacts'), { recursive: true })
mkdirSync(outside, { recursive: true })
writeFileSync(join(outside, 'secret.txt'), 'a private key')
writeFileSync(join(project, '.sdlc', 'artifacts', 'real.md'), '# real')

const canSymlink = (() => {
  try {
    symlinkSync(join(outside, 'secret.txt'), join(project, '.sdlc', 'artifacts', 'linked.md'))
    return true
  } catch {
    return false
  }
})()

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('isAllowlisted', () => {
  it('accepts every file a settings change has to reach', () => {
    // Spec 0012 edits all three, and requires each change to arrive as an ordinary commit.
    // A settings file missing from this list can be read but never synced — so an edit would
    // sit on one person's machine looking saved.
    expect(isAllowlisted('.sdlc/team.yaml')).toBe(true)
    expect(isAllowlisted('.sdlc/approval-settings.yaml')).toBe(true)
    expect(isAllowlisted('.sdlc/artifacts/03-foundation/cadence-plan.md')).toBe(true)
  })

  it('accepts the documents Studio edits', () => {
    expect(isAllowlisted('.sdlc/artifacts/01-requirements/requirements.md')).toBe(true)
    expect(isAllowlisted('specs/0010-studio-documents.md')).toBe(true)
    expect(isAllowlisted('.sdlc/state.yaml')).toBe(true)
  })

  it('rejects everything else, including things that merely look close', () => {
    expect(isAllowlisted('.git/config')).toBe(false)
    expect(isAllowlisted('package.json')).toBe(false)
    expect(isAllowlisted('notspecs/x.md')).toBe(false)
    expect(isAllowlisted('.sdlc/artifacts')).toBe(false)
  })

  it('treats backslashes as separators, so a Windows-shaped path is judged the same way', () => {
    expect(isAllowlisted('.sdlc\\artifacts\\01-requirements\\requirements.md')).toBe(true)
  })
})

describe('resolveInProject', () => {
  it('allows an ordinary document inside the project', () => {
    expect(resolveInProject(project, '.sdlc/artifacts/real.md')).toContain('real.md')
  })

  it('allows a path that does not exist yet — a pull creates files', () => {
    expect(resolveInProject(project, '.sdlc/artifacts/new/deeper/not-there-yet.md')).toBeTruthy()
  })

  it('refuses a path that climbs out of the project', () => {
    expect(() => resolveInProject(project, '../outside/secret.txt')).toThrow(UnsafePathError)
    expect(() => resolveInProject(project, '.sdlc/../../outside/secret.txt')).toThrow(UnsafePathError)
  })

  it.skipIf(!canSymlink)('refuses a document that is really a link elsewhere', () => {
    expect(() => resolveInProject(project, '.sdlc/artifacts/linked.md')).toThrow(UnsafePathError)
  })

  it.skipIf(!canSymlink)('says so as a yes/no too, for the paths that skip rather than fail', () => {
    expect(isSafeInProject(project, '.sdlc/artifacts/linked.md')).toBe(false)
    expect(isSafeInProject(project, '.sdlc/artifacts/real.md')).toBe(true)
  })
})

describe('resolveProjectDocument', () => {
  it('requires BOTH answers — the right kind of file, in the right place', () => {
    expect(resolveProjectDocument(project, '.sdlc/artifacts/real.md')).toContain('real.md')
    // In the project, but not a document Studio edits.
    expect(() => resolveProjectDocument(project, '.git/config')).toThrow(UnsafePathError)
    // Shaped like a document Studio edits, but not in the project.
    expect(() => resolveProjectDocument(project, '../outside/specs/x.md')).toThrow(UnsafePathError)
  })
})
