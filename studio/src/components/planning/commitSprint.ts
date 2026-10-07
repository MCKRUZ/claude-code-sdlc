// "Commit the sprint" (togo-command-center.md §3.2): the verbs in order, each step's exit shown,
// stopping at the FIRST non-zero. `slate` (only if the set changed) → `ready` (exit 1 lists the
// gaps verbatim) → `plan --json` → `openReport(rel_output)` → one `openDecision("Confirm risk
// tier for NNNN (proposed TIER)", owner)` per unconfirmed tier, ONLY when `confirm-tier` is a
// capability — else the step is recorded as `reasons.SKIPPED_TIER_CONFIRMATION`. The api is
// injected so the sequence is testable without a window; every call goes through the bridge the
// renderer already holds and nothing here parses a write verb's prose.
import type { CommandCenterApi, SprintReportResult, SprintVerbResult, StudioApi } from '../../../shared/types'
import { exitHeading, SKIPPED_TIER_CONFIRMATION } from '../../../shared/reasons'
import { setChanged } from './planningModel'

export type CommitApi = Pick<CommandCenterApi, 'runSprintVerb' | 'openDecision'> & Pick<StudioApi, 'renderSprintReport' | 'openReport'>

export interface CommitStep {
  /** The verb or action, as the row's label: "slate", "ready", "plan", "open report", "decision DL for 0007", "tier confirmation". */
  label: string
  /** 0 Done · 1 Not done · 2 Refused by the plugin · null for a step that never ran or has no exit code. */
  exitCode: number | null
  heading: string
  /** The plugin's own words, verbatim: stdout+stderr of a verb, `rel_output`, a decision id, or a reason. */
  text: string
  /** Where the fact came from. */
  source: string
  skipped?: boolean
}

export interface CommitInput {
  projectPath: string
  sprintId: string
  /** What is slated now (`slate[].id`) and what the commit should slate. */
  slated: string[]
  specs: string[]
  override?: { reason: string }
  /** Specs whose tier the person has not confirmed, with the tier the spec names — one decision each. */
  unconfirmed: Array<{ spec: string; risk: string }>
  owner: string | null
  confirmTierAvailable: boolean
}

function verbStep(label: string, source: string, result: SprintVerbResult): CommitStep {
  const text = [result.stdout, result.stderr].filter((s) => s && s.trim()).join('\n')
  return { label, exitCode: result.exitCode, heading: exitHeading(result.exitCode), text, source }
}

/** Runs the sequence, yielding each step as it lands via `onStep` and returning them all. Stops at
 * the first non-zero exit; a step after the stop is never started (nothing optimistic). */
export async function commitSprint(api: CommitApi, input: CommitInput, onStep?: (step: CommitStep) => void): Promise<CommitStep[]> {
  const steps: CommitStep[] = []
  const push = (step: CommitStep) => { steps.push(step); onStep?.(step) }

  if (setChanged(input.slated, input.specs)) {
    const result = await api.runSprintVerb(input.projectPath, {
      verb: 'slate', sprint: input.sprintId, specs: input.specs,
      ...(input.override ? { override: true, reason: input.override.reason } : {}),
    })
    push(verbStep('slate', 'sprint.py slate', result))
    if (result.exitCode !== 0) return steps
  }

  const ready = await api.runSprintVerb(input.projectPath, { verb: 'ready', sprint: input.sprintId })
  push(verbStep('ready', 'sprint.py ready', ready))
  if (ready.exitCode !== 0) return steps

  const plan: SprintReportResult = await api.renderSprintReport(input.projectPath, input.sprintId, 'planning')
  if (!plan.ok) {
    push({ label: 'plan', exitCode: 1, heading: exitHeading(1), text: plan.error, source: 'sprint.py plan --json' })
    return steps
  }
  push({ label: 'plan', exitCode: 0, heading: exitHeading(0), text: plan.relOutput, source: 'sprint.py plan --json' })

  const opened = await api.openReport(input.projectPath, plan.relOutput)
  push({
    label: 'open report', exitCode: opened.ok ? 0 : 1, heading: exitHeading(opened.ok ? 0 : 1),
    text: opened.ok ? plan.relOutput : (opened.error ?? 'The page could not be opened.'), source: 'openReport',
  })
  if (!opened.ok) return steps

  if (!input.confirmTierAvailable) {
    push({ label: 'tier confirmation', exitCode: null, heading: 'Skipped', text: SKIPPED_TIER_CONFIRMATION, source: 'capabilities', skipped: true })
    return steps
  }
  for (const { spec, risk } of input.unconfirmed) {
    const decision = await api.openDecision(input.projectPath, `Confirm risk tier for ${spec} (proposed ${risk})`, input.owner ?? undefined)
    if (decision.ok) {
      push({ label: `decision for ${spec}`, exitCode: 0, heading: exitHeading(0), text: `${decision.id} · due ${decision.due} · owner ${decision.owner}`, source: 'track_decisions.py open --json' })
    } else {
      push({ label: `decision for ${spec}`, exitCode: 1, heading: exitHeading(1), text: decision.stderr, source: 'track_decisions.py open --json' })
      return steps
    }
  }
  return steps
}

/** True when every step that ran landed on exit 0 (a skipped step is not a failure). */
export function commitSucceeded(steps: readonly CommitStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.skipped || s.exitCode === 0)
}
