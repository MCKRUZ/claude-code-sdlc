// The palette's actions group (studio-observatory.md §6.1 "Actions"). Every row here toggles a
// preference or navigates; none writes to the project. A hook the host did not pass means the
// screen cannot honour that action, so the row is simply absent rather than shown and inert.
import type { MotionPreference } from '../motion/contract'
import type { SceneSurfaceValue } from '../ui/contract-data'
import type { DensityAttr, ThemePreference } from '../theme/tokens'
import type { PaletteActionHooks, PaletteActionId, PaletteEntry } from './types'

const THEME_CYCLE: readonly ThemePreference[] = ['system', 'light', 'dark']
const THEME_LABEL: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const MOTION_CYCLE: readonly MotionPreference[] = ['auto', 'on', 'off']
const MOTION_LABEL: Record<MotionPreference, string> = { auto: 'Auto', on: 'On', off: 'Off' }

export function nextTheme(current: ThemePreference): ThemePreference {
  const i = THEME_CYCLE.indexOf(current)
  return THEME_CYCLE[(i + 1) % THEME_CYCLE.length]
}

/** auto → on → off → auto, the order the Appearance toggle lists them in. */
export function nextMotion(current: MotionPreference): MotionPreference {
  const i = MOTION_CYCLE.indexOf(current)
  return MOTION_CYCLE[(i + 1) % MOTION_CYCLE.length]
}

export function nextDensity(current: DensityAttr): DensityAttr {
  return current === 'compact' ? 'comfortable' : 'compact'
}

/** The `localStorage` key a scene's Graph / Table choice lives under, by scene. The Sprint key is
 * the one AppearanceSection already writes; the Spine key is its sibling. */
export const SURFACE_STORAGE_KEYS = {
  spine: 'studio.spine.surface',
  sprint: 'studio.sprint.surface',
} as const

export type SurfaceScene = keyof typeof SURFACE_STORAGE_KEYS

/** Flips the stored surface for one scene and raises a `storage` event on this window, which a
 * cross-window storage write would fire on its own but a same-window write never does — the
 * scene host subscribes to that event, so without it the palette's toggle would persist and not
 * show. Returns the new value; `table` when nothing was stored (the test/default surface). */
export function toggleSurfacePreference(scene: SurfaceScene, win: Window | undefined = typeof window !== 'undefined' ? window : undefined): SceneSurfaceValue {
  const key = SURFACE_STORAGE_KEYS[scene]
  let current: string | null = null
  try {
    current = win?.localStorage.getItem(key) ?? null
  } catch {
    // Blocked storage: treat as unset and still announce the flip for this session.
  }
  const next: SceneSurfaceValue = current === 'graph' ? 'table' : 'graph'
  try {
    win?.localStorage.setItem(key, next)
  } catch {
    // Not remembered this time; the event below still tells the open scene.
  }
  if (win && typeof win.dispatchEvent === 'function') {
    win.dispatchEvent(new StorageEvent('storage', { key, oldValue: current, newValue: next }))
  }
  return next
}

export const ACTION_ENTRY_ID = (id: PaletteActionId) => `action:${id}`

function action(id: PaletteActionId, title: string, keywords: string[], run: () => void, kbd?: string[], subtitle?: string): PaletteEntry {
  return { id: ACTION_ENTRY_ID(id), group: 'actions', title, subtitle, keywords, kbd, run }
}

/** Build the actions group from the hooks the host passed, in the design's order. Labels carry
 * the current value where one exists ("Theme: Dark → System") so the row says what will
 * happen, not just what it is about. */
export function buildActionEntries(hooks: PaletteActionHooks): PaletteEntry[] {
  const out: PaletteEntry[] = []
  if (hooks.theme) {
    const { value, set } = hooks.theme
    const next = nextTheme(value)
    out.push(action('theme', `Theme: ${THEME_LABEL[value]} → ${THEME_LABEL[next]}`, ['theme', 'dark', 'light', 'system', 'appearance'],
      () => set(next), ['Mod', 'Shift', 'D']))
  }
  if (hooks.density) {
    const { value, set } = hooks.density
    const next = nextDensity(value)
    out.push(action('density', `Toggle density: ${value} → ${next}`, ['density', 'compact', 'comfortable', 'spacing'],
      () => set(next), ['Mod', 'Shift', 'L']))
  }
  if (hooks.motion) {
    const { value, set } = hooks.motion
    const next = nextMotion(value)
    out.push(action('motion', `Animations: ${MOTION_LABEL[value]} → ${MOTION_LABEL[next]}`, ['motion', 'animations', 'reduce'],
      () => set(next), ['Mod', 'Shift', 'M']))
  }
  if (hooks.toggleConsole) out.push(action('console', 'Toggle console', ['console', 'log', 'commands'], hooks.toggleConsole, ['Mod', 'J']))
  if (hooks.toggleChat) out.push(action('chat', 'Toggle chat panel', ['chat', 'talk', 'panel'], hooks.toggleChat, ['Mod', '\\']))
  if (hooks.toggleSpine) out.push(action('spine', 'Collapse or expand the Spine', ['spine', 'sidebar', 'collapse', 'expand', 'lifecycle'], hooks.toggleSpine))
  if (hooks.toggleSurface) out.push(action('surface', 'Graph or Table for the visible scene', ['graph', 'table', 'scene', '3d', 'surface'], hooks.toggleSurface))
  // Round 2 (I6): the graph's two commands, present only while a graph is on screen. Screen
  // callbacks — they move the camera home and focus a plate; nothing is fetched or written.
  if (hooks.fitGraph) out.push(action('fit-graph', 'Fit the graph', ['fit', 'graph', 'camera', 'home', 'reset', 'view'], hooks.fitGraph, ['Home']))
  if (hooks.focusNextUp) out.push(action('focus-next-up', 'Focus next up', ['next', 'up', 'graph', 'focus', 'spec'], hooks.focusNextUp, ['n']))
  if (hooks.refreshScreen) {
    // P-class reads only: the screen's own refresh. Never openProject or pull (§6.1 [MF]).
    out.push(action('refresh', 'Refresh this screen', ['refresh', 'reload', 'reread'], hooks.refreshScreen, undefined,
      'Re-reads what this screen shows; changes nothing'))
  }
  if (hooks.copyProjectPath) out.push(action('copy-path', 'Copy project path', ['copy', 'path', 'folder', 'clipboard'], hooks.copyProjectPath))
  if (hooks.openShortcuts) out.push(action('shortcuts', 'Keyboard shortcuts', ['shortcuts', 'keys', 'help', 'keyboard'], hooks.openShortcuts, ['Mod', '/']))
  // The committee's read-only view of the standard's numbers (§3.5): a navigation, never a write.
  if (hooks.steering) out.push(action('steering', 'Steering mode', ['steering', 'committee', 'scorecard', 'presentation', 'read-only', 'sprint'], hooks.steering, undefined, 'Read-only: the scorecard and the review page, no controls'))
  if (hooks.reportIssue) out.push(action('report-issue', 'Report an issue…', ['report', 'issue', 'bug', 'problem', 'broken', 'feedback', 'screenshot'], hooks.reportIssue, undefined, 'A bug in the product — the plugin\'s questions, your screenshot, one line it runs'))
  if (hooks.back) out.push(action('back', 'Back', ['back', 'return', 'previous'], hooks.back, ['Esc']))
  if (hooks.newProject) out.push(action('new-project', 'New project…', ['new', 'project', 'create'], hooks.newProject))
  if (hooks.openFolder) out.push(action('open-folder', 'Open folder…', ['open', 'folder', 'project', 'switch'], hooks.openFolder))
  return out
}
