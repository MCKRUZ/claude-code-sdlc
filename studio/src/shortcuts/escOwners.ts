// What owns Escape above the screen (studio-observatory.md §6.2 Esc row; v13 fixer round).
// Anything open OVER the screen answers Esc itself — the palette and every `Dialog` (portalled
// to `#overlays`), a Radix menu (the band's `…`), a hover card or tooltip, the OpeningOverlay —
// so the screen's own Esc chain (`handleEscape` → back / clear) must step aside while one is up.
// App's `useShortcuts` listens on `window` in the CAPTURE phase, which runs BEFORE Radix's
// DismissableLayer on `document`; `e.defaultPrevented` is therefore still false there, and the
// only way to know a layer is open is to look for it. One selector, one place: the `…` menu
// (`role="menu"`) and the rich hover card (no role; `data-hover-card`) were missing, so Esc on an
// open menu both closed it AND left the spec card / the documents (v13).
export const ESC_OWNER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="tooltip"], [role="menu"], [data-hover-card]'

export function escOwnedAbove(doc: Pick<Document, 'querySelector'> | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  return doc !== undefined && doc.querySelector(ESC_OWNER_SELECTOR) !== null
}
