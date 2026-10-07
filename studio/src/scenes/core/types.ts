// Scene contracts (studio-observatory.md §5.0–5.3), frozen before any scene is written. The
// shapes here are the ONLY plugin facts a scene may read — the "Exact plugin data" rows of §5.1
// and §5.2 — so `constellationModel.test.ts` can assert the allow-list by type, and anything the
// plugin did not report (time, size, points, a Studio-computed "blocked") has no field to live in.
import type { ReactNode } from 'react'
import type { BoardRow, ProjectStage, SprintSlateRow } from '../../../shared/types'
import type { NodeKind } from '../../../shared/nav'

export type SceneId = 'spine' | 'constellation-sprint' | 'constellation-board' | 'ambient'

/** The two surfaces of equal rank. `table` is the DOM view; the toggle hides or shows the Canvas
 * and never changes the data path. */
export type SceneSurface = 'graph' | 'table'

/** Props of `SceneShell`, the only component a screen imports and the only place a `<Canvas>` is
 * created. `table` is REQUIRED: a scene without a DOM equivalent does not compile. */
export interface SceneShellProps {
  id: SceneId
  /** Eyebrow in the header row; also the `<figure>`'s accessible name via `aria-labelledby`. */
  title: string
  /** One sentence for `aria-label` ("Phase 3 of 9 current; 3 signed off; next: Build"). */
  summary: string
  /** The honesty line rendered as `<figcaption>` ("Height and depth carry no meaning."). */
  legend: string
  surface: SceneSurface
  onSurfaceChange: (next: SceneSurface) => void
  table: ReactNode
  /** The R3F tree. Mounted only when `surface === 'graph'`, WebGL is available and the host is
   * ≥ 640 px wide; otherwise `table` renders alone and three is never imported. */
  children?: ReactNode
  /** Height of the body in px (Spine: 168 comfortable / 120 compact / 200 on FeatureComplete). */
  height?: number
  className?: string
  /** The host's own control for the header row (the Spine band's collapse chevron), rendered
   * after the surface toggle so the figure has ONE header and one eyebrow. */
  headerExtra?: ReactNode
  /** Hide the Graph / Table toggle when the host already owns an equivalent control (the Board's
   * List | Graph segmented). Default true. */
  showToggle?: boolean
  'data-testid'?: string
}

// --- Spine (§5.1) ------------------------------------------------------------------------------

/** One stage as a station. Everything but `kind`, `index` and `isCurrent` is the plugin's row
 * verbatim; `kind` comes from `nodeKind()` in `shared/nav.ts`, never re-derived here. */
export interface Station {
  id: string
  index: number
  display: string
  kind: NodeKind
  stage_state: ProjectStage['stage_state']
  /** Null or blank reads "no name recorded" on the plate. */
  signed_off_by: string | null
  /** Rendered as dates or "—"; never as a length. */
  entered_at: string | null
  completed_at: string | null
  artifact_count: number
  isCurrent: boolean
  /** True for `BUILD_STAGE_ID`: drawn as a loop because Build is continuous. */
  isBuild: boolean
  /** Caption group from `groupStages()`: Foundation / Build / Ship / Close. */
  group: string
}

/** `currentDocs` from `StageReadinessContext`, for the current station only. The partial arc is
 * drawn only when both are numbers; null means no arc, not an empty one. */
export interface DocArc {
  complete: number
  total: number
}

export interface SceneDataSpine {
  stations: Station[]
  currentStageId: string | null
  /** Null when readiness is not yet known for the current stage. */
  currentDocs: DocArc | null
  /** Count of signed-off stations, in plugin order — the lit length of the rail. Never time. */
  signedCount: number
  /** Round 2 (I3): the stage whose home is open — the one the reticle ring marks and the Table
   * twin flags with `data-viewing` (never `aria-current`, never `kind="now"`). Distinct from
   * `currentStageId`, which is the plugin's "now". Null on Closing. The host (StageHome) writes
   * it; the scene only reads it. Required: `buildSpineData` fills null when a host passes none. */
  viewedStageId: string | null
  /** Round 2 (I4): true on Closing, where every plate carries its ledger line — "signed off ·
   * <name> · <date>" / "completed · no name recorded" / "not started" — word for word from the
   * plugin's row. Taller plates, camera 8 % further back. Never implied from `stage_state`.
   * Required: `buildSpineData` fills false when a host passes none. */
  ledger: boolean
}

// --- Constellation (§5.2) ----------------------------------------------------------------------

/** Which plugin row a body came from; the plate shows the matching fields. */
export type BodySource = 'sprint' | 'board'

/** One spec as a body. Radius is bound to `risk` ONLY. Prose fields (`waitingOn`, `dorBlocking`)
 * are plate text and never influence geometry or colour. */
export interface Body {
  id: string
  source: BodySource
  /** `name` (sprint) or `title` (board) — the plate's headline. */
  label: string
  status: string
  /** LOW / MEDIUM / HIGH as the plugin wrote it; the model maps it to .32 / .42 / .54. */
  risk: string
  type?: string
  channel?: string
  team?: string
  sprint: string
  nextOwner?: string
  engReview?: string
  dataReview?: string
  dor?: SprintSlateRow['dor']
  /** The checker's own MUST lines; plate text, verbatim. */
  dorBlocking?: string[]
  dependsOn: string[]
  /** Position in `SprintView.buildOrder` (0-based), or null when the plugin listed no order. */
  buildOrderIndex: number | null
  isNextUp: boolean
  /** The PR sentence, when there is one. */
  waitingOn?: string
  /** `pullRequest.overAlarm` → a warn-tone plate chip; `waitHours` is shown as text only. */
  overAlarm?: boolean
  waitHours?: number
  /** The row to hand `onOpenSpec` — a Sprint slate row is mapped to a BoardRow-shaped row
   * exactly as SprintBoard does today. */
  row: BoardRow | SprintSlateRow
}

/** A `depends_on` edge, dependent → dependency, as declared. */
export interface Tether {
  from: string
  to: string
  /** True when `to` is a Ghost (dashed, no flow). */
  ghost: boolean
}

/** A referenced id absent from the slate (Sprint) or the filtered rows (Board). The only rule:
 * data, not prose. The plate reads "not in this sprint" or "not shown". */
export interface Ghost {
  id: string
  reason: 'not-in-sprint' | 'not-shown'
  /** Which bodies point at it. */
  referencedBy: string[]
}

export interface SceneDataConstellation {
  source: BodySource
  bodies: Body[]
  tethers: Tether[]
  ghosts: Ghost[]
  /** Verbatim `SprintView.buildOrder`; keyboard order of the plates. Empty for Board bodies. */
  buildOrder: string[]
  nextUp: string | null
  /** Verbatim `SprintView.dependencyGaps` — rendered under the figure as a warn Notice, never
   * parsed, never drawn. Empty for Board bodies. */
  dependencyGaps: string[]
  /** `SprintView.hasData === false` → no scene; the host shows `note` or NoData text. */
  hasData: boolean
  note: string | null
  /** Command center (togo-command-center.md §3.2): true when the bodies are the plugin's slate
   * PROPOSAL rather than a committed slate — every `buildOrderIndex` is then null (the plugin has
   * given no order) and the host captions the figure `reasons.ORDER_ARRIVES_ON_COMMIT`. Absent
   * or false for a committed sprint and for Board bodies. Never changes geometry. */
  proposed?: boolean
}

// --- slots ------------------------------------------------------------------------------------

/** The scene data each `SceneId` renders. Ambient carries none, deliberately. */
export interface SceneDataById {
  spine: SceneDataSpine
  'constellation-sprint': SceneDataConstellation
  'constellation-board': SceneDataConstellation
  ambient: null
}

/** Props of the per-scene slot a `SceneShell` child receives (the R3F tree and its Plates).
 * `hoverId` is shared between pointer and keyboard so a focused plate gets the same emphasis. */
export interface SceneSlotProps<Id extends SceneId = SceneId> {
  id: Id
  data: SceneDataById[Id]
  hoverId: string | null
  onHover: (id: string | null) => void
  /** Spine: `onNavigate(targetForStage(id))`; Constellation: `onOpenSpec(row)`. */
  onActivate: (id: string) => void
  /** Whether the scene is live (pointer inside, a timeline playing) — drives the demand loop. */
  live: boolean
}
