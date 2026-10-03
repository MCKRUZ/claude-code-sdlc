import type { BatchKind, RegistryResult } from '../../shared/types'
import { messageOf, PANEL_BUTTON, PANEL_SECONDARY_BUTTON, PanelError, useScopedState } from './activityPanelBits'
import { RegistryResultView } from './RegistryResultView'
import type { DraftBatchApi } from './useDraftBatch'

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

  if (!locked) return <p className="text-xs text-slate-500">{LOCK_FIRST_NOTE}</p>

  const reason = batch.state.job?.phase === 'running' ? RUNNING_REASON : batch.state.candidates.length > 0 ? WAITING_REASON : null
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
    <div data-testid="batch-actions" className="space-y-2 border-t border-slate-100 pt-2">
      <div className="flex flex-wrap items-start gap-4">
        <ModelButton label="Summarise the documents" disabled={blocked} onClick={() => void ask('summarise')} />
        <ModelButton label="Analyse the documents" disabled={blocked} onClick={() => void ask('analyse')} />
        <div className="flex flex-col gap-0.5">
          <button type="button" disabled={working !== null} onClick={() => void writeRegistry()} className={PANEL_SECONDARY_BUTTON}>
            Write the registry and index
          </button>
          <span className="text-xs text-slate-500">Does not use Claude.</span>
        </div>
      </div>
      {reason && <p data-testid="batch-busy-reason" className="text-xs text-slate-500">{reason}</p>}
      {pending && <Confirm pending={pending} onStart={() => void start(pending.kind)} onCancel={() => setPending(null)} />}
      {error && <PanelError message={error} />}
      {registry && <RegistryResultView result={registry} />}
    </div>
  )
}

function ModelButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" disabled={disabled} onClick={onClick} className={PANEL_SECONDARY_BUTTON}>{label}</button>
      <span className="text-xs text-slate-500">Uses Claude.</span>
    </div>
  )
}

function Confirm({ pending, onStart, onCancel }: { pending: Pending; onStart: () => void; onCancel: () => void }) {
  return (
    <div data-testid="batch-confirm" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700">
      <p>{confirmation(pending)}</p>
      <ul className="space-y-0.5">
        {pending.documents.map((d) => <li key={d.id}>{d.id} · {d.filename}</li>)}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={onStart} className={PANEL_BUTTON}>Start</button>
        <button type="button" onClick={onCancel} className={PANEL_SECONDARY_BUTTON}>Cancel</button>
      </div>
    </div>
  )
}
