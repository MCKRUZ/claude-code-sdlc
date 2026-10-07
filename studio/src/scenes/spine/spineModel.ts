// The Lifecycle Spine's model (studio-observatory.md §5.1): pure functions from the plugin's
// `ProjectStatus.stages[]` to the stations the scene draws and the rows the table lists.
//
// Nothing here is a judgement. `kind` comes from `nodeKind()` in `shared/nav.ts` (never re-derived),
// the group from `groupStages()`, the lit length of the rail from the ORDERED `stage_state` list —
// a count of signed-off stations, never time — and the doc arc exists only when both numbers are
// known. Stations are equally spaced because time is not a length. No three import: the scene and
// the node-env test both read this file, and three must stay out of the main bundle's graph.
import type { ProjectStage } from '../../../shared/types'
import { BUILD_STAGE_ID, BUILD_VIEWS, groupStages, nodeKind, stageMeta } from '../../../shared/nav'
import type { ColorToken, ThemeAttr } from '../../theme/tokens'
import type { DocArc, SceneDataSpine, Station } from '../core/types'

export const SPINE_TITLE = 'Lifecycle'
/** The long sentence: the Table twin's caption (round 2, S3 moved it there from the figcaption). */
export const SPINE_LEGEND =
  "Nine stages in the plugin's order; the lit rail counts finished stages — signed off, or completed with no name recorded. Height and depth carry no meaning."
/** The figcaption (S3): condensed, and still carrying the honesty words. */
export const SPINE_CAPTION = 'Lit rail = finished stages. Height and depth carry no meaning.'
export const NO_NAME_RECORDED = 'no name recorded'
export const NO_DATE = '—'

/** Round 2 (S3): the short label a station plate wears, by stage id — every stage the registry
 * (`phases/phase-registry.yaml`) lists. The full `display` is shown on hover and on the current
 * station, and is always the accessible name. A stage the map does not know falls back to the
 * part of its display after "Phase N:", else the display itself — never a blank. */
export const STAGE_SHORT_LABEL: Readonly<Record<string, string>> = {
  '0': 'Discovery',
  '1': 'Requirements',
  '2': 'Design',
  '3': 'Foundation',
  [BUILD_STAGE_ID]: 'Build',
  '7': 'Documentation',
  '8': 'Deployment',
  '9': 'Monitoring',
  close: 'Close',
}

export function shortLabel(station: Pick<Station, 'id' | 'display'>): string {
  const known = STAGE_SHORT_LABEL[station.id]
  if (known) return known
  const after = station.display.split(':')[1]?.trim()
  return after && after.length > 0 ? after : station.display
}

/** Round 2 (I4): the ledger line a Closing plate carries under its title, word for word from
 * `signerText` / `formatStageDate` — "signed off · <name> · <date>", "completed · no name
 * recorded", "not started"; the current stage reads "in progress" (the sidebar's own word). */
export function ledgerLine(station: Pick<Station, 'stage_state' | 'signed_off_by' | 'completed_at' | 'kind'>): string {
  switch (station.kind) {
    case 'signed': return `signed off · ${signerText(station)} · ${formatStageDate(station.completed_at)}`
    case 'completed': return `completed · ${NO_NAME_RECORDED}`
    case 'current': return 'in progress'
    default: return 'not started'
  }
}

/** Station spacing along x. Equal on purpose: time is not a length. */
export const STATION_PITCH = 1.15
/** The rail's decorative wobble, world units. Small on purpose: the plates sit in two level
 * rows (`spineBands.ts`), and every unit of wobble is a row the band must be taller to hold. */
export const WOBBLE_Y = 0.06
export const WOBBLE_Z = 0.25

/** The station's drawn size (studio-observatory.md §5.1 "Geometry"), shared by the meshes and the
 * plate layout so the two cannot disagree about where a disc ends. Same for every station: no
 * fact in the data is a size. */
export const RING_RADIUS = 0.26
export const RING_TUBE = 0.032
export const KNOT_RADIUS = 0.21
export const KNOT_TUBE = 0.03
/** three's torus knot reaches `radius · (2 + cos) / 2`, so 1.5 × radius at its widest. */
export const KNOT_REACH = 1.5

/** The outer edge of a station's disc, world units: the ring's outer rim, or the knot's widest
 * reach for Build. A plate keeps clear of THIS, not of a guessed hit radius. */
export function discRadius(isBuild: boolean): number {
  return isBuild ? KNOT_RADIUS * KNOT_REACH + KNOT_TUBE : RING_RADIUS + RING_TUBE
}

/** Which token a not-started station's dashed ring is drawn in. Light keeps the stage colour; in
 * dark `stage-later-fill` is the same grey as `ink-4` and all but vanished against the ground
 * (observatory v4 critique, stage-dark), so the ring steps up one rung of the SAME ink ramp —
 * `ink-3`, the sidebar's "Not started" grey — which is still a grey, never a stage colour. */
export const LATER_RING_TOKEN = { light: 'stage-later-fill', dark: 'ink-3' } as const satisfies Record<ThemeAttr, ColorToken>

export interface SpineInput {
  stages: ProjectStage[]
  currentPhaseId: string | null
  /** `StageReadinessContext.currentDocs` for the current stage; anything non-numeric → null. */
  currentDocs?: { complete?: unknown; total?: unknown } | null
  /** I3: the stage whose home is open (the reticle); absent → null (no reticle). */
  viewedStageId?: string | null
  /** I4: Closing asks every plate for its ledger line; absent → false. */
  ledger?: boolean
}

function docArcFrom(docs: SpineInput['currentDocs']): DocArc | null {
  if (!docs) return null
  const { complete, total } = docs
  if (typeof complete !== 'number' || typeof total !== 'number') return null
  if (!Number.isFinite(complete) || !Number.isFinite(total) || total <= 0) return null
  return { complete, total }
}

/** `ProjectStatus` → the scene's data. The input is the plugin's rows verbatim. */
export function buildSpineData(input: SpineInput): SceneDataSpine {
  const { stages, currentPhaseId } = input
  const groupOf = new Map<string, string>()
  for (const group of groupStages(stages)) for (const s of group.stages) groupOf.set(s.id, group.label)

  const stations: Station[] = stages.map((stage, index) => ({
    id: stage.id,
    index,
    display: stage.display,
    kind: nodeKind(stage),
    stage_state: stage.stage_state,
    signed_off_by: stage.signed_off_by,
    entered_at: stage.entered_at,
    completed_at: stage.completed_at,
    artifact_count: stage.artifact_count,
    isCurrent: stage.id === currentPhaseId,
    isBuild: stage.id === BUILD_STAGE_ID,
    group: groupOf.get(stage.id) ?? 'Other',
  }))

  const current = stations.find((s) => s.isCurrent)
  return {
    stations,
    currentStageId: current ? current.id : null,
    currentDocs: current ? docArcFrom(input.currentDocs) : null,
    // The rail's lit length: every FINISHED station (`nodeKind` signed OR completed), because the
    // plugin's `signed_off` state encodes only `status == completed`. Whether a name was recorded
    // is the plate's and the summary's business — see `spineSummary`.
    signedCount: stations.filter((s) => s.kind === 'signed' || s.kind === 'completed').length,
    viewedStageId: input.viewedStageId ?? null,
    ledger: input.ledger ?? false,
  }
}

// --- geometry (positions and rail fractions) ---------------------------------------------------

export interface StationPoint {
  x: number
  y: number
  z: number
}

/** Station `i` of `n`: equally spaced along x, with a gentle wobble in y / z that is decoration
 * only (the figcaption says so). The design's `(i − 4)·1.15` for nine, centred for any count. */
export function stationPoint(i: number, n: number): StationPoint {
  const mid = (n - 1) / 2
  return { x: (i - mid) * STATION_PITCH, y: Math.sin(i * 0.55) * WOBBLE_Y, z: Math.cos(i * 0.4) * WOBBLE_Z }
}

/** The rail fraction (0…1) at station `i` of `n`. One station alone sits at 0. */
export function stationU(i: number, n: number): number {
  return n <= 1 ? 0 : i / (n - 1)
}

export interface RailProgress {
  /** Fraction of the rail from its start to the LAST signed-off station, in plugin order. 0 when
   * no station is signed off. */
  uLit: number
  /** Fraction at the current station; equals `uLit` when there is no current station, so the
   * flat span between them has zero length. */
  uCurrent: number
}

/** What the rail's `uLit` / `uCurrent` uniforms receive. Between them the shader paints a FLAT
 * line — there is no gradient uniform to feed, because the plugin reports no progress between
 * stations (§5.1 "Materials"). */
export function railProgress(data: SceneDataSpine): RailProgress {
  const n = data.stations.length
  let lastSigned = -1
  for (const s of data.stations) if (s.stage_state === 'signed_off') lastSigned = s.index
  const uLit = lastSigned < 0 ? 0 : stationU(lastSigned, n)
  const current = data.stations.find((s) => s.isCurrent)
  const uCurrent = current ? Math.max(uLit, stationU(current.index, n)) : uLit
  return { uLit, uCurrent }
}

/** The partial doc arc's sweep in radians, or null when `currentDocs` is unknown — null means NO
 * arc, not an empty one (§5.4 "No fabricated zero"). */
export function docArcTheta(data: SceneDataSpine): number | null {
  const docs = data.currentDocs
  if (!docs) return null
  const fraction = Math.min(1, Math.max(0, docs.complete / docs.total))
  return Math.PI * 2 * fraction
}

export interface GroupCaption {
  label: string
  /** Index range of the stations in the group, inclusive. */
  from: number
  to: number
}

/** Foundation / Build / Ship / Close (and "Other" if the registry grew), as index ranges. */
export function groupCaptions(data: SceneDataSpine): GroupCaption[] {
  return groupStages(data.stations).map((g) => ({
    label: g.label,
    from: g.stages[0].index,
    to: g.stages[g.stages.length - 1].index,
  }))
}

// --- words (plates, table, summary) ------------------------------------------------------------

/** ISO timestamp → its calendar date, or "—". Never a duration. */
export function formatStageDate(iso: string | null): string {
  if (!iso) return NO_DATE
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10)
}

/** The "Signed off by" cell: the recorded name for a `signed` station, "no name recorded" for a
 * `completed` one (the plugin finished it; nobody signed), "—" otherwise. Vocabulary is
 * `nodeKind()`'s, never re-derived from the raw `stage_state`. */
export function signerText(station: Pick<Station, 'stage_state' | 'signed_off_by'>): string {
  const kind = nodeKind(station)
  if (kind === 'signed') return station.signed_off_by!.trim()
  if (kind === 'completed') return NO_NAME_RECORDED
  return NO_DATE
}

export function artifactsText(count: number): string {
  return `${count} ${count === 1 ? 'artifact' : 'artifacts'}`
}

/** The lines a plate shows when expanded; Build adds its five views because it is a loop.
 *
 * The first line is the sidebar's own `stageMeta` sentence, verbatim — "Signed off · Priya N",
 * "Completed · no name recorded", "0 of 5 documents complete" (the current station, when its
 * readiness is known), "Not started" — so the plate and the row under the same stage never say
 * two different things. `artifact_count` is the plugin's count of files in the stage's artifact
 * folder; for a not-started stage that is 0 by definition and is NOT shown, because a bare
 * "0 artifacts" beside "Not started" reads as a measurement of something that has not begun. */
export function plateLines(station: Station, docs: DocArc | null = null): string[] {
  const lines = [stageMeta(station, station.isCurrent ? docs : null)]
  if (station.kind !== 'later') {
    lines.push(`Entered ${formatStageDate(station.entered_at)}`, `Completed ${formatStageDate(station.completed_at)}`)
  }
  if (station.kind !== 'later' || station.artifact_count > 0) lines.push(artifactsText(station.artifact_count))
  if (station.isBuild) lines.push(BUILD_VIEWS.map((v) => v.label).join(' · '))
  return lines
}

/** "N signed off" plus ", M completed without a name" when the plugin finished a stage with no
 * signer recorded — the two are different facts (`nodeKind` signed vs completed) and the sentence
 * never folds the second into the first. */
export function finishedText(data: SceneDataSpine): string {
  const signed = data.stations.filter((s) => s.kind === 'signed').length
  const completed = data.stations.filter((s) => s.kind === 'completed').length
  const head = `${signed} signed off`
  return completed > 0 ? `${head}, ${completed} completed without a name` : head
}

/** "Phase 3 (4 of 9) current; 2 signed off, 1 completed without a name; next: Build" — the
 * figure's `aria-label` sentence. */
export function spineSummary(data: SceneDataSpine): string {
  const n = data.stations.length
  const current = data.stations.find((s) => s.isCurrent)
  const signed = finishedText(data)
  if (!current) return `No current stage of ${n}; ${signed}`
  const next = data.stations[current.index + 1]
  const head = `${current.display} (${current.index + 1} of ${n}) current; ${signed}`
  return next ? `${head}; next: ${next.display}` : head
}
