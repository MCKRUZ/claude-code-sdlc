// The planning screen's pure read model (togo-command-center.md §3.2). Every function here is a
// LOOKUP or an ORDERING over plugin fields — nothing computes a status, a count the plugin did not
// report, or a colour. The rules mirrored here are the plugin's own and are named at each site:
// `SLATEABLE_STATUSES` is `sprint_model.SLATEABLE_STATUSES`; the backlog order is the brief's
// "ready-first"; the slate order is `build_order[]` verbatim with the plugin's unlisted rows after.
import type { Board, BoardRow, ReadinessAll, RosterPerson, SpecLadder, SpecReadinessFull, SprintListView, SprintMixTier, SprintSlateRow, SprintView } from '../../../shared/types'
import { rungKind } from '../../../shared/ladderJoin'
import { samePerson } from '../../../shared/identity'
import { riskTone } from '../../../shared/sprintModel'

/** `sprint_model.SLATEABLE_STATUSES` (sprint_model.py:62): the statuses `slate` admits. Drafts are
 * in — the plugin, not the UI, lists the DoR gaps at `ready` (§5). */
export const SLATEABLE_STATUSES: readonly string[] = ['ready', 'draft']

/** The candidate rows the plugin's `_proposal` fills from: a slateable status and no sprint. The
 * plugin reports `candidates` as a COUNT; these are the same rows, read from the `board` block. */
export function candidateRows(board: Pick<Board, 'rows'> | null | undefined): BoardRow[] {
  if (!board) return []
  return board.rows.filter((r) => SLATEABLE_STATUSES.includes(r.status) && r.sprint === '')
}

/** `spec_readiness.py --all` rows keyed by spec id (`readiness.spec` is the four-digit id). */
export function readinessById(all: ReadinessAll | null | undefined): Map<string, SpecReadinessFull> {
  const map = new Map<string, SpecReadinessFull>()
  for (const r of all?.specs ?? []) map.set(r.spec, r)
  return map
}

export type DorState = 'READY' | 'NOT READY' | 'unknown'

/** The checker's verdict for a row: `ready:true` → READY, `ready:false` → NOT READY, no row from
 * the checker → `unknown` (reads "DoR arrives with a newer plugin: lacks readiness-all"). */
export function dorState(readiness: SpecReadinessFull | undefined): DorState {
  if (!readiness) return 'unknown'
  return readiness.ready ? 'READY' : 'NOT READY'
}

const STATUS_RANK: Record<string, number> = { ready: 0, draft: 1 }

/** READY first, then `status` (ready before draft), then id — the brief's order, from the rows alone. */
export function orderBacklog(rows: readonly BoardRow[], readiness: Map<string, SpecReadinessFull>): BoardRow[] {
  const dorRank = (row: BoardRow) => {
    const s = dorState(readiness.get(row.spec))
    return s === 'READY' ? 0 : s === 'NOT READY' ? 1 : 2
  }
  return [...rows].sort((a, b) =>
    dorRank(a) - dorRank(b)
    || (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
    || a.spec.localeCompare(b.spec))
}

export interface SlateLine {
  row: SprintSlateRow
  /** 1-based position in `build_order[]`, or null when the plugin listed no order for it. */
  order: number | null
}

/** The slate in the plugin's `build_order[]`; rows the order does not name follow under
 * `reasons.ORDER_NOT_GIVEN`, in the slate's own order. */
export function slateInOrder(view: Pick<SprintView, 'slate' | 'buildOrder'>): { ordered: SlateLine[]; unlisted: SlateLine[] } {
  const byId = new Map(view.slate.map((r) => [r.id, r]))
  const ordered: SlateLine[] = []
  const seen = new Set<string>()
  view.buildOrder.forEach((id, i) => {
    const row = byId.get(id)
    if (!row || seen.has(id)) return
    seen.add(id)
    ordered.push({ row, order: i + 1 })
  })
  const unlisted = view.slate.filter((r) => !seen.has(r.id)).map((row) => ({ row, order: null }))
  return { ordered, unlisted }
}

const TIER_ORDER = ['HIGH', 'MEDIUM', 'LOW']

export interface MixBar {
  tier: string
  /** The plugin's `mix[TIER].actual` for this sprint. */
  actual: number
  /** `mix[TIER].target`; null when the mix named no target for the tier. */
  target: number | null
  /** Last sprint's `actual` for the same tier, or null when no last sprint was read. */
  last: number | null
  /** Fill as a fraction of the target, for the 6 px bar — null (no bar) without a target. */
  fill: number | null
}

/** Three bars, never a chart (visual §4): actual over target, last sprint beside it as text.
 * The fraction is the only arithmetic and it is a RATIO of two plugin numbers for a bar width. */
export function mixMeter(mix: Record<string, SprintMixTier>, last: Record<string, SprintMixTier> | null): MixBar[] {
  const tiers = Object.keys(mix).sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a), ib = TIER_ORDER.indexOf(b)
    return (ia === -1 ? TIER_ORDER.length : ia) - (ib === -1 ? TIER_ORDER.length : ib) || a.localeCompare(b)
  })
  return tiers.map((tier) => {
    const { actual, target } = mix[tier]
    return {
      tier, actual, target,
      last: last ? (last[tier]?.actual ?? null) : null,
      fill: target === null || target === 0 ? null : Math.min(1, actual / target),
    }
  })
}

/** The HIGH line, verbatim from the ladder: the security and sign-off rungs the plugin requires. */
export function highLines(ladder: SpecLadder | undefined): string[] {
  if (!ladder) return []
  return ladder.rungs.filter((r) => rungKind(r) === 'security' || rungKind(r) === 'signoff')
}

/** The sprint before the active one by the plugin's `ordinal` (1-based id order). Null when the
 * list has no active sprint, or the active one is the first. */
export function previousSprintId(list: SprintListView | null | undefined): string | null {
  if (!list || !list.active) return null
  const active = list.sprints.find((s) => s.id === list.active)
  if (!active) return null
  return list.sprints.find((s) => s.ordinal === active.ordinal - 1)?.id ?? null
}

/** Whether the proposal's set differs from what is slated — only then does Commit run `slate`. */
export function setChanged(slated: readonly string[], proposed: readonly string[]): boolean {
  const a = [...slated].sort(), b = [...proposed].sort()
  return a.length !== b.length || a.some((id, i) => id !== b[i])
}

/** Roster handles holding a role, for the slot pickers — in roster order. */
export function withRole<P extends { handle: string; roles?: string[] }>(people: readonly P[], role: string): P[] {
  return people.filter((p) => (p.roles ?? []).includes(role))
}

/** Does the plugin report the slate as over its target? `target` null → never (no target set). */
export function overTarget(target: number | null, slatedCount: number): boolean {
  return target !== null && slatedCount > target
}

/** Risk chips keep the kit's tones (visual §2) — the ONE table in `shared/sprintModel`, re-exported
 * so every planning column, the spec card and the close screen draw a tier the same way. */
export { riskTone }

/** The ring a handle wears: initials from the roster NAME when the roster knows the handle (two
 * words → two letters), else from the handle's letters. Never a digit — `PersonRing` strips them. */
export function ringFor(people: readonly RosterPerson[], handle: string): { initials: string; name: string } {
  const person = people.find((p) => samePerson(p.handle, handle))
  const name = person?.name?.trim() || handle
  const words = name.split(/\s+/).filter(Boolean)
  const initials = words.length >= 2 ? `${words[0][0]}${words[words.length - 1][0]}` : name.replace(/^@/, '').slice(0, 2)
  return { initials, name }
}
