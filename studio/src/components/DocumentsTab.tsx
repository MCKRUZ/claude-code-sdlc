import type { DocumentFocus, ReadinessFinding, SignOffQuestion, StageReadiness } from '../../shared/types'
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

/** The flat list spec 0010 shipped: what each document is for, what needs attention, the
 * sign-off questions, and the readiness banner. Extracted out of StageHome verbatim for spec
 * 0017 — this tab's JSX is unchanged from before the Workflow tab existed, which is what makes
 * its acceptance check ("byte-for-byte what exists today") true by construction rather than by
 * promise. Read-only by construction — there is nothing here that changes a document. */
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
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Documents</h3>
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {readiness.documents.map((doc) => (
            <li key={doc.path}>
              <button
                type="button"
                // A folder is listed, and its state reported, but there is no one document in it
                // to open — the row must not offer to.
                disabled={!doc.exists || doc.folder}
                onClick={() => onOpenDocument(doc.path)}
                className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    {doc.name}
                    {doc.folder && <span className="ml-2 text-xs font-normal text-slate-400">folder</span>}
                  </span>
                  {doc.description && <span className="mt-0.5 block text-xs text-slate-500">{doc.description}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium">
                  {!doc.exists ? (
                    <span className="text-slate-400">Not started</span>
                  ) : doc.findingCount > 0 ? (
                    <span className="text-amber-700">
                      {doc.findingCount} to fill
                    </span>
                  ) : (
                    <span className="text-[var(--color-command-ok)]">Complete</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* WHAT IS MISSING, ITEM BY ITEM. Spec 0010's acceptance check asks for exactly this —
          "in plain language, each item linking to the field it refers to" — and until now this
          screen showed only a COUNT per document ("3 to fill") and dropped the list. The
          findings already carried the field and its position, and the join to that position is
          unit-tested; nothing rendered it. A number tells a person there is work; it does not
          tell them where, which is the whole job of a readiness check. */}
      {readiness.findings.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            What is missing
          </h3>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {readiness.findings.map((f) => (
              <li key={`${f.path}#${f.section}#${f.field ?? ''}`}>
                <button
                  type="button"
                  onClick={() => onOpenDocument(f.path, { section: f.section, field: f.field })}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-900">{describe(f)}</span>
                  <span className="text-xs text-slate-500">{f.reason}</span>
                </button>
              </li>
            ))}
          </ul>
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

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {readiness.ready ? (
          <span className="text-[var(--color-command-ok)]">
            Every required document is present and complete.
          </span>
        ) : (
          <span className="text-amber-700">
            {readiness.documents.filter((d) => !d.ready).length} document(s) still need work before this stage can be signed off.
          </span>
        )}
        {readiness.signOff.signedOffBy && (
          <span className="ml-2 text-slate-500">Signed off by {readiness.signOff.signedOffBy}.</span>
        )}
      </div>
    </div>
  )
}
