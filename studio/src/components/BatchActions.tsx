import type { BatchKind, RegistryResult } from '../../shared/types'
import { Notice } from '../ui'
import { messageOf, PanelButton, PanelError, PanelSecondaryButton, useScopedState } from './activityPanelBits'
import { RegistryResultView } from './RegistryResultView'
import type { DraftBatchApi } from './useDraftBatch'
import { useClaudeIssue } from './ClaudeIssueContext'

export const LOCK_FIRST_NOTE = 'Lock the document ids to summarise them.'
export const WAITING_REASON = 'Keep or discard the waiting results first'
export const RUNNING_REASON = 'A batch is running.'

interface Pending { kind: BatchKind; documents: Array<{ id: string; filename: string }> }
type Working = BatchKind | 'registry' | null

/** The sentence that says what pressing Start will cost in runs. */
function confirmation(pending: Pending): string {
  const n = pending.documents.length
  if (pending.kind === 'summarise') {
    return n === 1 ? 'Claude runs once for this document.' : `Claude runs once for each of these ${n} documents.`
  }
  const these = n === 1 ? 'this document' : `these ${n} documents`
  return `Claude reads the summaries of ${these} and writes the contradiction list and the question list.`
}

/** The three actions that follow cataloguing (spec 0029). The two model jobs ask first, with the
 * documents in front of the person, and nothing is started until Start; the registry is a script. */
export function BatchActions({ projectPath, locked, batch }: { projectPath: string; locked: boolean; batch: DraftBatchApi }) {
  const [pending, setPending, isCurrent] = useScopedState<Pending | null>(projectPath, null)
  const [error, setError] = useScopedState<string | null>(projectPath, null)
  const [registry, setRegistry] = useScopedState<RegistryResult | null>(projectPath, null)
  const [working, setWorking] = useScopedState<Working>(projectPath, null)
  const claudeIssue = useClaudeIssue()

  if (!locked) return <p className="text-xs text-ink-3">{LOCK_FIRST_NOTE}</p>

  const reason = claudeIssue ?? (batch.state.job?.phase === 'running' ? RUNNING_REASON : batch.state.candidates.length > 0 ? WAITING_REASON : null)
  const blocked = reason !== null || working !== null

  const ask = async (kind: BatchKind) => {
    setError(null)
    setPending(null)
    setWorking(kind)
    const result = await batch.preview(kind)
    if (!isCurrent(projectPath)) return
    setWorking(null)
    if (result.ok) setPending({ kind, documents: result.documents })
    else setError(result.error)
  }

  const start = async (kind: BatchKind) => {
    setPending(null)
    const result = await batch.start(kind)
    if (isCurrent(projectPath) && !result.ok) setError(result.error)
  }

  const writeRegistry = async () => {
    setError(null)
    setRegistry(null)
    setWorking('registry')
    let result: RegistryResult | null = null
    try {
      result = await window.studio.writeRegistry(projectPath)
    } catch (err) {
      if (isCurrent(projectPath)) setError(messageOf(err, 'The registry could not be written.'))
    }
    if (!isCurrent(projectPath)) return
    setWorking(null)
    if (result) setRegistry(result)
  }

  return (
    <div data-testid="batch-actions" className="space-y-2 border-t border-line-1 pt-2">
      <div className="flex flex-wrap items-start gap-4">
        <ModelButton label="Summarise the documents" disabled={blocked} onClick={() => void ask('summarise')} />
        <ModelButton label="Analyse the documents" disabled={blocked} onClick={() => void ask('analyse')} />
        <div className="flex flex-col gap-0.5">
          <PanelSecondaryButton disabled={working !== null} onClick={() => void writeRegistry()}>
            Write the registry and index
          </PanelSecondaryButton>
          <span className="text-xs text-ink-3">Does not use Claude.</span>
        </div>
      </div>
      {reason && <p data-testid="batch-busy-reason" className="text-xs text-ink-3">{reason}</p>}
      {pending && <Confirm pending={pending} onStart={() => void start(pending.kind)} onCancel={() => setPending(null)} />}
      {error && <PanelError message={error} />}
      {registry && <RegistryResultView result={registry} />}
    </div>
  )
}

/** The reason the button is off is already printed once under the row (`batch-busy-reason`), so it
 * is not repeated inside the button. */
function ModelButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <PanelSecondaryButton disabled={disabled} onClick={onClick}>{label}</PanelSecondaryButton>
      <span className="text-xs text-ink-3">Uses Claude.</span>
    </div>
  )
}

function Confirm({ pending, onStart, onCancel }: { pending: Pending; onStart: () => void; onCancel: () => void }) {
  return (
    <Notice tone="warn" role="none" data-testid="batch-confirm">
      <p>{confirmation(pending)}</p>
      <ul className="mt-1 space-y-0.5">
        {pending.documents.map((d) => <li key={d.id}>{d.id} · {d.filename}</li>)}
      </ul>
      <div className="mt-2 flex gap-2">
        <PanelButton onClick={onStart}>Start</PanelButton>
        <PanelSecondaryButton onClick={onCancel}>Cancel</PanelSecondaryButton>
      </div>
    </Notice>
  )
}
