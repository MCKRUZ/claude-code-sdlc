// The command center's one read model (togo-command-center.md §2.3): a parallel fan-out over the
// plugin's read verbs, each answer wrapped in a `SourcedBlock` carrying the literal spawn it came
// from. Blocks are independent — one failing leaves the others `ok` — and `data: null` is "no
// data", never a zero. Two lists are DERIVED here and only here, by exact handle match
// (`shared/identity.samePerson`): `needsYou` and `sinceYesterday`. Neither carries a per-person
// total; `verdicts_pending` has a lane, not a person, and never appears in `needsYou`.
//
// Cache: one per project, keyed by block. Local blocks live until a write IPC, a completed pull
// or "Refresh this screen" invalidates them; the host block (`spec_status --all`, a code-host
// round trip) keeps a 60 s TTL and its own `fetchedAt`. No fs.watch, no background polling.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import { getBoardBlock } from './board'
import { getSprintList, getSprintLog, getSprintStatus, run, sourceArgs, type Read } from './sprint'
import { resolveActor } from './actor'
import { parseDocument, readDecisions, readFindings, readRoster, readScorecard } from './commandCenterReaders'
import { samePerson } from '../../shared/identity'
import { CAPABILITIES, NO_ACTOR, UNDATED, newerPlugin } from '../../shared/reasons'
import type {
  ActorInfo, Board, CommandCenter, DecisionsView, NeedsYouItem, SinceWindow, SourcedBlock, SprintLogView, SprintView,
  StreamRow,
} from '../../shared/types'

export const HOST_TTL_MS = 60_000
export const SOURCES = {
  sprint: 'sprint.py status --json', sprints: 'sprint.py list --json',
  board: 'spec_status.py --all --json + track_specs.py --json', decisions: 'track_decisions.py --json',
  findings: 'record_findings.py report --json', scorecard: 'scorecard.py report --json',
  roster: 'project_settings.py --json', log: (since: string) => `sprint.py log --since ${since} --json`,
  capabilities: 'generate_status.py --json',
} as const

type BoardBlockData = Board & { warnings: string[] }
interface ProjectCache {
  local: Map<string, SourcedBlock<unknown>>
  host: { block: SourcedBlock<BoardBlockData>; unconfirmedTierSpecs: string[]; at: number } | null
}
const caches = new Map<string, ProjectCache>()
const cacheFor = (p: string): ProjectCache => caches.get(p) ?? caches.set(p, { local: new Map(), host: null }).get(p)!

/** Local blocks go on any write, any completed pull and any project switch; `'all'` (Refresh
 * this screen) drops the host block too. No project path clears every project. */
export function invalidateCommandCenter(projectPath?: string, scope: 'local' | 'all' = 'local'): void {
  const targets = projectPath === undefined ? [...caches.values()] : [cacheFor(projectPath)]
  for (const c of targets) { c.local.clear(); if (scope === 'all') c.host = null }
}

/** The spec ids the last board read listed — what `sprintWrites` checks a request against
 * without a spawn. Undefined when no board has been read yet (the plugin then refuses an unknown
 * spec itself, exit 1). */
export function cachedBoardSpecIds(projectPath: string): string[] | undefined {
  return caches.get(projectPath)?.host?.block.data?.rows.map((r) => r.spec)
}

const sourced = <T>(source: string, read: Read<T>): SourcedBlock<T> => ({
  source, fetchedAt: new Date().toISOString(), ok: read.ok, data: read.ok ? read.data : null, error: read.ok ? null : read.error,
})

async function local<T>(projectPath: string, key: string, source: string, fetch: () => Promise<Read<T>>): Promise<SourcedBlock<T>> {
  const cache = cacheFor(projectPath)
  const hit = cache.local.get(key)
  if (hit) return hit as SourcedBlock<T>
  const block = sourced(source, await fetch().catch((e: unknown) => ({ ok: false as const, error: String((e as Error)?.message ?? e) })))
  cache.local.set(key, block)
  return block
}

/** One document from a read verb, or the plugin's message. The reader decides what counts. */
async function readOne<T>(scriptsDir: string, script: string, args: string[], read: (raw: unknown) => T | null): Promise<Read<T>> {
  const ran = await run(scriptsDir, script, args)
  const data = ran.raw ? read(ran.raw) : null
  return data !== null ? { ok: true, data } : { ok: false, error: ran.stderr.trim() || ran.stdout.trim() || `${script} gave no readable answer` }
}

/** `generate_status.py --json` capabilities — the plugin's own declaration (§2.6). A project
 * with no state file has none Studio can read, so every gated control stays disabled honestly. */
export async function getCapabilities(projectPath: string, scriptsDir: string): Promise<string[]> {
  const state = join(projectPath, '.sdlc', 'state.yaml')
  if (!existsSync(state)) return []
  const block = await local(projectPath, 'capabilities', SOURCES.capabilities, async () => {
    const entry = await runPluginScript(scriptsDir, 'generate_status.py', ['--state', state, '--json'])
    const doc = parseDocument(rawStdout(entry))
    const caps = doc && Array.isArray(doc.capabilities) ? doc.capabilities.filter((c): c is string => typeof c === 'string') : null
    return caps ? { ok: true, data: caps } : { ok: false, error: entry.stderr.trim() || 'generate_status.py gave no capabilities' }
  })
  return block.data ?? []
}

async function hostBlock(projectPath: string, scriptsDir: string, now: number) {
  const cache = cacheFor(projectPath)
  if (cache.host && now - cache.host.at < HOST_TTL_MS) return cache.host
  const r = await getBoardBlock(projectPath, scriptsDir)
  const block = sourced<BoardBlockData>(SOURCES.board, r.ok ? { ok: true, data: { ...r.board, warnings: r.warnings } } : { ok: false, error: r.error ?? 'unreadable' })
  cache.host = { block, unconfirmedTierSpecs: r.unconfirmedTierSpecs, at: now }
  return cache.host
}

/** The `--since` date for the window the person picked: N business days back from today, a
 * FILTER the plugin applies — never a number Studio reports. */
export function sinceDateFor(window: SinceWindow, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  for (let left = window; left > 0;) { d.setUTCDate(d.getUTCDate() - 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left-- }
  return d.toISOString().slice(0, 10)
}

// --- the two derived lists (exact handle match only) --------------------------------------------

export interface NeedsYouInput {
  actor: ActorInfo | null
  sprint: SourcedBlock<SprintView>
  board: SourcedBlock<BoardBlockData>
  decisions: SourcedBlock<DecisionsView>
  capabilities: readonly string[]
  /** Spec ids whose `spec_status --all` row carries `risk_confirmed_by` present AND empty. */
  unconfirmedTierSpecs?: readonly string[]
}

export function needsYou(input: NeedsYouInput): { items: NeedsYouItem[]; reason: string | null } {
  const me = input.actor?.name
  if (!me) return { items: [], reason: NO_ACTOR }
  const items: NeedsYouItem[] = []
  for (const d of input.decisions.data?.openDecisions ?? []) {
    if (samePerson(d.owner, me)) items.push({ kind: 'decide', id: d.id, action: 'decide', source: input.decisions.source, text: d.decision, overdue: d.overdue })
  }
  items.sort((a, b) => Number(b.overdue === true) - Number(a.overdue === true))
  for (const h of input.sprint.data?.handoffsOpen ?? []) {
    if (samePerson(h.to, me)) items.push({ kind: 'ack', spec: h.spec, action: 'ack', source: input.sprint.source, text: h.to })
  }
  for (const row of input.board.data?.rows ?? []) {
    if (row.pullRequest && samePerson(row.pullRequest.waitingOnHandle, me)) {
      items.push({ kind: 'review', spec: row.spec, action: 'open PR', source: input.board.source, text: row.pullRequest.waitingOn })
    }
  }
  if (input.capabilities.includes(CAPABILITIES.confirmTier)) {
    for (const row of input.board.data?.rows ?? []) {
      if (row.risk && samePerson(row.owner, me) && input.unconfirmedTierSpecs?.includes(row.spec)) {
        items.push({ kind: 'confirm-tier', spec: row.spec, action: 'confirm', source: input.board.source, text: row.risk })
      }
    }
  }
  return { items, reason: null }
}

export interface SinceYesterdayInput { log: SourcedBlock<SprintLogView>; board: SourcedBlock<BoardBlockData>; since: string }

/** Ledger events verbatim plus PRs merged in the window, newest first by the timestamp the source
 * gave; undated rows last, labelled. Decisions closed in the window are NOT here: the plugin's
 * `track_decisions.py --json` lists open rows only, and Studio does not read the log itself. */
export function sinceYesterday(input: SinceYesterdayInput): StreamRow[] {
  const rows: StreamRow[] = []
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined)
  for (const e of input.log.data?.events ?? []) {
    // The ledger's own key is `ts` (sprint_model.make_event); `timestamp` is read for a line that carries it instead.
    const at = s(e.ts) ?? s(e.timestamp) ?? null, event = s(e.event) ?? 'event', spec = s(e.spec), by = s(e.by)
    rows.push({ origin: 'log', key: `${at ?? ''}+${event}+${spec ?? ''}`, at, event, spec, sprint: s(e.sprint), by, text: [event, spec, by && `by ${by}`].filter(Boolean).join(' · '), raw: e })
  }
  for (const row of input.board.data?.rows ?? []) {
    const pr = row.pullRequest
    if (pr?.mergedAt && pr.mergedAt.slice(0, 10) >= input.since) {
      rows.push({ origin: 'board', key: `${pr.mergedAt}+merged+${row.spec}`, at: pr.mergedAt, event: 'merged', spec: row.spec, sprint: row.sprint || undefined, text: `PR #${pr.number} merged`, raw: { ...pr } })
    }
  }
  const dated = rows.filter((r) => r.at !== null).sort((a, b) => (a.at! < b.at! ? 1 : a.at! > b.at! ? -1 : 0))
  const undated = rows.filter((r) => r.at === null).map((r) => ({ ...r, text: `${r.text} · ${UNDATED}` }))
  return [...dated, ...undated]
}

// --- the document ---------------------------------------------------------------------------------

export async function getCommandCenter(
  projectPath: string, scriptsDir: string, since: SinceWindow = 1,
  opts: { refresh?: boolean; now?: Date; actor?: ActorInfo | null } = {},
): Promise<CommandCenter> {
  if (opts.refresh) invalidateCommandCenter(projectPath, 'all')
  const now = opts.now ?? new Date()
  const sinceDate = sinceDateFor(since, now)
  const capabilities = await getCapabilities(projectPath, scriptsDir)
  const gated = <T>(cap: string, source: string, fetch: () => Promise<Read<T>>) =>
    capabilities.includes(cap) ? fetch() : Promise.resolve<Read<T>>({ ok: false, error: newerPlugin(cap) })
  const [actor, sprint, sprints, host, decisions, findings, scorecard, roster, log] = await Promise.all([
    opts.actor !== undefined ? opts.actor : resolveActor(projectPath, scriptsDir),
    local(projectPath, 'sprint', SOURCES.sprint, async () => {
      const r = await getSprintStatus(projectPath, scriptsDir)
      return r.ok ? { ok: true, data: r } : { ok: false, error: r.error }
    }),
    local(projectPath, 'sprints', SOURCES.sprints, () => gated(CAPABILITIES.sprintList, SOURCES.sprints, () => getSprintList(projectPath, scriptsDir))),
    hostBlock(projectPath, scriptsDir, now.getTime()),
    local(projectPath, 'decisions', SOURCES.decisions, () => readOne(scriptsDir, 'track_decisions.py', [...sourceArgs(projectPath), '--json'], readDecisions)),
    local(projectPath, 'findings', SOURCES.findings, () => readOne(scriptsDir, 'record_findings.py', ['report', ...sourceArgs(projectPath), '--json'], readFindings)),
    local(projectPath, 'scorecard', SOURCES.scorecard, () => readOne(scriptsDir, 'scorecard.py', ['report', ...sourceArgs(projectPath), '--json'], readScorecard)),
    local(projectPath, 'roster', SOURCES.roster, () => readOne(scriptsDir, 'project_settings.py', ['--repo', projectPath, '--json'], readRoster)),
    local(projectPath, `log:${sinceDate}`, SOURCES.log(sinceDate), () => gated(CAPABILITIES.sprintLog, SOURCES.log(sinceDate), () => getSprintLog(projectPath, scriptsDir, sinceDate))),
  ])
  const board = host.block
  const needs = needsYou({ actor, sprint, board, decisions, capabilities, unconfirmedTierSpecs: host.unconfirmedTierSpecs })
  return {
    projectPath, fetchedAt: now.toISOString(), actor, capabilities, sprint, sprints, board, decisions, findings, scorecard, roster, log,
    needsYou: needs.items, needsYouReason: needs.reason, sinceYesterday: sinceYesterday({ log, board, since: sinceDate }), since,
  }
}
