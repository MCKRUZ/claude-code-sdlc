/** Addressing a section the way the plugin names it.
 *
 * This lives in shared/ rather than beside its first caller because BOTH halves of Studio need
 * it and they cannot import each other: the main process joins a readiness finding to the
 * section it refers to, and the renderer has to find that same section again to take the reader
 * there. A second copy of the rule in the renderer would be a rule that drifts — and the two
 * copies disagreeing would show up as "the link goes to the wrong place", which nobody would
 * trace back to a duplicated one-liner.
 *
 * Nothing here touches the filesystem or a subprocess, which is what makes it safe for the
 * renderer to import at all.
 */

/** The plugin reports `section` as the document's own heading text, and for a repeating block
 * as "<heading> > <instance heading>". Studio addresses sections by key, so match on whichever
 * of those the document actually offers. */
export function matchesSection(sectionKey: string, heading: string, reported: string): boolean {
  if (reported === sectionKey || reported === heading) return true
  const instance = reported.split('>').pop()?.trim()
  return instance !== undefined && instance === heading
}
