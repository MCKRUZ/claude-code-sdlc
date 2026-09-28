/** What the stage list says about a stage.
 *
 * The plugin's `stage_state: 'signed_off'` means only that the stage's status is `completed`; it
 * is set whether or not anyone signed. The name is reported separately as `signed_off_by`, and a
 * finished stage is only called "Signed off" when there is one — otherwise the list would claim
 * a signature nobody recorded. */

interface StageLike {
  stage_state: 'current' | 'signed_off' | 'later'
  signed_off_by: string | null
}

const hasName = (stage: StageLike) => !!stage.signed_off_by && stage.signed_off_by.trim() !== ''

export function stageStateLabel(stage: StageLike): string {
  if (stage.stage_state === 'signed_off') return hasName(stage) ? 'Signed off' : 'Completed'
  return stage.stage_state === 'current' ? 'Current' : 'Later'
}

/** The hover text for a finished stage — who signed, or plainly that nobody was recorded. */
export function stageStateTitle(stage: StageLike): string | undefined {
  if (stage.stage_state !== 'signed_off') return undefined
  return hasName(stage)
    ? `Signed off by ${stage.signed_off_by!.trim()}`
    : 'Completed — no name was recorded against this stage'
}
