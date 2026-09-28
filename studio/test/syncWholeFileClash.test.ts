/** A clash Studio reports must be a clash it can resolve.
 *
 * Found on a real project: the header said "4 sections need your input" and nothing anywhere let
 * the person give any. When a file exists on both sides and differs, and Studio has no shared
 * starting point for it — or it is not a document the plugin can read section by section — the
 * pull reported a whole-file clash but never saved it. The pill counted it; the clash screen,
 * which reads what was saved, found nothing and never opened; the next pull found the same clash
 * again. And save() refuses while a clash is reported, so that file could never be saved from
 * Studio at all.
 *
 * Tested against a real git remote and a second clone playing the teammate, because only a real
 * remote proves the resolved version is what the next person receives.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { initSettingsPath } from '../electron/main/settings'
import { getPendingClashes, onSyncState, pull, resolveClash, save } from '../electron/main/sync'
import type { SyncState } from '../shared/types'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const DOC = '.sdlc/decision-log.md'
const BASE = '# Decisions\n\nD-01 settled.\n'
const LOCAL = '# Decisions\n\nD-01 settled.\nD-02 my local decision, not yet pushed.\n'
const REMOTE = '# Decisions\n\nD-01 settled.\nD-03 a teammate decided this.\n'

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()

interface Scenario { ws: string; project: string; origin: string }
const made: string[] = []

/** A project whose decision log differs from the remote's. With `baseline` Studio has already
 * synced once, so the file has a shared starting point; without it, Studio has never seen the
 * two sides agree — the case from the real project. */
async function scenario(baseline: boolean): Promise<Scenario> {
  const ws = mkdtempSync(join(tmpdir(), 'studio-clash-'))
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
  mkdirSync(join(project, '.sdlc'), { recursive: true })
  writeFileSync(join(project, DOC), BASE)
  git(['add', '-A'], project)
  git(['commit', '-m', 'initial project'], project)
  git(['push', '-u', 'origin', 'main'], project)

  if (baseline) expect((await pull(project, PLUGIN.scriptsDir)).ok).toBe(true)

  const teammate = join(ws, 'teammate')
  git(['clone', origin, teammate], ws)
  git(['config', 'user.email', 'them@example.com'], teammate)
  git(['config', 'user.name', 'Them'], teammate)
  writeFileSync(join(teammate, DOC), REMOTE)
  git(['commit', '-am', 'teammate decides D-03'], teammate)
  git(['push'], teammate)

  writeFileSync(join(project, DOC), LOCAL) // my own, unpushed edit
  return { ws, project, origin }
}

afterAll(() => {
  for (const ws of made) rmSync(ws, { recursive: true, force: true })
})

const remoteText = (s: Scenario) => {
  git(['fetch', 'origin'], s.project)
  return git(['show', `origin/main:${DOC}`], s.project) + '\n'
}

describe.skipIf(!PLUGIN.available)('a file both sides changed that Studio has no shared history for', () => {
  it('is reported by the pull AND saved, so the clash screen has something to open', async () => {
    const s = await scenario(false)
    const result = await pull(s.project, PLUGIN.scriptsDir)
    expect(result.ok, result.error).toBe(true)
    expect(result.clashes.map((c) => c.path)).toEqual([DOC])

    const pending = await getPendingClashes(s.project, PLUGIN.scriptsDir)
    expect(pending.map((c) => c.path), 'the pill counted a clash the screen could not show').toEqual([DOC])
    expect(pending[0].sections[0].localText).toBe(LOCAL)
    expect(pending[0].sections[0].remoteText).toBe(REMOTE)
  }, 180_000)

  it('refuses to save while it is unresolved, and says why', async () => {
    const s = await scenario(false)
    await pull(s.project, PLUGIN.scriptsDir)
    const saved = await save(s.project, PLUGIN.scriptsDir, 'try', { onlyPath: DOC, actor: 'me' })
    expect(saved.ok).toBe(false)
    expect(saved.error).toMatch(/clash|resolve/i)
  }, 180_000)

  it('keeps my version when I choose mine, clears the clash, and then saves it to the remote', async () => {
    const s = await scenario(false)
    await pull(s.project, PLUGIN.scriptsDir)

    const r = await resolveClash(s.project, PLUGIN.scriptsDir, DOC, '__whole_file__', 'local', undefined)
    expect(r.ok, r.error).toBe(true)
    expect(r.fileFullyResolved).toBe(true)
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toBe(LOCAL)
    expect(await getPendingClashes(s.project, PLUGIN.scriptsDir)).toEqual([])

    const saved = await save(s.project, PLUGIN.scriptsDir, 'keep my decisions', { onlyPath: DOC, actor: 'me' })
    expect(saved.ok, saved.error).toBe(true)
    expect(remoteText(s)).toBe(LOCAL)
  }, 180_000)

  it('replaces my file with theirs only when I choose theirs', async () => {
    const s = await scenario(false)
    await pull(s.project, PLUGIN.scriptsDir)
    const r = await resolveClash(s.project, PLUGIN.scriptsDir, DOC, '__whole_file__', 'remote', undefined)
    expect(r.ok, r.error).toBe(true)
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toBe(REMOTE)
  }, 180_000)

  it('writes the combined text when I combine the two', async () => {
    const s = await scenario(false)
    await pull(s.project, PLUGIN.scriptsDir)
    const combined = '# Decisions\n\nD-01 settled.\nD-02 mine.\nD-03 theirs.\n'
    const r = await resolveClash(s.project, PLUGIN.scriptsDir, DOC, '__whole_file__', 'combined', combined)
    expect(r.ok, r.error).toBe(true)
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toBe(combined)
  }, 180_000)

  it('never loses my edit while the clash is waiting for me', async () => {
    const s = await scenario(false)
    await pull(s.project, PLUGIN.scriptsDir)
    await pull(s.project, PLUGIN.scriptsDir) // a background pull while I decide
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toBe(LOCAL)
  }, 180_000)
})

describe.skipIf(!PLUGIN.available)('a document the plugin cannot read section by section', () => {
  it('is saved as a clash when both sides changed it after Studio had synced it once', async () => {
    const s = await scenario(true)
    const result = await pull(s.project, PLUGIN.scriptsDir)
    expect(result.clashes.map((c) => c.path)).toEqual([DOC])
    const pending = await getPendingClashes(s.project, PLUGIN.scriptsDir)
    expect(pending.map((c) => c.path)).toEqual([DOC])

    const r = await resolveClash(s.project, PLUGIN.scriptsDir, DOC, '__whole_file__', 'local', undefined)
    expect(r.ok, r.error).toBe(true)
    expect(readFileSync(join(s.project, DOC), 'utf-8')).toBe(LOCAL)
  }, 180_000)
})

describe.skipIf(!PLUGIN.available)('the sync indicator', () => {
  it('keeps counting a clash that is still waiting, instead of flipping to "synced"', async () => {
    const s = await scenario(false)
    const seen: SyncState[] = []
    const off = onSyncState((st) => seen.push(st))
    try {
      await pull(s.project, PLUGIN.scriptsDir)
      await pull(s.project, PLUGIN.scriptsDir) // the file is now frozen; this pull finds it already pending
    } finally { off() }
    const last = seen[seen.length - 1]
    expect(last.kind).toBe('clashes')
    expect(last.kind === 'clashes' && last.count).toBe(1)
  }, 180_000)

  it('clears itself when the two sides come to agree while the clash is waiting', async () => {
    const s = await scenario(false)
    await pull(s.project, PLUGIN.scriptsDir)
    writeFileSync(join(s.project, DOC), REMOTE) // I took their version by hand
    expect(await getPendingClashes(s.project, PLUGIN.scriptsDir)).toEqual([])

    const seen: SyncState[] = []
    const off = onSyncState((st) => seen.push(st))
    try { await pull(s.project, PLUGIN.scriptsDir) } finally { off() }
    expect(seen[seen.length - 1].kind).toBe('idle')
  }, 180_000)
})
