// Which declared activities Studio can act on, and what each needs from the installed plugin
// (spec 0024).
//
// The plugin declares WHAT an activity is (its kind) but not which script produces a check's result
// — two checks have two different outputs — so the checks are a small table here, keyed by the
// activity's id. A check with no entry is not drawn: a row with no control is a promise the tab
// cannot keep. Create and talk are generic by kind and need no entry.
//
// Shared (main + renderer) so the process that runs a check and the screen that offers it can never
// disagree about which checks exist.

import type { StageActivity } from './types'

export interface CheckControl {
  /** The `capabilities` entry (generate_status.py --json) the plugin must list for this check. */
  capability: string
  /** The button text. */
  button: string
}

export const CHECK_CONTROLS: Readonly<Record<string, CheckControl>> = {
  'rules-check': { capability: 'rules-check', button: 'Check rules' },
  'data-check': { capability: 'data-contract-summary', button: 'Check personal data' },
}

/** Starting documents from templates needs the plugin to know about activities at all. */
export const CREATE_CAPABILITY = 'activities'

/** The `capabilities` entry an activity needs, or null when Studio draws no control for it. */
export function capabilityFor(activity: StageActivity): string | null {
  if (activity.kind === 'create') return CREATE_CAPABILITY
  if (activity.kind === 'talk') return CREATE_CAPABILITY
  if (activity.kind === 'check') return CHECK_CONTROLS[activity.id]?.capability ?? null
  return null
}

/** True when Studio has a control for this activity (create, talk, or one of the two checks). */
export function isDrawn(activity: StageActivity): boolean {
  return capabilityFor(activity) !== null
}
