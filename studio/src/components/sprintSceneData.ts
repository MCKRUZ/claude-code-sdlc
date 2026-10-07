// The sprint view as the dependency constellation reads it (studio-observatory.md §5.2). Pure
// and plugin-faithful: every field is copied from `SprintView` as written, nothing is scored or
// re-derived, and `dependencyGaps` travels as prose for a Notice — the scene never draws it.
// `SprintScreen` builds this once per fetched view and hands it to `<SceneSlot>`; the slot
// renders nothing until Wave 3 registers the scene, so the page is unchanged until then.
import type { SprintSlateRow, SprintView } from '../../shared/types'
import type { Body, Ghost, SceneDataConstellation, Tether } from '../scenes/core/types'

function bodyFor(row: SprintSlateRow, view: SprintView): Body {
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

/** A `depends_on` id with no slate row is a Ghost ("not in this sprint") so the tether still has
 * somewhere to end, dashed, instead of being dropped — a dropped edge hides a dependency the
 * spec declared. */
export function constellationFromSprint(view: SprintView): SceneDataConstellation {
  const bodies = view.slate.map((row) => bodyFor(row, view))
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
    buildOrder: view.buildOrder,
    nextUp: view.nextUp,
    dependencyGaps: view.dependencyGaps,
    hasData: view.hasData,
    note: view.note,
  }
}
