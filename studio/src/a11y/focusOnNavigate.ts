// Focus after navigation (studio-observatory.md §6.3). When the screen changes, focus moves to
// its `<h2 data-page-heading>` so a keyboard or screen-reader user starts at the top of what
// just appeared rather than wherever the previous screen left them. Programmatic focus shows
// no ring (`:focus:not(:focus-visible)`), so the heading takes `tabIndex -1` and nothing else.
// While the OpeningOverlay (`[aria-busy="true"][role="alertdialog"]`) is mounted the move waits:
// the overlay blurs everything behind it and its own card holds focus for AT.
import { useEffect } from 'react'

export const PAGE_HEADING_SELECTOR = '[data-page-heading]'
export const BLOCKING_OVERLAY_SELECTOR = '[aria-busy="true"][role="alertdialog"]'

export interface FocusHeadingOptions {
  /** Wait for the enter choreography (`useEnter`) before moving focus; 0 moves at once. */
  delayMs?: number
  root?: Document
}

function overlayMounted(root: Document): boolean {
  return root.querySelector(BLOCKING_OVERLAY_SELECTOR) !== null
}

function focusNow(root: Document): boolean {
  const heading = root.querySelector<HTMLElement>(PAGE_HEADING_SELECTOR)
  if (!heading) return false
  if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
  heading.focus({ preventScroll: false })
  return root.activeElement === heading
}

/** Move focus to the page heading. Returns a cancel function: a navigation that is superseded
 * before its delay elapses must not steal focus from the screen that replaced it. */
export function focusHeading(opts: FocusHeadingOptions = {}): () => void {
  const root = opts.root ?? (typeof document !== 'undefined' ? document : null)
  if (!root) return () => {}
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let observer: MutationObserver | null = null

  const attempt = () => {
    if (cancelled) return
    if (overlayMounted(root)) {
      // Defer until the overlay unmounts: watch the body for the removal rather than polling.
      observer = new MutationObserver(() => {
        if (cancelled || overlayMounted(root)) return
        observer?.disconnect()
        observer = null
        focusNow(root)
      })
      observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'role'] })
      return
    }
    focusNow(root)
  }

  const delay = opts.delayMs ?? 0
  if (delay > 0) timer = setTimeout(attempt, delay)
  else attempt()

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
    observer?.disconnect()
  }
}

/** Hook form: refocus whenever `key` changes (the area / stage / document / spec the host is
 * showing), skipping the first render so opening the app does not yank focus from the sidebar. */
export function useFocusOnNavigate(key: string | null, opts: FocusHeadingOptions = {}): void {
  const { delayMs } = opts
  useEffect(() => {
    if (key === null) return
    return focusHeading({ delayMs })
    // `key` is the dependency on purpose: the same screen re-rendering must not refocus.
  }, [key, delayMs])
}
