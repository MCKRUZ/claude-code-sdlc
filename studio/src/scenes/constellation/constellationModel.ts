// The constellation's render model (studio-observatory.md §5.2, §5.4): a PURE function from the
// typed `SceneDataConstellation` to what the GPU draws — and the place the honesty rules are
// enforced structurally rather than by good intentions.
//
//   radius      ← `risk` tier ONLY (LOW .32 / MEDIUM .42 / HIGH .54)
//   colour      ← `status` through the same tone vocabulary SprintBoard's chips use
//   warn ring   ← `dor === 'NOT READY'` or `overAlarm === true` (amber, never red)
//   halo        ← `isNextUp`
//   x pull      ← `buildOrderIndex`
//   ghosts      ← a `dependsOn` id absent from the data set (ids only, never prose)
//
// Prose (`dorBlocking`, `waitingOn`, `dependencyGaps`, `note`) reaches the plate as TEXT and is
// never read by anything that produces a number or a colour. `FIELD_ALLOW_LIST` names every
// field the geometry side may touch and `assertOnlyAllowListedFields` proves it with a Proxy.
import type { ColorToken } from '../../theme/tokens'
import type { ChipTone } from '../../ui/contract'
import { seededPosition } from '../core/layout/hash'
import type { Position } from '../core/layout/layoutCache'
import { MAX_BODIES } from '../core/sceneDefaults'
import type { Body, SceneDataConstellation } from '../core/types'

/** Body fields the GEOMETRY / COLOUR side may read. Anything else is plate text. */
export const FIELD_ALLOW_LIST = [
  'id', 'label', 'status', 'risk', 'dor', 'dependsOn', 'buildOrderIndex', 'isNextUp', 'overAlarm',
] as const satisfies readonly (keyof Body)[]

export type AllowListedField = (typeof FIELD_ALLOW_LIST)[number]

/** Radius is bound to the risk tier and nothing else. */
export const RISK_RADIUS: Readonly<Record<'LOW' | 'MEDIUM' | 'HIGH', number>> = { LOW: 0.32, MEDIUM: 0.42, HIGH: 0.54 }

/** A tier the plugin wrote in a way the map does not know draws at MEDIUM and says so on the
 * plate (`riskKnown: false`) — the alternative, a size invented from something else, is exactly
 * what the rule forbids. */
export const UNKNOWN_RISK_RADIUS = RISK_RADIUS.MEDIUM

/** Ghosts have no risk (they are not in the data set) so they carry one fixed radius. */
export const GHOST_RADIUS = 0.3

export function radiusForRisk(risk: string): number {
  const key = risk.trim().toUpperCase()
  return key in RISK_RADIUS ? RISK_RADIUS[key as keyof typeof RISK_RADIUS] : UNKNOWN_RISK_RADIUS
}

export interface StatusTone {
  /** The body colour token (§2.3 spec tones, same meanings as the SprintBoard CHIP map). */
  token: ColorToken
  /** The kit chip tone a plate uses for the same status. */
  chip: ChipTone
}

/** `track_specs.py` STATUS_ORDER is draft → ready → in-flight → merged; `deferred` is the parked
 * state. Anything else is drawn neutral (ink-3) rather than guessed. */
export const STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  ready: { token: 'spec-ready', chip: 'accent' },
  'in-flight': { token: 'spec-inflight', chip: 'accent' },
  merged: { token: 'spec-merged', chip: 'ok' },
  deferred: { token: 'spec-deferred', chip: 'neutral' },
}

export const NEUTRAL_TONE: StatusTone = { token: 'ink-3', chip: 'neutral' }

/** Warn-class facts (NOT READY, overAlarm) use the warn tone. Never `status-error`. */
export const WARN_TOKEN: ColorToken = 'status-warn-fill'
export const GHOST_TOKEN: ColorToken = 'ink-4'

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONE[status.trim().toLowerCase()] ?? NEUTRAL_TONE
}

export interface RenderBody {
  id: string
  /** Instance index — the position in `RenderModel.bodies` and in the flat positions array. */
  index: number
  label: string
  radius: number
  riskKnown: boolean
  colorToken: ColorToken
  chipTone: ChipTone
  /** Draws the amber equator ring. */
  warnRing: boolean
  notReady: boolean
  overAlarm: boolean
  nextUp: boolean
  ghost: boolean
  buildOrderIndex: number | null
  /** Indices of the bodies this one depends on (incident tethers, for neighbour dimming). */
  dependsOn: number[]
}

export interface RenderEdge {
  /** Dependent → dependency, as declared. */
  from: number
  to: number
  ghost: boolean
}

export interface RenderModel {
  bodies: RenderBody[]
  edges: RenderEdge[]
  /** Instance indices in keyboard order: `buildOrder` first, the rest by id, ghosts last. */
  order: number[]
  /** Set when the graph must not be drawn; the shell shows the table with this sentence. */
  tableOnly: string | null
  realCount: number
  ghostCount: number
}

function bodyToRender(body: Pick<Body, AllowListedField>, index: number): RenderBody {
  const tone = toneForStatus(body.status)
  const notReady = body.dor === 'NOT READY'
  const overAlarm = body.overAlarm === true
  return {
    id: body.id,
    index,
    label: body.label,
    radius: radiusForRisk(body.risk),
    riskKnown: body.risk.trim().toUpperCase() in RISK_RADIUS,
    colorToken: tone.token,
    chipTone: tone.chip,
    warnRing: notReady || overAlarm,
    notReady,
    overAlarm,
    nextUp: body.isNextUp,
    ghost: false,
    buildOrderIndex: body.buildOrderIndex,
    dependsOn: [],
  }
}

export function buildRenderModel(data: SceneDataConstellation): RenderModel {
  const bodies: RenderBody[] = data.bodies.map((b, i) => bodyToRender(b, i))
  const indexById = new Map<string, number>(bodies.map((b) => [b.id, b.index]))
  const ghostIds = new Set<string>()

  // Ghost iff the id is absent from the data set. The typed `ghosts` list is the host's answer to
  // the same question; recomputing from `dependsOn` here means a stale list cannot invent one.
  for (const body of data.bodies) for (const dep of body.dependsOn) if (!indexById.has(dep)) ghostIds.add(dep)
  for (const id of [...ghostIds].sort()) {
    const index = bodies.length
    bodies.push({
      id, index, label: id, radius: GHOST_RADIUS, riskKnown: true, colorToken: GHOST_TOKEN, chipTone: 'neutral',
      warnRing: false, notReady: false, overAlarm: false, nextUp: false, ghost: true, buildOrderIndex: null, dependsOn: [],
    })
    indexById.set(id, index)
  }

  const edges: RenderEdge[] = []
  data.bodies.forEach((body, from) => {
    for (const dep of body.dependsOn) {
      const to = indexById.get(dep)
      if (to === undefined || to === from) continue
      bodies[from].dependsOn.push(to)
      edges.push({ from, to, ghost: ghostIds.has(dep) })
    }
  })

  const ordered = new Set<number>()
  for (const id of data.buildOrder) {
    const index = indexById.get(id)
    if (index !== undefined && !bodies[index].ghost) ordered.add(index)
  }
  const rest = bodies.filter((b) => !b.ghost && !ordered.has(b.index)).sort((a, b) => a.id.localeCompare(b.id))
  for (const b of rest) ordered.add(b.index)
  for (const b of bodies) if (b.ghost) ordered.add(b.index)

  const realCount = data.bodies.length
  const tableOnly = realCount > MAX_BODIES ? `Too many specs for the graph (${realCount}); showing the table.` : null

  return { bodies, edges, order: [...ordered], tableOnly, realCount, ghostCount: ghostIds.size }
}

/** Indices lit while `hovered` is hovered: itself and every body sharing an edge with it. */
export function neighboursOf(model: RenderModel, hovered: number): Set<number> {
  const lit = new Set<number>([hovered])
  for (const e of model.edges) {
    if (e.from === hovered) lit.add(e.to)
    if (e.to === hovered) lit.add(e.from)
  }
  return lit
}

/** Round 2 (I5): the hovered body's incident edges split by DIRECTION, from the declared edges
 * only. `upstream` are the edges the hovered body DEPENDS ON (`from === hovered`, its
 * dependencies); `downstream` are its DEPENDENTS (`to === hovered`). Indices into `model.edges`. */
export function partitionIncident(model: RenderModel, hovered: number): { upstream: number[]; downstream: number[] } {
  const upstream: number[] = []
  const downstream: number[] = []
  model.edges.forEach((e, i) => {
    if (e.from === hovered) upstream.push(i)
    else if (e.to === hovered) downstream.push(i)
  })
  return { upstream, downstream }
}

/** Where each body STARTS: the cached position when there is one; otherwise its nearest
 * dependency's (or dependent's) cached position, so a new body is born beside what it relates to
 * and never at the origin; otherwise the seeded hash of its id (deterministic). */
export function startPositions(model: RenderModel, cached: ReadonlyMap<string, Position> | null): Map<string, Position> {
  const out = new Map<string, Position>()
  for (const b of model.bodies) {
    const hit = cached?.get(b.id)
    if (hit) out.set(b.id, [hit[0], hit[1], hit[2]])
  }
  for (const b of model.bodies) {
    if (out.has(b.id)) continue
    let seed: Position | undefined
    for (const e of model.edges) {
      const other = e.from === b.index ? model.bodies[e.to] : e.to === b.index ? model.bodies[e.from] : null
      const pos = other ? cached?.get(other.id) : undefined
      if (pos) { seed = [pos[0] + 0.3, pos[1] + 0.3, pos[2]]; break }
    }
    out.set(b.id, seed ?? seededPosition(b.id))
  }
  return out
}

/** Which body fields `buildRenderModel` actually read, recorded through a Proxy on every body. */
export function fieldsReadByGeometry(data: SceneDataConstellation): Set<string> {
  const read = new Set<string>()
  const spy = (body: Body): Body =>
    new Proxy(body, { get(target, key) { if (typeof key === 'string') read.add(key); return Reflect.get(target, key) } })
  buildRenderModel({ ...data, bodies: data.bodies.map(spy) })
  return read
}

/** Throws when the geometry side touched a field outside `FIELD_ALLOW_LIST`. */
export function assertOnlyAllowListedFields(data: SceneDataConstellation): void {
  const allowed = new Set<string>(FIELD_ALLOW_LIST)
  const extra = [...fieldsReadByGeometry(data)].filter((k) => !allowed.has(k))
  if (extra.length) throw new Error(`constellation geometry read non-allow-listed field(s): ${extra.join(', ')}`)
}
