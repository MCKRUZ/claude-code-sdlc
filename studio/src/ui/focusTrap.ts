// Overlay plumbing for the kit. Round 3 (Q3, Radix under the kit): `@radix-ui/react-dialog`'s
// FocusScope and DismissableLayer now own Tab containment and the Escape layering (only the
// topmost layer answers Escape), so the hand-rolled trap is retired. The names stay exported
// because the kit barrel (`index.ts`) re-exports them: `trapTab` is a documented no-op and
// `focusableWithin` is a plain query nothing in the kit calls any more. `overlayRoot` is still
// the one place that names where every overlay portals (dialogs, menus, tooltips, hover cards).
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"]):not([disabled]), [contenteditable="true"]'

/** @deprecated The kit no longer traps focus by hand; kept for callers outside the kit. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('aria-hidden'))
}

/** @deprecated Radix's FocusScope owns Tab / Shift+Tab inside a Dialog. Always returns false. */
export function trapTab(_event: KeyboardEvent, _root: HTMLElement): boolean {
  return false
}

/** Where every overlay portals: `#overlays` (a sibling of `#root` in index.html — never inside
 * `<main>` or an `<aside>`, so the shell's a11y counts hold) when present, else `document.body`.
 * Called at render time so SSR never touches `document`. */
export function overlayRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById('overlays') ?? document.body
}
