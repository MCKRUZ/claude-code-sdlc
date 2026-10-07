import { useEffect, useId, useRef, useState } from 'react'
import type { DocumentField } from '../../shared/types'
import { Button, Field, Input, Select, Textarea, VisuallyHidden } from '../ui'
import { useRegisterDirty } from '../stores/dirtyStore'
import { AiProposalCard } from './AiProposalCard'
import { useClaudeIssue } from './ClaudeIssueContext'

/** The DOM attribute each open editor carries, so ⌘S can find the one that holds focus. */
export const FIELD_EDITOR_ATTR = 'data-field-editor'

interface OpenEditor {
  save(): void
  dirty(): boolean
}

// Every mounted FieldEditor registers here for the lifetime of its mount. A module-level map
// rather than context because the two readers are not React: the ⌘S handler in DocumentView and
// the Esc "is anything being edited" guard App wires (§6.2) both need a plain function call.
// Only one DocumentView is ever mounted, so one map is the whole picture.
const editors = new Map<string, OpenEditor>()

/** True while any open editor holds an unsaved change — the Esc back-guard's question. */
export function anyFieldEditorDirty(): boolean {
  for (const editor of editors.values()) if (editor.dirty()) return true
  return false
}

/** ⌘S: save the editor that contains focus when it is dirty; failing that, the ONE dirty editor
 * if exactly one exists. Anything else is a no-op — guessing among several dirty fields would
 * save a change the person had not finished. Returns whether a save was requested. */
export function saveOpenFieldEditor(active: Element | null = typeof document === 'undefined' ? null : document.activeElement): boolean {
  const id = active?.closest(`[${FIELD_EDITOR_ATTR}]`)?.getAttribute(FIELD_EDITOR_ATTR)
  const focused = id ? editors.get(id) : undefined
  if (focused?.dirty()) {
    focused.save()
    return true
  }
  const dirty = [...editors.values()].filter((e) => e.dirty())
  if (dirty.length === 1) {
    dirty[0].save()
    return true
  }
  return false
}

/** Editing one field, including asking Claude to draft it.
 *
 * Two things here are load-bearing rather than cosmetic:
 *
 *  * A draft is never applied on arrival. It is shown as a proposal with Accept and Discard,
 *    because the acceptance check says the person accepts or discards it before it is saved.
 *  * Every draft is recorded WITH ITS OUTCOME, including discarded — Matt's resolved decision,
 *    reversing the spec's original "leaves no trace". The record is what makes "how much of
 *    this was AI-drafted, including what we turned down" answerable later, so the discard path
 *    records just as deliberately as the accept path does. If drafting is recorded only when
 *    it succeeds, the ledger flatters the tool.
 */
export function FieldEditor({
  field,
  busy,
  projectPath,
  relPath,
  sectionKey,
  sectionHeading,
  instance,
  actor,
  onSave,
}: {
  field: DocumentField
  busy: boolean
  projectPath: string
  relPath: string
  sectionKey: string
  sectionHeading: string
  instance?: string
  actor: string
  onSave: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState(field.value)
  const [draft, setDraft] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const claudeIssue = useClaudeIssue()
  const editorId = useId()

  // A save re-reads the document, so the incoming field is the source of truth.
  useEffect(() => { setValue(field.value) }, [field.value])

  const dirty = value !== field.value
  // Esc-as-back (App) must not discard an unsaved edit or an unreviewed draft (§6.2).
  useRegisterDirty(() => dirty || draft !== null)
  const multiline = field.type === 'longtext' || field.type === 'checklist' || field.type === 'table'
    || field.anchor === 'labeled_block'

  // The registry entry reads through a ref so it is registered once per mount yet always sees
  // the current value — re-registering on every keystroke would churn the map for nothing.
  const latest = useRef({ save: () => {}, dirty: false })
  latest.current = { save: () => { if (dirty && !busy) void onSave(value) }, dirty }
  useEffect(() => {
    editors.set(editorId, { save: () => latest.current.save(), dirty: () => latest.current.dirty })
    return () => { editors.delete(editorId) }
  }, [editorId])

  const record = (outcome: 'accepted' | 'edited' | 'discarded', offered: string, kept: string) =>
    window.studio.recordDraftOutcome(
      projectPath, relPath, field.label, outcome, actor || 'unknown',
      offered.length, kept.length, instance,
    )

  const requestDraft = async () => {
    setDrafting(true)
    setDraftError(null)
    const result = await window.studio.draftField(projectPath, relPath, sectionKey, field.label, field.guidance ?? '')
    if (!result.ok || !result.text) setDraftError(result.error ?? 'Claude could not draft this.')
    else setDraft(result.text)
    setDrafting(false)
  }

  const acceptDraft = async () => {
    if (draft === null) return
    // "edited" rather than "accepted" when the person changed it before accepting — the
    // distinction is the interesting part of the ledger.
    await record(value.trim() === draft.trim() ? 'accepted' : 'edited', draft, value || draft)
    setValue(draft)
    setDraft(null)
  }

  const discardDraft = async () => {
    if (draft === null) return
    await record('discarded', draft, '')
    setDraft(null)
  }

  return (
    <div className="space-y-2" data-field-editor={editorId}>
      {/* The section card already shows the label as the `<dt>`; the Field's own label is for
          assistive tech, which otherwise hears an unnamed control. */}
      <Field label={<VisuallyHidden>{field.label} — {sectionHeading}</VisuallyHidden>} hint={field.guidance}>
        {field.type === 'enum' && field.enumValues?.length ? (
          <Select
            value={value}
            onChange={setValue}
            options={[{ value: '', label: '—' }, ...field.enumValues.map((v) => ({ value: v, label: v }))]}
          />
        ) : multiline ? (
          <Textarea
            mono
            value={value}
            rows={Math.min(12, Math.max(3, value.split('\n').length + 1))}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>

      {draft !== null && (
        <AiProposalCard
          label="Claude's draft — review before accepting"
          busy={false}
          acceptLabel="Use this"
          onAccept={acceptDraft}
          onDiscard={discardDraft}
        >
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-ink-1">{draft}</pre>
        </AiProposalCard>
      )}

      {draftError && <p role="status" className="text-xs text-status-error-ink">{draftError}</p>}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => onSave(value)} disabled={!dirty || busy}>
          Save field
        </Button>
        {dirty && (
          <Button variant="link" size="sm" onClick={() => setValue(field.value)}>
            Revert
          </Button>
        )}
        {draft === null && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={requestDraft}
            loading={drafting}
            loadingLabel="Asking Claude…"
            disabled={claudeIssue !== null}
            disabledReason={claudeIssue ?? undefined}
          >
            Ask Claude to draft
          </Button>
        )}
      </div>
    </div>
  )
}
