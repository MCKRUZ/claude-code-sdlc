/** The one place `${relPath} does not exist` is spelled out (spec 0017's fix pass, bug #8).
 *
 * Before this, `electron/main/documents.ts` produced this exact string in three places and
 * `WorkflowTab.tsx`'s `LiveDocumentPanel` reconstructed it a fourth time, by hand, purely to
 * recognise "not created yet" and tell it apart from a real error. Four independent copies of
 * one literal is a wording change away from silently breaking the renderer's match — this lives
 * in shared/ (alongside shared/sections.ts, for the same reason: both the main process and the
 * renderer need it, and they cannot import each other) so there is exactly one copy to change.
 *
 * Nothing here touches the filesystem or a subprocess, which is what makes it safe for the
 * renderer to import at all.
 */
export function documentNotFoundError(relPath: string): string {
  return `${relPath} does not exist`
}
