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
  /** The document the check reads, so its result can take a person to it. */
  document: string
}

export const CHECK_CONTROLS: Readonly<Record<string, CheckControl>> = {
  'rules-check': {
    capability: 'rules-check', button: 'Check rules',
    document: '.sdlc/artifacts/01-requirements/business-rules.md',
  },
  'data-check': {
    capability: 'data-contract-summary', button: 'Check personal data',
    document: '.sdlc/artifacts/02-design/data/data-contract.md',
  },
}

/** Activities that get a small panel of their own (spec 0026), keyed by activity id: they are `run`
 * or `draft` kinds whose deterministic part Studio can show, so the id decides, not the kind. A
 * `draft` activity here shows only its read-only picture until the model-run button arrives. */
export const PANEL_CONTROLS: Readonly<Record<string, { capability: string }>> = {
  'phase-report': { capability: 'phase-report-json' },
  intake: { capability: 'intake-modes' },
  enhance: { capability: 'narrative-status' },
  // `record_findings.py report --json` predates activities, so any plugin that declares them has it.
  review: { capability: 'activities' },
  brief: { capability: 'brief-candidates' },
  // The sprint the team runs (sprint.py status --json): a read-only picture, never "done".
  sprint: { capability: 'sprint-status' },
}

/** Starting documents from templates needs the plugin to know about activities at all. */
export const CREATE_CAPABILITY = 'activities'

/** The `capabilities` entry an activity needs, or null when Studio draws no control for it. */
export function capabilityFor(activity: StageActivity): string | null {
  if (PANEL_CONTROLS[activity.id]) return PANEL_CONTROLS[activity.id].capability
  if (activity.kind === 'create') return CREATE_CAPABILITY
  if (activity.kind === 'talk') return CREATE_CAPABILITY
  if (activity.kind === 'check') return CHECK_CONTROLS[activity.id]?.capability ?? null
  return null
}

/** True when Studio has a control for this activity (create, talk, one of the two checks, or one of the panels). */
export function isDrawn(activity: StageActivity): boolean {
  return capabilityFor(activity) !== null
}
