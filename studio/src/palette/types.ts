// Command palette contracts (studio-observatory.md §6.1). The index is PURE and built from
// renderer state only — `PaletteIndexInput` is everything it may read, and there is no field for
// an IPC result it fetched itself, because the palette never calls `window.studio.*`.
import type { Area, BuildView, NavTarget } from '../../shared/nav'
import type { ProjectStage, StageReadiness } from '../../shared/types'
import type { BacklogStore } from '../stores/contract'
import type { MotionPreference } from '../motion/contract'
import type { DensityAttr, ThemePreference } from '../theme/tokens'

/** Group order is also tie-break order in `score.ts`. `verbs` (togo-command-center.md §3.6) is
 * the omnibar's one dynamic row — a plugin verb parsed from the typed words by `intents.ts` —
 * and leads, so `↵` on a match opens its dialog rather than the first static row. */
export type PaletteGroup = 'verbs' | 'recent' | 'stages' | 'build' | 'specs' | 'documents' | 'settings' | 'actions'

export const PALETTE_GROUP_ORDER: readonly PaletteGroup[] = ['verbs', 'recent', 'stages', 'build', 'specs', 'documents', 'settings', 'actions']

/** Prefix filters: `>` actions · `#` specs · `/` documents · `@` stages. There is no people
 * prefix (no per-person views). */
export type PalettePrefix = '>' | '#' | '/' | '@'

export const PALETTE_PREFIX_GROUP: Readonly<Record<PalettePrefix, PaletteGroup>> = {
  '>': 'actions',
  '#': 'specs',
  '/': 'documents',
  '@': 'stages',
}

/** One row. `run()` navigates or toggles a preference — never a write to the project (no "Pull
 * now", no "Refresh project status"; "Sign off" and friends are navigation entries that land on
 * their screens with their guards intact). */
export interface PaletteEntry {
  id: string
  group: PaletteGroup
  title: string
  subtitle?: string
  /** Extra match terms (a stage's id, a spec's id, a document's path). */
  keywords: string[]
  /** Shortcut hint rendered with `Kbd`, e.g. `['Mod', 'K']`. */
  kbd?: string[]
  run(): void
}

/** Settings section anchors, in the order Settings renders them. Each is the literal `id` the
 * section carries in SettingsScreen (`limits`, `approval` — not the longer names the palette once
 * guessed), because a jump scrolls to `document.getElementById(anchor)`. */
export type SettingsAnchor =
  | 'repository' | 'gate-approvals' | 'connection' | 'people' | 'limits'
  | 'approval' | 'tooling' | 'fixed-rules' | 'appearance'

/** The actions group, as ids so a test can assert the set is exactly this. "Refresh this screen"
 * re-runs the current screen's own P-class read and never `openProject` or `pull`. */
export type PaletteActionId =
  | 'theme' | 'density' | 'motion' | 'console' | 'chat' | 'spine'
  | 'surface' | 'fit-graph' | 'focus-next-up' | 'refresh' | 'copy-path' | 'shortcuts' | 'steering' | 'report-issue' | 'back' | 'new-project' | 'open-folder'

/** What the actions group needs from the host: current values (to label "Theme: Dark →
 * System") and the callbacks that apply them. Absent callback → the entry is omitted, so an
 * action never appears on a screen that cannot honour it. */
export interface PaletteActionHooks {
  theme?: { value: ThemePreference; set: (next: ThemePreference) => void }
  density?: { value: DensityAttr; set: (next: DensityAttr) => void }
  /** The stored preference (auto | on | off), cycled in that order — the same three states the
   * Appearance toggle offers, so the palette and the toggle never disagree about what "next" is. */
  motion?: { value: MotionPreference; set: (next: MotionPreference) => void }
  toggleConsole?: () => void
  toggleChat?: () => void
  toggleSpine?: () => void
  /** Only when a scene is on screen. */
  toggleSurface?: () => void
  /** Round 2 (I6): only while a graph is on screen — the figure's own camera / focus commands
   * (`scenes/core/sceneActions`), screen callbacks that reach no IPC. */
  fitGraph?: () => void
  focusNextUp?: () => void
  /** The current screen's own refresh (`StageReadinessContext.refresh`, the board's reload…). */
  refreshScreen?: () => void
  copyProjectPath?: () => void
  openShortcuts?: () => void
  /** Steering mode (togo-command-center.md §3.5) — a navigation, present only inside a project. */
  steering?: () => void
  /** Report an issue (/sdlc-report-issue in the app): captures the window, then opens the dialog. */
  reportIssue?: () => void
  back?: () => void
  newProject?: () => void
  openFolder?: () => void
}

/** Everything the index may read. All of it is renderer state already on screen. */
export interface PaletteIndexInput {
  /** `status.stages[]` → "Go to Phase N: Display". Empty before a project opens. */
  stages: ProjectStage[]
  currentStageId: string | null
  /** The stage whose documents and findings are listed (the viewed one). */
  viewedStageId: string | null
  readiness: StageReadiness | null
  /** Rows and slate last fetched by BuildBoard / SprintBoard. Both empty → the specs group reads
   * "Open the Board once to index specs". */
  backlog: Pick<BacklogStore, 'rows' | 'slate'>
  /** The five Build views (`BUILD_VIEWS`), passed in so the index does not import nav at runtime. */
  buildViews: { id: BuildView; label: string }[]
  settingsAnchors: readonly SettingsAnchor[]
  actions: PaletteActionHooks
  /** Last 8 picks, from `localStorage['studio.palette.recent']`. */
  recentIds: string[]
  area: Area | null
  navigate: (target: NavTarget) => void
  /** Open a spec by its repo-relative path, as the Board does. */
  openSpec: (relPath: string) => void
  openDocument: (path: string) => void
  openSettings: (anchor: SettingsAnchor) => void
}

/** `score.ts` result: dependency-free subsequence scorer with word-start and mono-id-prefix
 * bonuses and a recency boost; max 12 results. */
export interface ScoredEntry {
  entry: PaletteEntry
  score: number
  /** Character indices of `title` that matched, for highlighting. */
  matches: number[]
}

export const PALETTE_MAX_RESULTS = 12
export const PALETTE_RECENT_MAX = 8
