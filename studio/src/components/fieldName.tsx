// A `scorecard.py` field name set so it never breaks mid-word (owner's v12 critique #4, carried
// to every screen that prints one: steering mode AND the close screen's "How it went" tiles, where
// v13 still showed `security_review_wait_media / n_hours`). `fieldPieces` splits the name at its
// own seams — after each `_` and `.` — and `BreakableField` puts a `<wbr>` after every seam, so a
// long name breaks between its words first; `overflow-wrap: anywhere` on the LINE (the caller's)
// is the last resort for a single piece wider than its tile. `textContent` is the field,
// byte-for-byte: the seams stay on the piece before them.

/** The field split after each `_` and `.`; joined, the pieces are the field exactly. */
export function fieldPieces(field: string): string[] {
  return field.split(/(?<=[_.])/)
}

/** The field as text with a `<wbr>` after every seam. */
export function BreakableField({ field }: { field: string }) {
  const pieces = fieldPieces(field)
  return <>{pieces.map((piece, i) => <span key={i}>{piece}{i < pieces.length - 1 && <wbr />}</span>)}</>
}
