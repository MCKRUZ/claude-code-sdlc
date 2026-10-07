// Whether the chat aside is collapsed, PER AREA (owner's v12 critique, item 1): on the sprint
// home and planning the chat starts collapsed to a 40 px rail so the four lanes and the Today
// rail get the window; everywhere else it starts open as it always has. The band's Chat button,
// the `…` menu row and ⌘\ all flip the same flag for the showing area, and the choice is
// remembered per machine through the same localStorage bridge the Spine band and the chat width
// use (`studio.spine.collapsed`, `studio.chatWidth`). Collapsed is never unmounted: the aside
// keeps its place in DOM order (a11y.spec counts two asides, band then chat) and its composer
// keeps whatever was typed. No IPC: this is UI state only.
import { useSyncExternalStore } from 'react'
import type { Area } from '../../shared/nav'

export const CHAT_COLLAPSED_STORAGE_KEY = 'studio.chat.collapsed'

/** The rail a collapsed chat keeps: wide enough for a 32 px control and its 4 px of air. */
export const CHAT_RAIL_WIDTH = 40

/** The areas whose chat starts collapsed. The lanes are the work there; the chat is a step away. */
// Issues (plugin 1.8.0) joins them: the queue and the report in place want the width too.
export const CHAT_COLLAPSED_BY_DEFAULT: ReadonlySet<Area> = new Set<Area>(['sprint', 'planning', 'issues'])

type Stored = Partial<Record<Area, boolean>>
type Listener = () => void

let overrides: Stored | null = null
const listeners = new Set<Listener>()

function read(): Stored {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(CHAT_COLLAPSED_STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Stored = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'boolean') out[k as Area] = v
    return out
  } catch {
    return {}
  }
}

function write(next: Stored): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CHAT_COLLAPSED_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Not remembered this time; the choice still holds for this session.
  }
}

// Read lazily on first use rather than at import: node-env tests import stores without a window.
function current(): Stored {
  if (overrides === null) overrides = read()
  return overrides
}

function publish(next: Stored): void {
  overrides = next
  for (const listener of Array.from(listeners)) listener()
}

/** The default for an area, before any choice was remembered. Pure, so a test needs no DOM. */
export function defaultCollapsed(area: Area): boolean {
  return CHAT_COLLAPSED_BY_DEFAULT.has(area)
}

/** Whether the chat is collapsed for this area: the remembered choice, else the default. */
export function isChatCollapsed(area: Area): boolean {
  return current()[area] ?? defaultCollapsed(area)
}

function setCollapsed(area: Area, collapsed: boolean): void {
  if (isChatCollapsed(area) === collapsed && current()[area] !== undefined) return
  const next: Stored = { ...current(), [area]: collapsed }
  write(next)
  publish(next)
}

function toggle(area: Area): void {
  setCollapsed(area, !isChatCollapsed(area))
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const chatStore = {
  subscribe,
  isCollapsed: isChatCollapsed,
  setCollapsed,
  toggle,
}

/** The collapsed flag for an area, re-rendering the caller when it changes. SSR-safe. */
export function useChatCollapsed(area: Area): boolean {
  return useSyncExternalStore(subscribe, () => isChatCollapsed(area), () => defaultCollapsed(area))
}

/** For tests: forget every remembered choice (storage included) and read storage afresh on the
 * next call, so a test may seed storage after the reset. */
export function resetChatStore(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CHAT_COLLAPSED_STORAGE_KEY)
  } catch {
    // nothing to forget
  }
  overrides = null
  for (const listener of Array.from(listeners)) listener()
}
