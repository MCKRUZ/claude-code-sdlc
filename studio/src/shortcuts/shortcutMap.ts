// The §6.2 keyboard map as data, plus the chord vocabulary that describes it. A binding is a
// list of steps ('Mod+K'; a two-step list is a GitHub-style sequence such as `g` then `b`) and
// an action the host handles. The map is data so the Shortcuts help dialog renders the same
// table the listener dispatches from — there is no second list to drift. ⌘W/Q/R/1–9 and the
// F-keys are deliberately absent: Electron and the OS own them.
import type { BuildView, Home } from '../../shared/nav'

/** `lanes` (togo-command-center.md §3.1) is live ONLY while the lane board has focus, exactly as
 * `scene` is for a graph: the board root carries `data-shortcut-scope="lanes"`. */
export type ShortcutScope = 'global' | 'project' | 'stageHome' | 'documentView' | 'board' | 'lanes' | 'scene'

/** Headings for the Shortcuts help, in the order the dialog lists the scopes. */
export const SHORTCUT_SCOPE_ORDER: readonly ShortcutScope[] = ['global', 'project', 'stageHome', 'documentView', 'board', 'lanes', 'scene']
export const SHORTCUT_SCOPE_LABEL: Readonly<Record<ShortcutScope, string>> = {
  global: 'Everywhere',
  project: 'In a project',
  stageHome: 'On a stage',
  documentView: 'In a document',
  board: 'On the Board',
  lanes: 'In the lanes',
  scene: 'In a graph',
}

/** Round 2 (I6): the `scene` scope is live ONLY while the figure has focus. The figure root
 * carries `data-shortcut-scope="scene"`; the listener looks for that ancestor of the event's
 * target, so a host never has to pass the scope and a key on the Board's list can never orbit. */
export const SCENE_SCOPE_ATTR = 'data-shortcut-scope'
export const SCENE_SCOPE_VALUE = 'scene'

/** What a key does inside a graph. The figure runs these itself from its own keydown (it works
 * with no host listener mounted); the single window listener dispatches the same commands when
 * the figure is focused; the help dialog lists them under "In a graph" — one table, three readers. */
export type SceneCommand =
  | 'fit' | 'nextUp' | 'orbitLeft' | 'orbitRight' | 'orbitUp' | 'orbitDown'
  | 'zoomIn' | 'zoomOut' | 'stepPrev' | 'stepNext' | 'clear'

export type ShortcutAction =
  | { type: 'palette' }
  | { type: 'shortcuts' }
  | { type: 'console' }
  | { type: 'focusChat' }
  | { type: 'settings' }
  | { type: 'theme' }
  | { type: 'motion' }
  | { type: 'density' }
  | { type: 'chat' }
  | { type: 'buildView'; view: BuildView }
  | { type: 'stage'; stageId: string }
  | { type: 'stageStep'; delta: 1 | -1 }
  | { type: 'stageTab'; tab: 1 | 2 | 3 }
  | { type: 'documentStep'; delta: 1 | -1 }
  | { type: 'saveField' }
  | { type: 'scene'; command: SceneCommand }

/** What a key does inside the lane board (togo-command-center.md §3.1): `j`/`k` roving focus,
 * `↵` opens the card, `h` the hand-off dialog, `v` the verdict dialog, `Esc` clears. The board
 * runs these itself from its own keydown (`laneCommandFor`), as the graph does; the help lists
 * them under "In the lanes". */
export type LaneCommand = 'next' | 'prev' | 'open' | 'handoff' | 'verdict' | 'clear'

/** The command center's own actions. Kept as a SEPARATE union so `dispatchShortcut`'s switch over
 * `ShortcutAction` stays exhaustive until P4 widens it to `ShortcutAction | CommandCenterAction`
 * and spreads `COMMAND_CENTER_BINDINGS` into the listener and the help. `g s` and `g p` need no
 * new action: they are `buildView` bindings in `SHORTCUT_MAP` already. */
export type CommandCenterAction =
  | { type: 'lane'; command: LaneCommand }
  | { type: 'home'; home: Home }
  | { type: 'steering' }

export interface ShortcutBinding<A = ShortcutAction> {
  keys: string[]
  action: A
  scope: ShortcutScope
  /** Fires even while an input, textarea, select or contenteditable has focus. */
  inInputs?: boolean
  label: string
}

/** How long the second key of a sequence may follow the first. */
export const CHORD_WINDOW_MS = 800

const STAGE_SEQUENCES: ShortcutBinding[] = [
  ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map<ShortcutBinding>((d) => ({
    keys: ['g', d], action: { type: 'stage', stageId: d }, scope: 'project', label: `Go to Phase ${d}`,
  })),
  { keys: ['g', '.'], action: { type: 'stage', stageId: 'close' }, scope: 'project', label: 'Go to Close' },
]

/** A command-center binding: the same row shape, a command-center action. */
export type CcBinding = ShortcutBinding<CommandCenterAction>

export const LANE_SCOPE_VALUE = 'lanes'

/** The lane board's own keys (togo-command-center.md §3.1). `Esc` is listed for the reader; the
 * window listener handles Escape before any chord, so the board's keydown is what clears. */
export const LANE_BINDINGS: readonly CcBinding[] = [
  { keys: ['j'], action: { type: 'lane', command: 'next' }, scope: 'lanes', label: 'Next card' },
  { keys: ['k'], action: { type: 'lane', command: 'prev' }, scope: 'lanes', label: 'Previous card' },
  { keys: ['Enter'], action: { type: 'lane', command: 'open' }, scope: 'lanes', label: 'Open the card' },
  { keys: ['h'], action: { type: 'lane', command: 'handoff' }, scope: 'lanes', label: 'Hand off' },
  { keys: ['v'], action: { type: 'lane', command: 'verdict' }, scope: 'lanes', label: 'Record a verdict' },
  { keys: ['Esc'], action: { type: 'lane', command: 'clear' }, scope: 'lanes', label: 'Clear the focus' },
]

/** The two homes and steering mode (togo-command-center.md §1, §3.5): `g l` the lifecycle home,
 * `g t` steering. (`g s` the sprint home and `g p` planning are `buildView` rows in `SHORTCUT_MAP`.) */
export const COMMAND_CENTER_SEQUENCES: readonly CcBinding[] = [
  { keys: ['g', 'l'], action: { type: 'home', home: 'lifecycle' }, scope: 'project', label: 'Go to the lifecycle home' },
  { keys: ['g', 't'], action: { type: 'steering' }, scope: 'project', label: 'Steering mode' },
]

/** Everything the command center adds, for the listener and the help to spread in. */
export const COMMAND_CENTER_BINDINGS: readonly CcBinding[] = [...LANE_BINDINGS, ...COMMAND_CENTER_SEQUENCES]

/** The graph's own keys (I6). `Esc` is listed for the reader; the listener handles Escape before
 * any chord, so the figure's keydown is what clears the hover. */
export const SCENE_BINDINGS: readonly ShortcutBinding[] = [
  { keys: ['Home'], action: { type: 'scene', command: 'fit' }, scope: 'scene', label: 'Fit the graph' },
  { keys: ['n'], action: { type: 'scene', command: 'nextUp' }, scope: 'scene', label: 'Focus next up' },
  { keys: ['Shift+ArrowLeft'], action: { type: 'scene', command: 'orbitLeft' }, scope: 'scene', label: 'Orbit sideways' },
  { keys: ['Shift+ArrowRight'], action: { type: 'scene', command: 'orbitRight' }, scope: 'scene', label: 'Orbit sideways' },
  { keys: ['Shift+ArrowUp'], action: { type: 'scene', command: 'orbitUp' }, scope: 'scene', label: 'Orbit up or down' },
  { keys: ['Shift+ArrowDown'], action: { type: 'scene', command: 'orbitDown' }, scope: 'scene', label: 'Orbit up or down' },
  { keys: ['+'], action: { type: 'scene', command: 'zoomIn' }, scope: 'scene', label: 'Zoom in' },
  { keys: ['='], action: { type: 'scene', command: 'zoomIn' }, scope: 'scene', label: 'Zoom in' },
  { keys: ['-'], action: { type: 'scene', command: 'zoomOut' }, scope: 'scene', label: 'Zoom out' },
  { keys: ['ArrowUp'], action: { type: 'scene', command: 'stepPrev' }, scope: 'scene', label: 'Previous spec in build order' },
  { keys: ['ArrowDown'], action: { type: 'scene', command: 'stepNext' }, scope: 'scene', label: 'Next spec in build order' },
  { keys: ['Esc'], action: { type: 'scene', command: 'clear' }, scope: 'scene', label: 'Clear the hover' },
]

export const SHORTCUT_MAP: readonly ShortcutBinding[] = [
  { keys: ['Mod+K'], action: { type: 'palette' }, scope: 'global', inInputs: true, label: 'Command palette' },
  { keys: ['/'], action: { type: 'palette' }, scope: 'global', label: 'Command palette' },
  { keys: ['Mod+/'], action: { type: 'shortcuts' }, scope: 'global', inInputs: true, label: 'Keyboard shortcuts' },
  { keys: ['?'], action: { type: 'shortcuts' }, scope: 'global', label: 'Keyboard shortcuts' },
  { keys: ['Mod+J'], action: { type: 'console' }, scope: 'project', inInputs: true, label: 'Toggle console' },
  { keys: ['Mod+Shift+C'], action: { type: 'focusChat' }, scope: 'project', inInputs: true, label: 'Focus the chat composer' },
  { keys: ['Mod+,'], action: { type: 'settings' }, scope: 'project', inInputs: true, label: 'Settings' },
  { keys: ['Mod+Shift+D'], action: { type: 'theme' }, scope: 'global', inInputs: true, label: 'Cycle theme: system → light → dark' },
  { keys: ['Mod+Shift+M'], action: { type: 'motion' }, scope: 'global', inInputs: true, label: 'Toggle animations' },
  { keys: ['Mod+Shift+L'], action: { type: 'density' }, scope: 'global', inInputs: true, label: 'Toggle density' },
  { keys: ['Mod+\\'], action: { type: 'chat' }, scope: 'project', inInputs: true, label: 'Toggle the chat panel' },
  { keys: ['g', 'b'], action: { type: 'buildView', view: 'board' }, scope: 'project', label: 'Go to the Board' },
  { keys: ['g', 's'], action: { type: 'buildView', view: 'sprint' }, scope: 'project', label: 'Go to the sprint home' },
  { keys: ['g', 'p'], action: { type: 'buildView', view: 'planning' }, scope: 'project', label: 'Go to sprint planning' },
  { keys: ['g', 'h'], action: { type: 'buildView', view: 'going' }, scope: 'project', label: 'Go to How it is going' },
  { keys: ['g', 'c'], action: { type: 'buildView', view: 'closing' }, scope: 'project', label: 'Go to Closing' },
  { keys: ['g', 'd'], action: { type: 'buildView', view: 'documents' }, scope: 'project', label: 'Go to the Build documents' },
  ...STAGE_SEQUENCES,
  { keys: ['['], action: { type: 'stageStep', delta: -1 }, scope: 'project', label: 'Previous stage' },
  { keys: [']'], action: { type: 'stageStep', delta: 1 }, scope: 'project', label: 'Next stage' },
  { keys: ['1'], action: { type: 'stageTab', tab: 1 }, scope: 'stageHome', label: 'Workflow tab' },
  { keys: ['2'], action: { type: 'stageTab', tab: 2 }, scope: 'stageHome', label: 'Documents tab' },
  { keys: ['3'], action: { type: 'stageTab', tab: 3 }, scope: 'stageHome', label: 'Guide tab' },
  { keys: ['Alt+ArrowUp'], action: { type: 'documentStep', delta: -1 }, scope: 'documentView', label: 'Previous document' },
  { keys: ['Alt+ArrowDown'], action: { type: 'documentStep', delta: 1 }, scope: 'documentView', label: 'Next document' },
  { keys: ['Mod+S'], action: { type: 'saveField' }, scope: 'documentView', inInputs: true, label: 'Save the open field' },
  ...SCENE_BINDINGS,
]

/** The scene command a keydown means, from `SCENE_BINDINGS` and nothing else — the figure's own
 * keydown reads the same table the help renders. Escape resolves to `clear` here (the figure,
 * unlike the window listener, has no separate Escape chain). Null when the key is not a graph key. */
export function sceneCommandFor(e: KeyLike, isMac = isMacPlatform()): SceneCommand | null {
  if (e.key === 'Escape') return 'clear'
  const chord = chordFromEvent(e, isMac)
  if (!chord) return null
  const hit = SCENE_BINDINGS.find((b) => b.keys.length === 1 && b.action.type === 'scene' && normalizeChord(b.keys[0]) === chord)
  return hit && hit.action.type === 'scene' ? hit.action.command : null
}

/** True when `target` sits inside a focused graph figure (`[data-shortcut-scope="scene"]`). */
export function inSceneScope(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return (target as Element).closest(`[${SCENE_SCOPE_ATTR}="${SCENE_SCOPE_VALUE}"]`) !== null
}

/** The lane command a keydown means, from `LANE_BINDINGS` and nothing else — the lane board's
 * own keydown reads the same table the help renders. Escape resolves to `clear`. Null when the
 * key is not a lane key. */
export function laneCommandFor(e: KeyLike, isMac = isMacPlatform()): LaneCommand | null {
  if (e.key === 'Escape') return 'clear'
  const chord = chordFromEvent(e, isMac)
  if (!chord) return null
  const hit = LANE_BINDINGS.find((b) => b.keys.length === 1 && normalizeChord(b.keys[0]) === chord)
  return hit && hit.action.type === 'lane' ? hit.action.command : null
}

/** True when `target` sits inside the lane board (`[data-shortcut-scope="lanes"]`). */
export function inLaneScope(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return (target as Element).closest(`[${SCENE_SCOPE_ATTR}="${LANE_SCOPE_VALUE}"]`) !== null
}

/** The command-center action a two-key sequence means (`g l`, `g t`), or null. For the window
 * listener once P4 widens `dispatchShortcut`. */
export function commandCenterSequenceFor(first: string, second: string): CommandCenterAction | null {
  const a = normalizeChord(first)
  const b = normalizeChord(second)
  const hit = COMMAND_CENTER_SEQUENCES.find((x) => x.keys.length === 2 && normalizeChord(x.keys[0]) === a && normalizeChord(x.keys[1]) === b)
  return hit ? hit.action : null
}

// --- the keyboard model, documented as data (Q4) ----------------------------------------------

/** Esc closes the innermost thing, in THIS order, and stops at the first layer that closed
 * something; "back" is last and never fires while something is being edited. The listener's
 * `escLayers` is built from this order by `namedEscLayers` so no host can mis-order it, and the
 * help / README list the same rows. */
export type EscLayerName = 'dialog' | 'palette' | 'help' | 'spec-card' | 'steering' | 'lane-focus' | 'graph-hover' | 'board-search' | 'back'

export const ESC_LAYERS: readonly { layer: EscLayerName; closes: string }[] = [
  { layer: 'dialog', closes: 'an open dialog (verb, hand-off, verdict, close) — focus returns to its opener' },
  { layer: 'palette', closes: 'the omnibar' },
  { layer: 'help', closes: 'the Shortcuts help' },
  { layer: 'spec-card', closes: 'the spec card — back to the board, focus on the card that opened it' },
  { layer: 'steering', closes: 'steering mode — back to the screen it was entered from' },
  { layer: 'lane-focus', closes: 'the roving focus in the lanes' },
  { layer: 'graph-hover', closes: 'the hover in a graph' },
  { layer: 'board-search', closes: 'the Board search text' },
  { layer: 'back', closes: 'the screen (its own back) — never while a field, hand-off form or AI proposal is dirty' },
]

/** The listener's `escLayers`, in `ESC_LAYERS` order, from whichever closers a host has. */
export function namedEscLayers(closers: Partial<Record<Exclude<EscLayerName, 'back'>, () => boolean>>): (() => boolean)[] {
  return ESC_LAYERS.flatMap(({ layer }) => (layer !== 'back' && closers[layer] ? [closers[layer]!] : []))
}

/** The first chord bound to an action type, as `Kbd` keys — so a control can show its own
 * shortcut from the one map ("⌘ K" on the omnibar trigger, "h" on Hand off). Null when unbound. */
export function kbdFor<A extends { type: string }>(bindings: readonly ShortcutBinding<A>[], type: A['type'], match?: (a: A) => boolean, isMac = isMacPlatform()): string[][] | null {
  const hit = bindings.find((b) => b.action.type === type && (!match || match(b.action)))
  return hit ? hit.keys.map((step) => kbdKeys(step, isMac)) : null
}

export interface KeyboardRow { keys: string; where: string; does: string; inInputs: boolean }

/** The whole model as table rows — the README's "Keyboard shortcuts" table and the help's data
 * come from this, so a binding added to the map is documented by construction. Bindings sharing
 * a label collapse into one row with alternatives; the ten `g 0`…`g 9` collapse into one. */
export function describeBindings<A>(bindings: readonly ShortcutBinding<A>[]): KeyboardRow[] {
  const rows = new Map<string, KeyboardRow>()
  for (const b of bindings) {
    const phase = /^Go to Phase \d$/.test(b.label)
    const label = phase ? 'Go to Phase 0–9' : b.label
    const keys = phase ? '`g` `0`…`g` `9`' : b.keys.map((k) => `\`${k}\``).join(' ')
    const id = `${b.scope}:${label}`
    const row = rows.get(id) ?? { keys: '', where: SHORTCUT_SCOPE_LABEL[b.scope], does: label, inInputs: Boolean(b.inInputs) }
    if (!row.keys.includes(keys)) row.keys = row.keys ? `${row.keys}, ${keys}` : keys
    rows.set(id, row)
  }
  return Array.from(rows.values())
}

// --- chord vocabulary ------------------------------------------------------------------------

/** The primary modifier follows the platform, not a setting: ⌘ on a Mac, Ctrl elsewhere. Read
 * from `navigator.platform` (still the reliable signal in Electron; `userAgentData` is absent). */
export function isMacPlatform(nav: { platform?: string } | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(nav?.platform ?? '')
}

const MOD_ORDER = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift']

/** Canonical form so `Shift+Mod+K` and `Mod+Shift+K` compare equal. */
export function normalizeChord(step: string): string {
  // A chord whose KEY is `+` (the graph's zoom) splits into empties; put the key back.
  const parts = step.endsWith('+') ? [...step.slice(0, -1).split('+').filter(Boolean), '+'] : step.split('+').filter(Boolean)
  const key = parts[parts.length - 1] ?? step
  const mods = parts.slice(0, -1).sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b))
  return [...mods, key.length === 1 && mods.length > 0 ? key.toUpperCase() : key].join('+')
}

export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'OS', 'Dead'])

/** The chord a keydown represents, or null for a bare modifier press. Shift is recorded only
 * for letters and named keys — for `?`, `[` or `1` the key already carries the shifted
 * character, and `Shift+?` would never match the map's `?`. */
export function chordFromEvent(e: KeyLike, isMac: boolean): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === 'Unidentified') return null
  const primary = isMac ? e.metaKey : e.ctrlKey
  const secondary = isMac ? e.ctrlKey : e.metaKey
  const mods: string[] = []
  if (primary) mods.push('Mod')
  if (secondary) mods.push(isMac ? 'Ctrl' : 'Meta')
  if (e.altKey) mods.push('Alt')
  const key = e.key === ' ' ? 'Space' : e.key
  const isLetter = key.length === 1 && /[a-z]/i.test(key)
  if (e.shiftKey && (isLetter || key.length > 1)) mods.push('Shift')
  const shown = isLetter && mods.length > 0 ? key.toUpperCase() : key
  return normalizeChord([...mods, shown].join('+'))
}

/** The `Kbd` keys for one step, platform-resolved. */
export function kbdKeys(step: string, isMac = isMacPlatform()): string[] {
  return normalizeChord(step).split('+').map((k) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k))
}
