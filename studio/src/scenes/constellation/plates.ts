// The plate list (studio-observatory.md §5.2 "Interactions", "Exact plugin data"): one DOM
// button per body, in KEYBOARD ORDER (`buildOrder` first, the rest by id, ghosts last). The
// accessible name is always "Spec <id>: <title>", never a bare id. Every line is a plugin field
// verbatim — this is the ONE place prose (`waitingOn`) is read, and it becomes text, never a
// number or a colour; `dorBlocking` is counted here and quoted in full on the table surface.
import { Vector3 } from 'three'
import type { PlateSide } from '../core/plateLayout'
import type { PlateItem } from '../core/projectLabels'
import type { Body, SceneDataConstellation } from '../core/types'
import type { RenderModel } from './constellationModel'

export const PLATE_KIND = 'Spec'
export const GHOST_TITLE: Record<SceneDataConstellation['source'], string> = {
  sprint: 'not in this sprint',
  board: 'not shown',
}

/** The hover card is compact: at most three facts plus the way in, every one a plugin field
 * verbatim (status, risk, the DoR verdict and its blocking COUNT, who is next or the review
 * verdicts; for the Board, the PR sentence and the alarm). The checker's full `dorBlocking`
 * lines stay in the slate's DoR <details> on the table surface — the plate says how many, the
 * table says which. Nulls are dropped; the risk-tier caveat added by `platesFor` may make four. */
export function plateLines(body: Body): string[] {
  const head = `${body.status} · ${body.risk}`
  const lines: (string | null)[] =
    body.source === 'sprint'
      ? [
          `${head}${body.type ? ' · ' + body.type : ''}`,
          body.dor
            ? body.dor === 'NOT READY'
              ? `DoR: NOT READY · ${body.dorBlocking?.length ?? 0} blocking`
              : 'DoR: READY'
            : null,
          body.nextOwner
            ? `Next: ${body.nextOwner}`
            : body.engReview || body.dataReview
              ? `Eng ${body.engReview ?? '—'} · Data ${body.dataReview ?? '—'}`
              : null,
        ]
      : [
          `${head}${body.team ? ' · ' + body.team : ''}`,
          body.waitingOn ?? null,
          body.overAlarm === true
            ? body.waitHours != null
              ? `Over the team's alarm (${body.waitHours} h waiting)`
              : "Over the team's alarm"
            : body.nextOwner
              ? `Next: ${body.nextOwner}`
              : null,
        ]
  return lines.filter((l): l is string => l !== null && l.trim() !== '')
}

/** Which side of its body a plate hangs on (round 2, I9). The Sprint keeps every plate below.
 * The Board ALTERNATES by keyboard order — as the Spine does — so the plate room above and
 * below the bodies is symmetric and the fit centres the bodies, not the plates. */
export function plateSideFor(source: SceneDataConstellation['source'], orderIndex: number): PlateSide {
  if (source !== 'board') return 'below'
  return orderIndex % 2 === 0 ? 'below' : 'above'
}

/** Built once per data change; the scene mutates each `anchor` (and `anchorRadius`) in place
 * every frame, so the plate hangs just under the body's silhouette wherever the camera is. */
export function platesFor(model: RenderModel, data: SceneDataConstellation): PlateItem[] {
  const byId = new Map(data.bodies.map((b) => [b.id, b]))
  const ghostRefs = new Map(data.ghosts.map((g) => [g.id, g.referencedBy]))
  const items: PlateItem[] = []
  model.order.forEach((index, orderIndex) => {
    const side = plateSideFor(data.source, orderIndex)
    const rb = model.bodies[index]
    if (rb.ghost) {
      const refs = ghostRefs.get(rb.id) ?? model.bodies.filter((b) => b.dependsOn.includes(index)).map((b) => b.id)
      items.push({
        id: rb.id,
        kind: PLATE_KIND,
        title: GHOST_TITLE[data.source],
        meta: rb.id,
        anchor: new Vector3(),
        anchorRadius: rb.radius,
        side,
        lines: refs.length ? [`Needed by ${refs.join(', ')}`] : undefined,
        muted: true,
      })
      return
    }
    const body = byId.get(rb.id)
    if (!body) return
    const lines = plateLines(body)
    if (!rb.riskKnown) lines.unshift('Risk tier not recognised; drawn at MEDIUM size')
    items.push({
      id: rb.id,
      kind: PLATE_KIND,
      title: body.label || rb.id,
      // The id rides as the mono lead-in; the accessible name already says "Spec <id>: <title>".
      meta: body.label ? rb.id : undefined,
      anchor: new Vector3(),
      // The scene rewrites `anchorRadius` each frame with the fitted body scale applied.
      anchorRadius: rb.radius,
      side,
      lines,
      badge: rb.buildOrderIndex === null ? undefined : String(rb.buildOrderIndex + 1),
      // "Next up" is the plugin's answer; it is words on the plate, not only a glow.
      ribbon: body.isNextUp ? 'Next up' : undefined,
    })
  })
  return items
}
