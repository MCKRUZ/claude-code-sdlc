// The `lanes` shortcut scope (togo-command-center.md §3.1; `shared/shortcutMap.ts` LANE_BINDINGS):
// `j`/`k` roving focus across the visible cards in reading order, `↵` opens the card, `h` the
// hand-off dialog, `v` the verdict dialog, `Esc` clears. Live only while the pointer or focus is
// inside the board root (`data-shortcut-scope="lanes"`), decided by `inLaneScope` — the same
// rule the graphs use — so the global map keeps its keys everywhere else. The hook never reads
// `window.studio`; it only moves focus and calls back.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { inLaneScope, laneCommandFor, LANE_SCOPE_VALUE } from '../../shortcuts/shortcutMap'
import type { LaneRow } from './laneModel'

export { LANE_SCOPE_VALUE }

export interface LaneKeyHandlers {
  onOpen: (row: LaneRow) => void
  onHandOff?: (row: LaneRow) => void
  onVerdict?: (row: LaneRow) => void
}

export interface LaneKeys {
  /** The id of the card in the tab order (roving focus), or null before any card was touched. */
  activeId: string | null
  isActive: (row: LaneRow) => boolean
  /** Registers a card's button so `j`/`k` can focus it. */
  register: (id: string) => (el: HTMLButtonElement | null) => void
  /** A card took focus (mouse or keyboard) — makes it the roving one. */
  setActive: (row: LaneRow) => void
  /** The board root's keydown handler. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

/** `rows` is the VISIBLE order (after the filter), lane by lane; the roving index follows it. */
export function useLaneKeys(rows: readonly LaneRow[], handlers: LaneKeyHandlers, root: RefObject<HTMLElement | null>): LaneKeys {
  const [activeId, setActiveId] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  // A filter change can hide the active card; fall back to the first visible one.
  useEffect(() => {
    if (rows.length === 0) { setActiveId(null); return }
    if (activeId === null || !rows.some((r) => r.id === activeId)) setActiveId(rows[0].id)
  }, [rows, activeId])

  const register = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(id, el)
    else buttons.current.delete(id)
  }, [])

  const focusIndex = useCallback((index: number) => {
    const row = rows[index]
    if (!row) return
    setActiveId(row.id)
    buttons.current.get(row.id)?.focus()
  }, [rows])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (!inLaneScope(e.target)) return
    const command = laneCommandFor(e)
    if (!command) return
    // The focused card wins over the remembered one: a pointer focus and a key in the same
    // tick must act on the card under the finger, not the one React has not committed yet.
    const focusedId = (document.activeElement as HTMLElement | null)?.closest?.('[data-lane-card]')?.getAttribute('data-spec') ?? null
    const index = rows.findIndex((r) => r.id === (focusedId ?? activeId))
    const current = index >= 0 ? rows[index] : null
    switch (command) {
      case 'next': e.preventDefault(); focusIndex(index < 0 ? 0 : Math.min(rows.length - 1, index + 1)); return
      case 'prev': e.preventDefault(); focusIndex(index < 0 ? 0 : Math.max(0, index - 1)); return
      case 'open': if (current) { e.preventDefault(); handlers.onOpen(current) } return
      case 'handoff': if (current && handlers.onHandOff) { e.preventDefault(); handlers.onHandOff(current) } return
      case 'verdict': if (current && handlers.onVerdict) { e.preventDefault(); handlers.onVerdict(current) } return
      case 'clear': {
        e.preventDefault()
        const el = document.activeElement as HTMLElement | null
        if (el && root.current?.contains(el)) el.blur()
        return
      }
    }
  }, [rows, activeId, focusIndex, handlers, root])

  return {
    activeId,
    isActive: (row) => row.id === activeId,
    register,
    setActive: (row) => setActiveId(row.id),
    onKeyDown,
  }
}
