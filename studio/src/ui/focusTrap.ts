// Focus-trap helpers for Dialog. Plain DOM functions, no React, so the trap can be tested on a
// detached fragment and reused by anything else that needs modal focus later (the palette shell
// is a Dialog, so it inherits this for free).
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"]):not([disabled]), [contenteditable="true"]'

export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('aria-hidden'))
}

/** Keeps Tab / Shift+Tab inside `root`. Returns true when it handled the key. */
export function trapTab(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== 'Tab') return false
  const items = focusableWithin(root)
  if (items.length === 0) {
    event.preventDefault()
    root.focus()
    return true
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

/** Where a Dialog portals: `#overlays` (a sibling of `#root` in index.html) when present, else
 * `document.body`. Called at render time so SSR never touches `document`. */
export function overlayRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById('overlays') ?? document.body
}
