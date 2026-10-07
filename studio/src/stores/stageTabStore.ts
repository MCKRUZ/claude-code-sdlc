// Requests FROM the shell TO the stage home, when the two share no parent that could hold the
// state: the `1`/`2`/`3` shortcuts and the palette's "Collapse or expand the Spine" are read by
// App / Frame, but the tab row and the Spine band live inside StageHome. A module store with
// `useSyncExternalStore` lets the shell write and StageHome read without a prop threaded through
// every screen in between — the same shape as `spineStore`. No IPC: this is UI state only.
//
// A tab request carries a `nonce` so pressing `1` while Workflow is already showing is still a
// new request (StageHome re-asserts the tab; a plain value would compare equal and do nothing).
import { useSyncExternalStore } from 'react'

export type StageTabName = 'workflow' | 'documents' | 'guide'
export type StageTabNumber = 1 | 2 | 3

export interface StageTabRequest {
  tab: StageTabName
  /** Increments on every request, so two requests for the same tab are two events. */
  nonce: number
}

/** Same key StageHome has always read for the Spine band's collapsed state (§7 StageHome row).
 * Values: `'1'` collapsed, `'0'` expanded. ABSENT means the default — collapsed — because the
 * lifecycle strip (togo-command-center.md §1) already draws the nine stations above every screen,
 * and a second full Spine beneath it pushed a stage's documents below the fold (the v11 stage
 * shots). The `^` control expands it; the choice is remembered per machine. */
export const SPINE_COLLAPSED_STORAGE_KEY = 'studio.spine.collapsed'
export const SPINE_COLLAPSED_DEFAULT = true

/** The tab row's order, which is what the digit shortcuts mean (§6.2). */
export const STAGE_TAB_BY_NUMBER: Readonly<Record<StageTabNumber, StageTabName>> = {
  1: 'workflow',
  2: 'documents',
  3: 'guide',
}

interface Snapshot {
  tabRequest: StageTabRequest | null
  spineCollapsed: boolean
}

type Listener = () => void

function readCollapsed(): boolean {
  try {
    if (typeof localStorage === 'undefined') return SPINE_COLLAPSED_DEFAULT
    const stored = localStorage.getItem(SPINE_COLLAPSED_STORAGE_KEY)
    if (stored === '1') return true
    if (stored === '0') return false
    return SPINE_COLLAPSED_DEFAULT
  } catch {
    return SPINE_COLLAPSED_DEFAULT
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SPINE_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Not remembered this time; the band still collapses for this session.
  }
}

// Read lazily on first use rather than at import: node-env tests import stores without a window.
let snapshot: Snapshot | null = null
const listeners = new Set<Listener>()
let nonce = 0

function current(): Snapshot {
  if (snapshot === null) snapshot = { tabRequest: null, spineCollapsed: readCollapsed() }
  return snapshot
}

function publish(next: Snapshot): void {
  snapshot = next
  for (const listener of Array.from(listeners)) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Snapshot {
  return current()
}

/** Ask the stage home to show a tab. Accepts the digit the shortcut map carries or the name the
 * tab row uses, so neither caller has to translate. */
function request(tab: StageTabName | StageTabNumber): void {
  const name = typeof tab === 'number' ? STAGE_TAB_BY_NUMBER[tab] : tab
  nonce += 1
  publish({ ...current(), tabRequest: { tab: name, nonce } })
}

function setSpineCollapsed(collapsed: boolean): void {
  writeCollapsed(collapsed)
  if (current().spineCollapsed === collapsed) return
  publish({ ...current(), spineCollapsed: collapsed })
}

function toggleSpineCollapsed(): void {
  setSpineCollapsed(!current().spineCollapsed)
}

export const stageTabStore = {
  getSnapshot,
  subscribe,
  request,
  setSpineCollapsed,
  toggleSpineCollapsed,
  get tabRequest(): StageTabRequest | null {
    return current().tabRequest
  },
  get spineCollapsed(): boolean {
    return current().spineCollapsed
  },
}

const selectTab = () => current().tabRequest
const selectSpine = () => current().spineCollapsed

/** The latest tab request, or null when none has been made. Compare `nonce`, not `tab`, to act
 * on each press; SSR-safe (the server snapshot is the same object). */
export function useStageTabRequest(): StageTabRequest | null {
  return useSyncExternalStore(subscribe, selectTab, selectTab)
}

/** The Spine band's collapsed state, shared with `studio.spine.collapsed`. */
export function useSpineCollapsed(): boolean {
  return useSyncExternalStore(subscribe, selectSpine, selectSpine)
}

/** For tests: forget every request and re-read the collapsed preference. */
export function resetStageTabStore(): void {
  nonce = 0
  snapshot = null
  for (const listener of Array.from(listeners)) listener()
}
