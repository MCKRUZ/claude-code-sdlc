import { useCallback, useEffect, useState } from 'react'

/** How wide the chat panel is, and how far a person may drag it. The panel used to be a fixed
 * 20rem, which long assistant replies (tables, lists) outgrew immediately. */

export const CHAT_MIN_WIDTH = 280
export const CHAT_DEFAULT_WIDTH = 380
/** Share of the window the panel may take. Past this the document panel — the thing the chat is
 * helping with — would be squeezed to nothing. */
export const CHAT_MAX_FRACTION = 0.6

const STORAGE_KEY = 'studio.chatWidth'

export function maxChatWidth(viewportWidth: number): number {
  return Math.max(CHAT_MIN_WIDTH, Math.floor(viewportWidth * CHAT_MAX_FRACTION))
}

export function clampChatWidth(width: number, viewportWidth: number): number {
  return Math.min(Math.max(width, CHAT_MIN_WIDTH), maxChatWidth(viewportWidth))
}

/** A remembered width is a per-person convenience, never something to fail on: storage can be
 * blocked or hold garbage, and either just means "use the default". */
export function readStoredChatWidth(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function storeChatWidth(width: number | null): void {
  try {
    if (width === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // Not remembered this time; the width still applies for this session.
  }
}

export function useChatWidth() {
  // What the person chose. The width actually applied is this clamped to the CURRENT window, so
  // shrinking the window and growing it back returns to their choice rather than losing it.
  const [chosen, setChosen] = useState<number>(() => readStoredChatWidth() ?? CHAT_DEFAULT_WIDTH)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** Live preview while dragging — not remembered until the drag ends. */
  const setWidth = useCallback((width: number) => setChosen(clampChatWidth(width, window.innerWidth)), [])

  const commit = useCallback((width: number) => {
    const clamped = clampChatWidth(width, window.innerWidth)
    setChosen(clamped)
    storeChatWidth(clamped)
  }, [])

  const reset = useCallback(() => {
    setChosen(CHAT_DEFAULT_WIDTH)
    storeChatWidth(null)
  }, [])

  return {
    width: clampChatWidth(chosen, viewport),
    max: maxChatWidth(viewport),
    setWidth,
    commit,
    reset,
  }
}
