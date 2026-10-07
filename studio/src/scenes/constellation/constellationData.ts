// The plugin's rows as the constellation reads them (studio-observatory.md §5.2 "Exact plugin
// data"). Pure and plugin-faithful: every field is copied from `SprintView` / `BoardRow` as
// written, nothing is scored or re-derived, and `dependencyGaps` travels as prose for a Notice.
//
// The screens (Wave 1) build this shape themselves before handing it to `<SceneSlot>`; these two
// functions are the scene's own copy of that mapping so the model tests can start from a
// SprintView-shaped or Board-shaped fixture without importing a component.
import type { BoardRow, SprintSlateRow, SprintView } from '../../../shared/types'
import type { Body, Ghost, SceneDataConstellation, Tether } from '../core/types'

function sprintBody(row: SprintSlateRow, view: SprintView): Body {
  const orderIndex = view.buildOrder.indexOf(row.id)
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
    // The plugin listed no order → null, never a 0 that would read as "first".
    buildOrderIndex: orderIndex === -1 ? null : orderIndex,
    isNextUp: view.nextUp === row.id,
    row,
  }
}

function boardBody(row: BoardRow): Body {
  return {
    id: row.spec,
    source: 'board',
    label: row.title || row.name,
    status: row.status,
    risk: row.risk,
    channel: row.channel || undefined,
    team: row.team || undefined,
    sprint: row.sprint,
    nextOwner: row.nextOwner || undefined,
    engReview: row.engReview || undefined,
    dataReview: row.dataReview || undefined,
    dependsOn: row.dependsOn,
    buildOrderIndex: null,
    isNextUp: false,
    waitingOn: row.pullRequest?.waitingOn,
    overAlarm: row.pullRequest?.overAlarm,
    waitHours: row.pullRequest?.waitHours,
    row,
  }
}

/** Tethers for every declared edge; a Ghost for every `dependsOn` id with no body. The only rule
 * for a ghost is absence from the set — data, not prose. */
function edgesAndGhosts(bodies: Body[], reason: Ghost['reason']): { tethers: Tether[]; ghosts: Ghost[] } {
  const known = new Set(bodies.map((b) => b.id))
  const tethers: Tether[] = []
  const ghosts = new Map<string, Ghost>()
  for (const body of bodies) {
    for (const target of body.dependsOn) {
      const ghost = !known.has(target)
      tethers.push({ from: body.id, to: target, ghost })
      if (!ghost) continue
      const entry = ghosts.get(target) ?? { id: target, reason, referencedBy: [] }
      entry.referencedBy.push(body.id)
      ghosts.set(target, entry)
    }
  }
  return { tethers, ghosts: [...ghosts.values()] }
}

export function constellationFromSprintView(view: SprintView): SceneDataConstellation {
  const bodies = view.slate.map((row) => sprintBody(row, view))
  const { tethers, ghosts } = edgesAndGhosts(bodies, 'not-in-sprint')
  return {
    source: 'sprint',
    bodies,
    tethers,
    ghosts,
    buildOrder: view.buildOrder,
    nextUp: view.nextUp,
    dependencyGaps: view.dependencyGaps,
    hasData: view.hasData,
    note: view.note,
  }
}

/** From the FILTERED rows only: the graph is a view of the same list, never a second list. A
 * dependency outside the filter is a Ghost ("not shown"). */
export function constellationFromBoardRows(rows: BoardRow[]): SceneDataConstellation {
  const bodies = rows.map(boardBody)
  const { tethers, ghosts } = edgesAndGhosts(bodies, 'not-shown')
  return {
    source: 'board',
    bodies,
    tethers,
    ghosts,
    buildOrder: [],
    nextUp: null,
    dependencyGaps: [],
    hasData: rows.length > 0,
    note: null,
  }
}
