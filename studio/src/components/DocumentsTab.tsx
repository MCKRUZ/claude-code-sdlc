import type { DocumentFocus, ReadinessFinding, SignOffQuestion, StageDocument, StageReadiness } from '../../shared/types'
import type { ChipTone } from '../ui/contract'
import { Button, Card, Chip, Eyebrow } from '../ui'
import { SignOffQuestions } from './SignOffQuestions'

/** One readiness item, in the words a person would use. The plugin reports a path, a section
 * and a field; a reader wants a sentence. Kept out of the component so the phrasing is one
 * thing in one place rather than assembled inline. */
function describe(finding: ReadinessFinding): string {
  const doc = finding.path.split('/').pop() ?? finding.path
  const where = finding.field ? `${finding.field} in ${finding.section}` : finding.section
  // The FIELD leads, not the filename. Two reasons, and the second is not cosmetic: what a
  // person has to go and do is the field, and naming the document first made this button's
  // accessible name start with "requirements.md", which collided with the document list's own
  // button and broke an unrelated test on strict-mode ambiguity. This file already carries a
  // note that "a bare text match became ambiguous once a Documents tab existed" — same lesson,
  // second visit.
  return `${where} — ${doc}`
}

/** How a document stands, as one word a theme can colour and a test can read (`data-tone`).
 * The three states are the three labels the row has always shown — this names them. */
function toneOf(doc: StageDocument): Extract<ChipTone, 'neutral' | 'warn' | 'ok'> {
  if (!doc.exists) return 'neutral'
  return doc.findingCount > 0 ? 'warn' : 'ok'
}

/** A full-width row that is a button. The kit Button centres and bolds by default (it is a
 * control, not a list row), so the row shape is restored here once rather than per call. */
const ROW_BUTTON =
  'items-start justify-between rounded-none px-4 py-3 text-left text-sm font-normal whitespace-normal ' +
  'disabled:cursor-default disabled:opacity-100 disabled:hover:bg-transparent'

/** The flat list spec 0010 shipped: what each document is for, what needs attention, the
 * sign-off questions, and the readiness banner. Extracted out of StageHome verbatim for spec
 * 0017, then moved onto the kit in the Observatory's Wave 3 (studio-observatory.md §7, D-B) —
 * the behaviour suite in `test/documentsTab.test.ts` pins every sentence, label, disabled state
 * and callback the pre-kit markup had, so the migration changed looks, not meaning. Read-only by
 * construction — there is nothing here that changes a document. */
export function DocumentsTab({
  readiness,
  actor,
  busyId,
  confirmError,
  onOpenDocument,
  onToggle,
}: {
  readiness: StageReadiness
  /** Who a confirmation is recorded under; empty when nobody is signed in. */
  actor: string
  busyId: string | null
  confirmError: string | null
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  onToggle: (question: SignOffQuestion, confirmed: boolean) => void
}) {
  const needWork = readiness.documents.filter((d) => !d.ready).length
  return (
    <div className="space-y-6">
      <div>
        {/* An h3, not a p: the documents e2e waits on `heading "Documents"` by role. */}
        <Eyebrow as="h3" className="mb-2">Documents</Eyebrow>
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-line-1">
            {readiness.documents.map((doc) => {
              const tone = toneOf(doc)
              return (
                <li key={doc.path} data-tone={tone} data-reveal="">
                  <Button
                    variant="ghost"
                    block
                    // A folder is listed, and its state reported, but there is no one document
                    // in it to open — the row must not offer to.
                    disabled={!doc.exists || doc.folder}
                    onClick={() => onOpenDocument(doc.path)}
                    className={ROW_BUTTON}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-1">
                        {doc.name}
                        {doc.folder && <span className="ml-2 text-xs font-normal text-ink-3">folder</span>}
                      </span>
                      {doc.description && <span className="mt-0.5 block text-xs text-ink-3">{doc.description}</span>}
                    </span>
                    {/* Colour is never the only signal: the words say the state, the dot echoes it. */}
                    <Chip tone={tone} dot className="shrink-0">
                      {!doc.exists ? 'Not started' : doc.findingCount > 0 ? `${doc.findingCount} to fill` : 'Complete'}
                    </Chip>
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {/* WHAT IS MISSING, ITEM BY ITEM. Spec 0010's acceptance check asks for exactly this —
          "in plain language, each item linking to the field it refers to" — and until now this
          screen showed only a COUNT per document ("3 to fill") and dropped the list. The
          findings already carried the field and its position, and the join to that position is
          unit-tested; nothing rendered it. A number tells a person there is work; it does not
          tell them where, which is the whole job of a readiness check. */}
      {readiness.findings.length > 0 && (
        <div>
          <Eyebrow as="h3" className="mb-2">What is missing</Eyebrow>
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line-1">
              {readiness.findings.map((f) => (
                <li key={`${f.path}#${f.section}#${f.field ?? ''}`} data-reveal="">
                  <Button
                    variant="ghost"
                    block
                    onClick={() => onOpenDocument(f.path, { section: f.section, field: f.field })}
                    className={`${ROW_BUTTON} flex-col gap-0.5`}
                  >
                    <span className="font-medium text-ink-1">{describe(f)}</span>
                    <span className="text-xs text-ink-3">{f.reason}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {readiness.judgement.length > 0 && (
        <SignOffQuestions
          questions={readiness.judgement}
          actor={actor}
          busyId={busyId}
          error={confirmError}
          onToggle={onToggle}
        />
      )}

      <Card tone={readiness.ready ? 'ok' : 'warn'} className="text-sm">
        {readiness.ready ? (
          <span className="text-status-ok-ink">Every required document is present and complete.</span>
        ) : (
          <span className="text-status-warn-ink">
            {needWork} document(s) still need work before this stage can be signed off.
          </span>
        )}
        {readiness.signOff.signedOffBy && (
          <span className="ml-2 text-ink-3">Signed off by {readiness.signOff.signedOffBy}.</span>
        )}
      </Card>
    </div>
  )
}
