// The handful of constants every scene shares (studio-observatory.md §5.0 `sceneDefaults.ts`).
//
// `import.meta.env.MODE` is a BUILD-time flag, so it is the same in vitest ('test') and in the
// Playwright build (`vite build --mode=test`): in both, the DOM table is the default surface and
// the decorative Ambient field is off. That is what lets the e2e geometry pins see the final
// layout on first paint and lets `sceneShell.test` prove no scene chunk is ever requested unless
// a test toggles the graph on purpose.
import type { SceneSurface } from './types'

const MODE: string = import.meta.env.MODE

/** Which surface a scene opens on when nobody has chosen one yet. */
export const DEFAULT_SURFACE: SceneSurface = MODE === 'test' ? 'table' : 'graph'

/** Whether the no-data Ambient field may mount at all. Pure decoration, so test builds skip it. */
export const AMBIENT_ENABLED: boolean = MODE !== 'test'

/** Device pixel ratio ceiling for every Canvas. Above 1.5 the GPU cost doubles for a sharpness
 * difference nobody can see on a label-sized plate. */
export const MAX_DPR = 1.5

/** More bodies than this and the constellation shows its table with a notice instead of a graph
 * nobody could read. */
export const MAX_BODIES = 400

/** Up to this many nodes the force layout runs its 240 ticks synchronously (≈ 5–15 ms); above it
 * the layout is settled incrementally over a few frames so the first paint is not blocked. */
export const SYNC_LAYOUT_MAX = 150

/** Below this host width the graph cannot fit its plates; the table renders alone. */
export const MIN_GRAPH_WIDTH = 640
