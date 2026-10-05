/** What `StageHome`'s tab-reset effect keys on (spec 0017's fix pass, bug #2).
 *
 * `StageHome` does not remount on a stage switch — App.tsx keeps it mounted across one and only
 * changes its `stageId` prop — so the effect that puts the reader back on the Workflow tab has
 * to be re-triggered by a dependency change, not by an initial-mount default that only ever
 * fires once.
 *
 * Keying that effect on `stageId` ALONE missed a real case: opening a project sets
 * `viewedStageId` back to `undefined` (App.tsx's `openPath`), the same value it already was if
 * the reader never picked a specific stage in the PREVIOUS project either — `undefined` to
 * `undefined` is not a change, so the effect never re-fires, and a reader who had switched to
 * Documents in project A lands on project B's Documents tab instead of its Workflow tab.
 *
 * This folds `projectPath` into the key too, so a genuine project switch always produces a
 * different key even when `stageId` happens to read the same both times. */
export function stageHomeKey(projectPath: string, stageId: string | undefined): string {
  return `${projectPath}\u0000${stageId ?? ''}`
}
