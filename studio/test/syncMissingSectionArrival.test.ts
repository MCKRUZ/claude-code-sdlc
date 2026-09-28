/** A remote-added section must never be silently lost.
 *
 * Found by the PR's own correctness review: partial matching (a document missing a required
 * section still reads as sections) removed the whole-file-clash fail-safe for a document whose
 * local copy never had a section at all. When a teammate adds that section and pushes, the
 * silent per-section merge computed the right value (take remote's new content, since local
 * never touched it) — but had no LOCAL SPAN to splice it into, and silently skipped the write
 * while still advancing the shared ancestor to the remote's hash. Studio then believed the two
 * sides agreed. The very next save — no further edit needed — pushed local's file, still
 * missing the section, straight over the remote, deleting it for everyone.
 *
 * The fix: a silently-resolved change that has nowhere to be written falls the whole document
 * back to a whole-file clash — the one resolution path that never needs a span, because a
 * choice replaces the entire file. Nothing is ever written, or the ancestor advanced, without
 * the person actually choosing a version.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { initSettingsPath } from '../electron/main/settings'
import { getPendingClashes, pull, resolveClash, save } from '../electron/main/sync'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const DOC = '.sdlc/artifacts/00-discovery/success-criteria.md'

const BASE = `# Success Criteria

Some context before the sections begin.

## Measurable Success Dimensions

### Dimension 1: Something measurable

**What we're measuring:** a thing.

| Outcome | Threshold | How We'll Measure |
|---|---|---|
| Pass | 95% | Compare against the pilot log |
| Fail | Below 80% | Same comparison |
`

const LOCAL_EDIT = BASE.replace(
  'Some context before the sections begin.',
  'Some context before the sections begin, expanded.',
)

const WITH_NEW_SECTION = `${BASE}
## Non-Negotiable Requirements

- [ ] Every call is attributed to a person
`

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
const made: string[] = []

/** Both sides differ from the shared ancestor: locally, an edit far from where the new section
 * lands; on the remote, a whole new required section this local copy has never recognized at
 * all. An unedited local file takes a different, always-safe whole-file shortcut that isn't
 * what this scenario tests — the defect only shows up once the per-section merge path runs. */
async function scenario() {
  const ws = mkdtempSync(join(tmpdir(), 'studio-missing-section-'))
  made.push(ws)
  initSettingsPath(join(ws, 'userData'))
  const origin = join(ws, 'origin.git')
  const project = join(ws, 'project')
  git(['init', '--bare', '--initial-branch=main', origin], ws)
  git(['clone', origin, project], ws)
  git(['config', 'user.email', 'me@example.com'], project)
  git(['config', 'user.name', 'Me'], project)
  execFileSync(PLUGIN.python, [
    join(PLUGIN.scriptsDir, 'init_project.py'),
    '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
    '--target', project,
  ], { cwd: PLUGIN.scriptsDir })
  writeFileSync(join(project, DOC), BASE)
  git(['add', '-A'], project)
  git(['commit', '-m', 'initial project, missing Non-Negotiable Requirements'], project)
  git(['push', '-u', 'origin', 'main'], project)

  // Studio's own baseline pull — establishes the shared ancestor this session's merges compare against.
  expect((await pull(project, PLUGIN.scriptsDir)).ok).toBe(true)

  writeFileSync(join(project, DOC), LOCAL_EDIT)

  // A teammate adds the section nobody locally has ever had, and pushes it.
  const teammate = join(ws, 'teammate')
  git(['clone', origin, teammate], ws)
  git(['config', 'user.email', 'them@example.com'], teammate)
  git(['config', 'user.name', 'Them'], teammate)
  writeFileSync(join(teammate, DOC), WITH_NEW_SECTION)
  git(['commit', '-am', 'add Non-Negotiable Requirements'], teammate)
  git(['push'], teammate)

  return { ws, project, origin }
}

afterAll(() => {
  for (const ws of made) rmSync(ws, { recursive: true, force: true })
})

describe.skipIf(!PLUGIN.available)('a section the local copy never had, added by a teammate', () => {
  it('is never written without the person choosing a version, and the pull says so', async () => {
    const s = await scenario()
    const result = await pull(s.project, PLUGIN.scriptsDir)
    expect(result.ok, result.error).toBe(true)
    expect(result.clashes.map((c) => c.path)).toEqual([DOC])

    // The local file is exactly what was on disk before the pull — nothing silently applied.
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toBe(LOCAL_EDIT)
  }, 180_000)

  it('the clash screen has something to open for it', async () => {
    const s = await scenario()
    await pull(s.project, PLUGIN.scriptsDir)
    const pending = await getPendingClashes(s.project, PLUGIN.scriptsDir)
    const clash = pending.find((c) => c.path === DOC)
    expect(clash, 'the new section vanished with no clash raised for it').toBeDefined()
    expect(clash!.sections[0].remoteText).toContain('Non-Negotiable Requirements')
  }, 180_000)

  it('refuses to save while it is unresolved, so it can never reach the remote by accident', async () => {
    const s = await scenario()
    await pull(s.project, PLUGIN.scriptsDir)
    const saved = await save(s.project, PLUGIN.scriptsDir, 'try', { actor: 'me' })
    expect(saved.ok).toBe(false)
    expect(saved.error).toMatch(/clash|resolve/i)

    // And the remote — the thing a silent loss would have overwritten — still has it.
    git(['fetch', 'origin'], s.project)
    expect(git(['show', 'origin/main:' + DOC], s.project)).toContain('Non-Negotiable Requirements')
  }, 180_000)

  it('choosing theirs brings the new section into the local file, and it reaches the remote', async () => {
    const s = await scenario()
    await pull(s.project, PLUGIN.scriptsDir)
    const [clash] = await getPendingClashes(s.project, PLUGIN.scriptsDir)

    const r = await resolveClash(s.project, PLUGIN.scriptsDir, DOC, clash.sections[0].key, 'remote', undefined)
    expect(r.ok, r.error).toBe(true)
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toContain('Non-Negotiable Requirements')

    const saved = await save(s.project, PLUGIN.scriptsDir, 'take theirs', { actor: 'me' })
    expect(saved.ok, saved.error).toBe(true)
    git(['fetch', 'origin'], s.project)
    expect(git(['show', 'origin/main:' + DOC], s.project)).toContain('Non-Negotiable Requirements')
  }, 180_000)
})
