// Planning's Graph surface (togo-command-center.md §3.2, §4): the committed slate draws exactly as
// the sprint home's constellation does (`constellationFromSprint`); the plugin's PROPOSAL draws
// every body at `buildOrderIndex: null` under `proposed: true` — the plugin has given no order for
// a set it has not been asked to commit, so the host captions the figure
// `reasons.ORDER_ARRIVES_ON_COMMIT`. Pure and plugin-faithful: the body fields are copied from the
// `spec_row`-shaped proposal rows as written, and nothing outside `FIELD_ALLOW_LIST` is produced
// for the geometry side — `planningSceneData.test` proves it with the same Proxy the constellation
// model uses.
import type { SlateProposal, SprintSlateRow, SprintView } from '../../../shared/types'
import type { Body, Ghost, SceneDataConstellation, Tether } from '../../scenes/core/types'
import { constellationFromSprint } from '../sprintSceneData'

function proposedBody(row: SprintSlateRow): Body {
  return {
    id: row.id,
    source: 'sprint',
    label: row.name,
    status: row.status,
    risk: row.risk,
    type: row.type || undefined,
    channel: row.channel || undefined,
    sprint: row.sprint,
    nextOwner: row.nextOwner || undefined,
    engReview: row.engReview || undefined,
    dataReview: row.dataReview || undefined,
    dor: row.dor,
    dorBlocking: row.dorBlocking,
    dependsOn: row.dependsOn,
    // A proposal has no build order: null for every body, never a 0 that would read as "first".
    buildOrderIndex: null,
    isNextUp: false,
    row,
  }
}

/** The plugin's deterministic proposal as a constellation: bodies for `proposal[]`, tethers for
 * every declared `depends_on`, ghosts for ids outside the proposed set. `buildOrder` is empty and
 * `nextUp` null because the plugin reported neither for a proposal. */
export function constellationFromProposal(proposal: SlateProposal): SceneDataConstellation {
  const bodies = proposal.proposal.map(proposedBody)
  const known = new Set(bodies.map((b) => b.id))
  const tethers: Tether[] = []
  const ghostsById = new Map<string, Ghost>()
  for (const body of bodies) {
    for (const target of body.dependsOn) {
      const ghost = !known.has(target)
      tethers.push({ from: body.id, to: target, ghost })
      if (!ghost) continue
      const existing = ghostsById.get(target)
      if (existing) existing.referencedBy.push(body.id)
      else ghostsById.set(target, { id: target, reason: 'not-in-sprint', referencedBy: [body.id] })
    }
  }
  return {
    source: 'sprint',
    bodies,
    tethers,
    ghosts: [...ghostsById.values()],
    buildOrder: [],
    nextUp: null,
    dependencyGaps: proposal.dependencyWarnings,
    hasData: proposal.hasData && bodies.length > 0,
    note: proposal.note,
    proposed: true,
  }
}

export type PlanningSurface = 'slate' | 'proposal'

/** What the planning figure draws: the committed slate when it has rows, else the proposal when
 * one is in hand, else null (the host shows the plugin's `note`). */
export function planningSceneData(
  view: SprintView | null,
  proposal: SlateProposal | null,
  surface: PlanningSurface,
): SceneDataConstellation | null {
  if (surface === 'proposal') return proposal ? constellationFromProposal(proposal) : null
  if (!view || !view.sprint) return null
  return constellationFromSprint(view)
}
