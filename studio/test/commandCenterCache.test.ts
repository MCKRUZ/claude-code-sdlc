/** The command center's cache mechanics (togo-command-center.md §2.3; Q4): one in-flight fan-out
 * per project and window (a prefetch on open and the renderer's first read share the spawns);
 * an invalidation drops the in-flight read too, so nothing started before a write is handed out
 * as fresh after it; `warmCommandCenter` is a no-op for a project never read; the document's
 * stamp is its STALEST block — a cache hit never reads "as of now". */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))

import {
  getCommandCenter, invalidateCommandCenter, oldestFetchedAt, prefetchCommandCenter, warmCommandCenter,
} from '../electron/main/commandCenter'
import { runPluginScript } from '../electron/main/project'
import type { ConsoleEntry } from '../shared/types'

const run = vi.mocked(runPluginScript)
const SCRIPTS = '/plugin/scripts'
const entry = (stdout: string, exitCode = 0): ConsoleEntry => ({ id: 'x', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode, stdout, stderr: '', ok: exitCode === 0 })
const json = (v: unknown) => entry(JSON.stringify(v))

const STATUS = { sprint: null, slate: [], readiness: { ready: 0, total: 0, gaps: [] }, verdicts_pending: [], handoffs_open: [], mix: {}, mix_warnings: [], wip: { in_flight: 0, cap: null }, build_order: [], next_up: null, dependency_gaps: [], decisions: null, carried_in: [], has_data: false, note: 'no sprint' }
const ALL = { code_host_available: false, error: null, specs: [], host: 'none' }
const TRACK = { total: 0, by_status: {}, in_flight: [], wip_by_team: {}, sprint_filter: null, warnings: [] }
const DECISIONS = { total: 0, open: 0, overdue: 0, clock_business_days: 2, open_decisions: [], overdue_decisions: [], log_path: 'p', exists: false }

let project = ''
/** A plugin whose every answer waits on `release()` — so two callers can be in flight at once. */
let release: () => void = () => {}
function plugin(slow = false) {
  const gate = new Promise<void>((resolve) => { release = resolve })
  run.mockImplementation(async (_dir, script, args) => {
    if (slow) await gate
    switch (script) {
      case 'generate_status.py': return json({ project_name: 'p', current_phase: { id: 'build' }, stages: [], capabilities: ['sprint-status'] })
      case 'sprint.py': return args[0] === 'status' ? json(STATUS) : entry('', 1)
      case 'spec_status.py': return json(ALL)
      case 'track_specs.py': return json(TRACK)
      case 'track_decisions.py': return json(DECISIONS)
      case 'record_findings.py': return json({ tracked: 0, open_debt: 0, fixed_claim_mismatches: 0 })
      case 'scorecard.py': return json({ accepted_as_is_rate: null, review_wait_median_hours: null, rework_revert_rate: null, bounce_back_rate: null, dora: {} })
      case 'project_settings.py': return json({ ok: true, roster: { present: false, people: [], teams: [] } })
    }
    return entry('', 2)
  })
}
const statusCalls = () => run.mock.calls.filter((c) => c[1] === 'sprint.py' && c[2][0] === 'status').length

beforeEach(() => {
  run.mockReset()
  project = mkdtempSync(join(tmpdir(), 'cc-cache-'))
  mkdirSync(join(project, '.sdlc'))
  writeFileSync(join(project, '.sdlc', 'state.yaml'), 'current_phase: build\n')
  invalidateCommandCenter(project, 'all')
})
afterEach(() => {
  vi.useRealTimers()
  // Windows reported EBUSY on the rmdir while a just-finished child still held the directory;
  // retry briefly and never fail a test on a temp-dir cleanup.
  try { rmSync(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) } catch { /* temp dir left behind — untidy, not a failure */ }
})

describe('one fan-out at a time', () => {
  it('a second caller joins the in-flight read: the same promise, one set of spawns', async () => {
    plugin(true)
    const a = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    const b = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(b).toBe(a)
    release()
    const [da, db] = await Promise.all([a, b])
    expect(db).toBe(da)
    expect(statusCalls()).toBe(1)
  })

  it('the prefetch on open IS the renderer\'s first read: it joins, and the cache serves the next one', async () => {
    plugin(true)
    const warm = prefetchCommandCenter(project, SCRIPTS)
    const first = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    release()
    await Promise.all([warm, first])
    expect(statusCalls()).toBe(1)
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(statusCalls()).toBe(1)
  })

  it('a different window is a different read (`--since` differs), never a join', async () => {
    plugin()
    const a = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    const b = getCommandCenter(project, SCRIPTS, 3, { actor: null })
    expect(b).not.toBe(a)
    await Promise.all([a, b])
  })

  it('the entry is released when the read settles, so a later call after invalidation is fresh', async () => {
    plugin()
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    invalidateCommandCenter(project)
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(statusCalls()).toBe(2)
  })

  it('the prefetch swallows a plugin that is not there: null, never a throw', async () => {
    run.mockImplementation(async () => { throw new Error('ENOENT') })
    await expect(prefetchCommandCenter(project, SCRIPTS)).resolves.not.toBeUndefined()
  })
})

describe('invalidation drops the in-flight read', () => {
  it('a caller arriving after a write never receives the read started before it', async () => {
    plugin(true)
    const before = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    invalidateCommandCenter(project)          // a write landed while `before` was in flight
    const after = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(after).not.toBe(before)
    release()
    await Promise.all([before, after])
    expect(statusCalls()).toBe(2)
  })

  /** v13 fixer round: dropping the promise was not enough — the dropped read's spawns still
   * settled and wrote their PRE-WRITE blocks into the cache after the invalidation, so a later
   * cache hit (Today's reload, Planning, Close) could show the state before the verb. Now a block
   * is stored only while the epoch it was fetched under is current. */
  it('a block whose spawn STARTED before a write and SETTLED after it never lands in the cache: the next read spawns it again', async () => {
    // Only `sprint.py status` waits on the gate: the capabilities read passes, the fan-out starts,
    // the status spawn is in flight — then the write lands, then the spawn settles.
    let open: () => void = () => {}
    const gate = new Promise<void>((resolve) => { open = resolve })
    plugin()
    const answer = run.getMockImplementation()!
    run.mockImplementation(async (dir, script, args) => { if (script === 'sprint.py' && args[0] === 'status') await gate; return answer(dir, script, args) })
    const stale = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    await vi.waitFor(() => expect(statusCalls()).toBe(1))
    invalidateCommandCenter(project)          // the write, while the status spawn is in flight
    open()                                    // the pre-write spawn settles AFTER it
    const doc = await stale
    expect(doc.sprint.source).toBe('sprint.py status --json') // its own caller still gets a document
    // A fresh read: the pre-write status block was not kept, so it spawns again.
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(statusCalls()).toBe(2)
    // And the fresh read IS cached: a third call spawns nothing.
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(statusCalls()).toBe(2)
  })

  it('the stale read still answers its own caller — a document, never a throw — and a read with no write in between is cached', async () => {
    plugin(true)
    const read = getCommandCenter(project, SCRIPTS, 1, { actor: null })
    release()
    const doc = await read
    expect(doc.sprint.source).toBe('sprint.py status --json')
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(statusCalls()).toBe(1)
  })
})

describe('warmCommandCenter', () => {
  it('is a no-op for a project never read — no scripts dir is known, nothing spawns', () => {
    plugin()
    expect(warmCommandCenter(project)).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('after a read, re-runs the fan-out with the remembered scripts dir', async () => {
    plugin()
    await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    invalidateCommandCenter(project)
    const warmed = warmCommandCenter(project)
    expect(warmed).not.toBeNull()
    await warmed
    expect(statusCalls()).toBe(2)
    expect(run.mock.calls.every((c) => c[0] === SCRIPTS)).toBe(true)
  })
})

describe('the freshness stamp', () => {
  it('oldestFetchedAt picks the stalest block; empty stamps are skipped; none → null', () => {
    expect(oldestFetchedAt([{ fetchedAt: '2026-10-06T10:42:00Z' }, { fetchedAt: '2026-10-06T10:41:00Z' }, { fetchedAt: '' }])).toBe('2026-10-06T10:41:00Z')
    expect(oldestFetchedAt([])).toBeNull()
  })

  it('a cache hit keeps the first read\'s stamp — the document never says "as of now" for old blocks', async () => {
    plugin()
    vi.useFakeTimers({ now: new Date('2026-10-06T10:00:00Z') })
    const a = await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    vi.setSystemTime(new Date('2026-10-06T10:20:00Z'))
    const b = await getCommandCenter(project, SCRIPTS, 1, { actor: null })
    expect(b.fetchedAt).toBe(a.fetchedAt)
    expect(b.fetchedAt).toBe('2026-10-06T10:00:00.000Z')
    expect(statusCalls()).toBe(1)
  })
})
