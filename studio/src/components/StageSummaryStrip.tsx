import type { ReactNode } from 'react'
import type { PipelineEvidenceResult, StageReadiness } from '../../shared/types'
import { Chip } from '../ui'
import { computeWorkflowSteps } from '../workflowSteps'
import { stageTabStore, type StageTabName } from '../stores/stageTabStore'

/** The hairline strip under a stage's title (round 2, S2): four facts a person otherwise scrolls
 * for — how many documents are done, which step is current, where the sign-off stands, and (on
 * Foundation, once gathered) what the pipeline evidence said. Every fact is a count of the
 * plugin's own rows or a word the plugin wrote; nothing here is computed from time, size or
 * activity. Each fact is a button that asks `stageTabStore` for the tab the fact lives on, so the
 * strip answers "where is this stage" and the click answers "show me". */

export interface StageSummaryStripProps {
  readiness: StageReadiness
  /** Foundation's gathered pipeline evidence, when the panel below has a result. Null or absent
   * draws no fact — "not gathered" is not a number. */
  pipeline?: PipelineEvidenceResult | null
  /** Defaults to `stageTabStore.request`; a test passes its own. */
  onRequestTab?: (tab: StageTabName) => void
}

/** "signed off by X" / "signed off · no name recorded" / "not current" / "N confirmations still
 * needed" / "every confirmation recorded" — the sign-off as the plugin's record states it. A
 * null signer on a signed-off stage is said out loud, never left blank. */
export function signOffFact(readiness: StageReadiness): string {
  const { signOff, isCurrent, judgement } = readiness
  if (signOff.status === 'signed_off') {
    const name = signOff.signedOffBy?.trim()
    return name ? `signed off by ${name}` : 'signed off · no name recorded'
  }
  if (!isCurrent) return 'not current'
  const unconfirmed = judgement.filter((q) => !q.confirmation).length
  if (unconfirmed > 0) return `${unconfirmed} confirmation${unconfirmed === 1 ? '' : 's'} still needed`
  return 'every confirmation recorded'
}

/** "N of M complete" from the plugin's `ready` flags; a stage with no required documents says so. */
export function documentsFact(readiness: StageReadiness): { text: string; tone: 'ok' | 'warn' | 'neutral' } {
  const total = readiness.documents.length
  if (total === 0) return { text: 'none required', tone: 'neutral' }
  const complete = readiness.documents.filter((d) => d.ready).length
  return { text: `${complete} of ${total} complete`, tone: complete === total ? 'ok' : 'warn' }
}

/** The current step's title, or what is left once nothing is current. */
export function currentStepFact(readiness: StageReadiness): string {
  const current = computeWorkflowSteps(readiness).find((s) => s.status === 'current')
  return current ? current.title : 'nothing left to do'
}

/** "N of M rails proven" — the script's own PROVEN rows over the rails it listed. */
export function pipelineFact(result: PipelineEvidenceResult): string {
  const proven = result.rails.filter((r) => r.status === 'PROVEN').length
  return `${proven} of ${result.rails.length} rail${result.rails.length === 1 ? '' : 's'} proven`
}

function Fact({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      data-pressable=""
      onClick={onClick}
      className="inline-flex items-baseline gap-1.5 rounded-sm text-xs text-ink-3 hover:text-ink-1"
    >
      <span>{label}</span>
      {/* A real space, so the button's accessible name reads "Current step b.md", not run together. */}
      {' '}
      <span className="font-medium text-ink-1">{children}</span>
    </button>
  )
}

export function StageSummaryStrip({ readiness, pipeline = null, onRequestTab }: StageSummaryStripProps) {
  const request = onRequestTab ?? ((tab: StageTabName) => stageTabStore.request(tab))
  const docs = documentsFact(readiness)
  const showPipeline = readiness.name === 'foundation' && pipeline?.ok === true
  return (
    <div
      role="group"
      aria-label="Stage summary"
      data-testid="stage-summary-strip"
      className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-line-1 py-2"
    >
      <Fact label="Documents" onClick={() => request('documents')}>
        <Chip tone={docs.tone} dot size="xs" data-testid="stage-summary-documents">{docs.text}</Chip>
      </Fact>
      <Fact label="Current step" onClick={() => request('workflow')}>{currentStepFact(readiness)}</Fact>
      <Fact label="Sign-off" onClick={() => request('workflow')}>{signOffFact(readiness)}</Fact>
      {showPipeline && pipeline && (
        <Fact label="Pipeline evidence" onClick={() => request('workflow')}>{pipelineFact(pipeline)}</Fact>
      )}
    </div>
  )
}
