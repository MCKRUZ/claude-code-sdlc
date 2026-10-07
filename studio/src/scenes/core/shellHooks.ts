// The three observations SceneShell makes about its host, each guarded so the shell renders the
// same DOM under `renderToStaticMarkup` (no window), in jsdom (no IntersectionObserver, inert
// ResizeObserver) and in Electron. In every doubtful case the answer leans towards "visible" —
// a wrongly paused scene looks broken, a wrongly live one merely costs a few frames.
import type { RefObject } from 'react'
import { useEffect, useLayoutEffect, useState } from 'react'

const hasWindow = typeof window !== 'undefined'

// `useLayoutEffect` measures before paint so the first frame already knows whether the graph
// fits; on the server React 19 treats it as a no-op without warning.
const useIsomorphicLayoutEffect = hasWindow ? useLayoutEffect : useEffect

/** The host's width in CSS px, or null until it has been measured. Null (not 0) on purpose:
 * "unknown" must not be read as "too narrow", or every graph would flash its table first. */
export function useHostWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Whether the host intersects the viewport. True when IntersectionObserver is missing. */
export function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry) setOnScreen(entry.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return onScreen
}

/** Whether the document is visible (`visibilitychange`). True when there is no document. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}
