import { useState } from 'react'
import type { IntakeCatalogue, IntakeChange, IntakeDocument } from '../../shared/types'
import { Notice } from '../ui'
import { messageOf, PanelButton, PanelError, PanelSecondaryButton, plural, useScopedState } from './activityPanelBits'
import { BatchActions } from './BatchActions'
import { BatchCandidateList } from './BatchCandidateList'
import { useDraftBatch } from './useDraftBatch'

type State =
  | { kind: 'idle' }
  | { kind: 'running'; catalogue: IntakeCatalogue | null }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; catalogue: IntakeCatalogue }

const IDLE: State = { kind: 'idle' }
const INTAKE_FAILED = 'The documents could not be catalogued.'

/** Intake (spec 0026): catalogues the reference documents through the plugin and lets a person skip
 * some, order the rest and freeze their ids. It does nothing on open — the script writes the
 * catalogue file the first time it runs, so looking at the screen must not create it. Every
 * action shows what the script returned; nothing here is guessed ahead of it. Once the ids are
 * locked it also offers the batch model jobs and the registry (spec 0029); `actor` is who signs
 * Keep and Discard. */
export function IntakePanel({ projectPath, actor = '' }: { projectPath: string; actor?: string }) {
  const batch = useDraftBatch(projectPath)
  const [state, setState, isCurrent] = useScopedState<State>(projectPath, IDLE)
  const [confirming, setConfirming] = useState(false)
  const current = state.kind === 'ready' || state.kind === 'running' ? state.catalogue : null

  const run = async (change?: IntakeChange) => {
    setConfirming(false)
    setState({ kind: 'running', catalogue: current })
    try {
      const catalogue = await (change ? window.studio.runIntake(projectPath, change) : window.studio.runIntake(projectPath))
      if (!isCurrent(projectPath)) return
      setState(catalogue.ok ? { kind: 'ready', catalogue } : { kind: 'failed', message: catalogue.error || INTAKE_FAILED })
    } catch (err) {
      if (isCurrent(projectPath)) setState({ kind: 'failed', message: messageOf(err, INTAKE_FAILED) })
    }
  }

  const busy = state.kind === 'running'
  return (
    <div data-testid="intake-panel" className="mt-2 space-y-2">
      <PanelButton disabled={busy} onClick={() => run()}>
        {busy && current === null ? 'Working…' : 'Catalogue the documents'}
      </PanelButton>
      {state.kind === 'failed' && <PanelError message={state.message} />}
      {current && current.documents.length === 0 && <p className="text-xs text-ink-2">No reference documents found</p>}
      {current && current.documents.length > 0 && (
        <>
          <Catalogue
            catalogue={current}
            busy={busy}
            confirming={confirming}
            onChange={run}
            onAskLock={() => setConfirming(true)}
            onCancelLock={() => setConfirming(false)}
          />
          <BatchActions projectPath={projectPath} locked={current.locked} batch={batch} />
        </>
      )}
      <BatchCandidateList batch={batch} actor={actor} />
    </div>
  )
}

/** The priority order as the person sees it: the saved order first, then the documents never ranked. */
export function displayOrder(catalogue: IntakeCatalogue): IntakeDocument[] {
  const byId = new Map(catalogue.documents.map((d) => [d.id, d]))
  const ranked = catalogue.priorityOrder.flatMap((id) => byId.get(id) ?? [])
  const rankedIds = new Set(ranked.map((d) => d.id))
  return [...ranked, ...catalogue.documents.filter((d) => !rankedIds.has(d.id))]
}

function reordered(ordered: IntakeDocument[], index: number, offset: -1 | 1): string[] {
  const ids = ordered.map((d) => d.id)
  const target = index + offset
  return ids.map((id, i) => (i === index ? ids[target] : i === target ? ids[index] : id))
}

interface CatalogueProps {
  catalogue: IntakeCatalogue
  busy: boolean
  confirming: boolean
  onChange: (change: IntakeChange) => void
  onAskLock: () => void
  onCancelLock: () => void
}

// A plain table rather than the kit's DataTable: the Order cell holds live controls (a checkbox and
// two buttons) and the rows carry `intake-row` / `data-doc-id`, which the intake tests address.
function Catalogue({ catalogue, busy, confirming, onChange, onAskLock, onCancelLock }: CatalogueProps) {
  const ordered = displayOrder(catalogue)
  const { totals, locked } = catalogue
  return (
    <>
      <table className="w-full text-left text-xs text-ink-2">
        <thead className="text-ink-3">
          <tr>
            <th className="pr-3 font-medium">Document</th>
            <th className="pr-3 font-medium">File</th>
            <th className="pr-3 font-medium">Type</th>
            <th className="pr-3 font-medium">Size</th>
            <th className="font-medium">Order</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((doc, index) => (
            <IntakeRow
              key={doc.id}
              doc={doc}
              locked={locked}
              busy={busy}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
              onSkip={() => onChange({ skip: [doc.id] })}
              onMove={(offset) => onChange({ priority: reordered(ordered, index, offset) })}
            />
          ))}
        </tbody>
      </table>
      <p data-testid="intake-totals" className="text-xs text-ink-2">
        {totals.documents} {plural(totals.documents, 'document', 'documents')}, about {totals.estimatedTokens} tokens, {totals.activeDocuments} active
      </p>
      {locked
        ? <p className="text-xs font-medium text-ink-2">These ids are frozen.</p>
        : <LockControl busy={busy} confirming={confirming} onAsk={onAskLock} onCancel={onCancelLock} onConfirm={() => onChange({ lock: true })} />}
    </>
  )
}

interface RowProps {
  doc: IntakeDocument
  locked: boolean
  busy: boolean
  isFirst: boolean
  isLast: boolean
  onSkip: () => void
  onMove: (offset: -1 | 1) => void
}

function IntakeRow({ doc, locked, busy, isFirst, isLast, onSkip, onMove }: RowProps) {
  const rank = doc.priority !== null && <span>Priority {doc.priority}</span>
  return (
    <tr data-testid="intake-row" data-doc-id={doc.id} className="border-t border-line-1 align-top">
      <td className="py-1 pr-3 font-medium text-ink-1">{doc.id}</td>
      <td className="py-1 pr-3 break-all">{doc.file}</td>
      <td className="py-1 pr-3">{doc.type}</td>
      <td className="py-1 pr-3">{doc.tokens} tokens</td>
      <td className="py-1">
        {locked ? (
          <span className="flex flex-wrap gap-2">{doc.skipped && <span>Skipped</span>}{rank}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <input type="checkbox" aria-label={`Skip ${doc.id}`} checked={doc.skipped} disabled={busy || doc.skipped} onChange={onSkip} />
              {doc.skipped ? 'Skipped (cannot be undone here)' : 'Skip'}
            </label>
            {rank}
            <PanelSecondaryButton aria-label={`Move ${doc.id} up`} disabled={busy || isFirst} onClick={() => onMove(-1)}>
              Move up
            </PanelSecondaryButton>
            <PanelSecondaryButton aria-label={`Move ${doc.id} down`} disabled={busy || isLast} onClick={() => onMove(1)}>
              Move down
            </PanelSecondaryButton>
          </span>
        )}
      </td>
    </tr>
  )
}

function LockControl({
  busy, confirming, onAsk, onCancel, onConfirm,
}: { busy: boolean; confirming: boolean; onAsk: () => void; onCancel: () => void; onConfirm: () => void }) {
  if (!confirming) {
    return <PanelSecondaryButton disabled={busy} onClick={onAsk}>Lock these ids</PanelSecondaryButton>
  }
  return (
    <Notice tone="warn" role="none" data-testid="intake-lock-confirm">
      <p>Locking makes these document ids permanent. After this, documents can no longer be skipped or reordered here.</p>
      <div className="mt-2 flex gap-2">
        <PanelButton disabled={busy} onClick={onConfirm}>Yes, lock them</PanelButton>
        <PanelSecondaryButton onClick={onCancel}>Cancel</PanelSecondaryButton>
      </div>
    </Notice>
  )
}
