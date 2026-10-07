// The ONE window keydown listener (studio-observatory.md §6.2). Frame mounts it once; every
// other component that wants a key reads the map rather than adding a listener of its own, so
// two screens can never both answer the same key. Handlers live in a ref: the listener is
// attached once and reads the latest callbacks, so a parent re-render costs no re-subscribe.
//
// Command center (togo-command-center.md §1, §3.1): the default table is `SHORTCUT_MAP` plus
// `COMMAND_CENTER_BINDINGS` — `g l` the lifecycle home, `g t` steering mode, and the lane board's
// `j k ↵ h v Esc`, which are live ONLY while the event comes from inside
// `[data-shortcut-scope="lanes"]`, exactly as the graph's keys are for `scene`.
import { useEffect, useRef } from 'react'
import {
  CHORD_WINDOW_MS, COMMAND_CENTER_BINDINGS, SHORTCUT_MAP, chordFromEvent, inLaneScope, inSceneScope, isMacPlatform, normalizeChord,
} from './shortcutMap'
import type { CommandCenterAction, LaneCommand, SceneCommand, ShortcutAction, ShortcutBinding, ShortcutScope } from './shortcutMap'
import type { BuildView, Home } from '../../shared/nav'

/** Every action the listener can dispatch: the §6.2 map and the command center's additions. */
export type AnyShortcutAction = ShortcutAction | CommandCenterAction
export type AnyShortcutBinding = ShortcutBinding<AnyShortcutAction>

/** The full table — what the listener reads by default and what the help renders. */
export const ALL_BINDINGS: readonly AnyShortcutBinding[] = [...SHORTCUT_MAP, ...COMMAND_CENTER_BINDINGS]

export interface ShortcutHandlers {
  openPalette?: () => void
  openShortcuts?: () => void
  toggleConsole?: () => void
  focusChat?: () => void
  openSettings?: () => void
  cycleTheme?: () => void
  toggleMotion?: () => void
  toggleDensity?: () => void
  toggleChat?: () => void
  goBuildView?: (view: BuildView) => void
  /** Receives the phase id typed after `g`; a stage the project does not have is the host's
   * no-op, since only it knows the registry. */
  goStage?: (stageId: string) => void
  stepStage?: (delta: 1 | -1) => void
  stageTab?: (tab: 1 | 2 | 3) => void
  stepDocument?: (delta: 1 | -1) => void
  saveField?: () => void
  /** Round 2 (I6): a graph key, dispatched only while the figure has focus (`inSceneScope`). The
   * figure runs its own keydown first and consumes the event, so this fires only for a host that
   * routes graph keys itself. */
  sceneCommand?: (command: SceneCommand) => void
  /** A lane key, dispatched only while the lane board has focus (`inLaneScope`); the board runs
   * its own keydown first (`laneCommandFor`), as the graph does. */
  laneCommand?: (command: LaneCommand) => void
  /** `g s` / `g l`: the two homes (togo-command-center.md §1). `g s` arrives as `goBuildView('sprint')`. */
  goHome?: (home: Home) => void
  /** `g t`: steering mode. */
  steering?: () => void
}

export interface UseShortcutsOptions {
  handlers: ShortcutHandlers
  /** The scopes that are live on the current screen; `global` is always live. */
  scopes?: readonly ShortcutScope[]
  bindings?: readonly AnyShortcutBinding[]
  /** Esc layering, innermost first: each closer returns true when it closed something, which
   * ends the chain. The sanctioned order is `shortcutMap.ESC_LAYERS` (dialog → palette → help →
   * spec card → steering → lane focus → graph hover → Board search → back); build the list with
   * `namedEscLayers({...})` so the order cannot drift between hosts. */
  escLayers?: readonly (() => boolean)[]
  /** Last resort for Esc: the screen's back. */
  onBack?: () => void
  /** Guards `onBack`: a FieldEditor draft, a hand-off form with text, an open AI proposal.
   * While dirty, Esc never navigates away (§6.2 Esc row [MF]). */
  isDirty?: () => boolean
  enabled?: boolean
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
}

/** Typing targets. A `<button>` or a checkbox is an input element too, but keys there are
 * navigation, not text; only text-bearing controls suppress single-key bindings. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(type)
  }
  const role = target.getAttribute('role')
  return role === 'textbox' || role === 'combobox' || role === 'searchbox'
}

export function dispatchShortcut(action: AnyShortcutAction, h: ShortcutHandlers): boolean {
  switch (action.type) {
    case 'palette': return call(h.openPalette)
    case 'shortcuts': return call(h.openShortcuts)
    case 'console': return call(h.toggleConsole)
    case 'focusChat': return call(h.focusChat)
    case 'settings': return call(h.openSettings)
    case 'theme': return call(h.cycleTheme)
    case 'motion': return call(h.toggleMotion)
    case 'density': return call(h.toggleDensity)
    case 'chat': return call(h.toggleChat)
    case 'buildView': return call(h.goBuildView, action.view)
    case 'stage': return call(h.goStage, action.stageId)
    case 'stageStep': return call(h.stepStage, action.delta)
    case 'stageTab': return call(h.stageTab, action.tab)
    case 'documentStep': return call(h.stepDocument, action.delta)
    case 'saveField': return call(h.saveField)
    case 'scene': return call(h.sceneCommand, action.command)
    case 'lane': return call(h.laneCommand, action.command)
    case 'home': return call(h.goHome, action.home)
    case 'steering': return call(h.steering)
  }
}

function call<A extends unknown[]>(fn: ((...a: A) => void) | undefined, ...args: A): boolean {
  if (!fn) return false
  fn(...args)
  return true
}

interface Pending { step: string; at: number }

export function useShortcuts(options: UseShortcutsOptions): void {
  const ref = useRef(options)
  ref.current = options
  const pending = useRef<Pending | null>(null)
  const enabled = options.enabled ?? true

  useEffect(() => {
    const target = ref.current.target === undefined ? (typeof window !== 'undefined' ? window : null) : ref.current.target
    if (!enabled || !target) return
    const isMac = isMacPlatform()

    const onKeyDown = (ev: Event) => {
      const e = ev as KeyboardEvent
      if (e.defaultPrevented) return
      const o = ref.current
      if (e.key === 'Escape') { if (handleEscape(o)) e.preventDefault(); return }
      const chord = chordFromEvent(e, isMac)
      if (!chord) return
      const editable = isEditableTarget(e.target)
      const live = new Set<ShortcutScope>(['global', ...(o.scopes ?? [])])
      // The graph's and the lanes' keys exist only while that figure has focus — never from the
      // host's scopes.
      if (inSceneScope(e.target)) live.add('scene')
      else live.delete('scene')
      if (inLaneScope(e.target)) live.add('lanes')
      else live.delete('lanes')
      const candidates = (o.bindings ?? ALL_BINDINGS).filter((b) => live.has(b.scope) && (b.inInputs || !editable))
      // Date.now(), not e.timeStamp: the latter is set at construction and a test cannot
      // control it, while fake timers control this.
      const now = Date.now()
      const first = pending.current && now - pending.current.at <= CHORD_WINDOW_MS ? pending.current.step : null
      pending.current = null
      if (first) {
        const hit = candidates.find((b) => b.keys.length === 2 && normalizeChord(b.keys[0]) === first && normalizeChord(b.keys[1]) === chord)
        if (hit) { if (dispatchShortcut(hit.action, o.handlers)) e.preventDefault(); return }
        // A sequence that went nowhere: fall through and read this key on its own.
      }
      const single = candidates.find((b) => b.keys.length === 1 && normalizeChord(b.keys[0]) === chord)
      if (single) { if (dispatchShortcut(single.action, o.handlers)) e.preventDefault(); return }
      if (candidates.some((b) => b.keys.length === 2 && normalizeChord(b.keys[0]) === chord)) {
        pending.current = { step: chord, at: now }
        e.preventDefault()
      }
    }

    target.addEventListener('keydown', onKeyDown)
    return () => target.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/** Esc: the first layer that closes something wins; back is last and only when nothing is
 * being edited. Returns whether anything happened. */
export function handleEscape(o: Pick<UseShortcutsOptions, 'escLayers' | 'onBack' | 'isDirty'>): boolean {
  for (const layer of o.escLayers ?? []) {
    if (layer()) return true
  }
  if (o.onBack && !(o.isDirty?.() ?? false)) { o.onBack(); return true }
  return false
}
