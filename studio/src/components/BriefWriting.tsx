import { MAX_CLAIMS } from '../../shared/briefLimits'
import type { BriefClaim, BriefDocument } from '../../shared/types'
import { MAX_TEXT } from '../briefFormRules'
import { PANEL_SECONDARY_BUTTON } from './activityPanelBits'
import { Section, TEXT_INPUT } from './briefBits'

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick} className={PANEL_SECONDARY_BUTTON}>Remove</button>
}

interface ClaimsProps {
  documents: BriefDocument[]
  claims: BriefClaim[]
  draft: BriefClaim
  onDraft: (draft: BriefClaim) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

/** What the documents say: optional, and a claim cannot exist without the document it comes from. */
export function ClaimsSection({ documents, claims, draft, onDraft, onAdd, onRemove }: ClaimsProps) {
  const atCap = claims.length >= MAX_CLAIMS
  const canAdd = !atCap && draft.text.trim() !== '' && draft.docRef !== ''
  return (
    <Section title="What the documents say">
      <ul className="space-y-1">
        {claims.map((claim, i) => (
          <li key={`${i}:${claim.docRef}:${claim.text}`} data-testid="brief-claim" className="flex items-center gap-2 text-xs text-slate-700">
            <span className="min-w-0 flex-1">{claim.text} <span className="text-slate-500">({claim.docRef})</span></span>
            <RemoveButton label={`Remove claim ${i + 1}`} onClick={() => onRemove(i)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Claim text"
          maxLength={MAX_TEXT}
          value={draft.text}
          onChange={(e) => onDraft({ ...draft, text: e.target.value })}
          className={`${TEXT_INPUT} min-w-0 flex-1`}
        />
        <select
          aria-label="Claim document"
          value={draft.docRef}
          onChange={(e) => onDraft({ ...draft, docRef: e.target.value })}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
        >
          <option value="">Choose a document</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{`${d.id} ${d.filename}`}</option>)}
        </select>
        <button type="button" disabled={!canAdd} onClick={onAdd} className={PANEL_SECONDARY_BUTTON}>Add claim</button>
      </div>
      {atCap && <p className="text-xs text-slate-500">A brief takes up to {MAX_CLAIMS} claims.</p>}
    </Section>
  )
}

interface DecisionsProps {
  decisions: string[]
  draft: string
  standing: number
  range: [number, number]
  onDraft: (draft: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function DecisionsSection({ decisions, draft, standing, range, onDraft, onAdd, onRemove }: DecisionsProps) {
  const counter = `Decisions on the page: ${standing + decisions.length} (the template carries ${standing}; the page takes ${range[0]} to ${range[1]})`
  return (
    <Section title="Decisions the room must leave with" counter={counter} counterId="brief-decisions-counter">
      <ul className="space-y-1">
        {decisions.map((text, i) => (
          <li key={`${i}:${text}`} data-testid="brief-decision" className="flex items-center gap-2 text-xs text-slate-700">
            <span className="min-w-0 flex-1">{text}</span>
            <RemoveButton label={`Remove decision ${i + 1}`} onClick={() => onRemove(i)} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input aria-label="Decision text" maxLength={MAX_TEXT} value={draft} onChange={(e) => onDraft(e.target.value)} className={`${TEXT_INPUT} min-w-0 flex-1`} />
        <button type="button" disabled={draft.trim() === ''} onClick={onAdd} className={PANEL_SECONDARY_BUTTON}>Add decision</button>
      </div>
    </Section>
  )
}
