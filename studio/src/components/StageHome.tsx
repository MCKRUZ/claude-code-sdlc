import { useCallback, useEffect, useState } from 'react'
import type { DocumentFocus, ReadinessFinding, StageReadiness } from '../../shared/types'

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

/** The stage's documents: what each is for, what needs attention, and whether the stage can
 * move on. Read-only by construction — there is nothing here that changes a document. */
export function StageHome({
  projectPath,
  stageId,
  onOpenDocument,
}: {
  projectPath: string
  stageId?: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
}) {
  const [readiness, setReadiness] = useState<StageReadiness | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setReadiness(await window.studio.getStageReadiness(projectPath, stageId))
    setLoading(false)
  }, [projectPath, stageId])

  useEffect(() => { refresh() }, [refresh])

  if (loading && !readiness) {
    return <p className="text-sm text-slate-400">Checking this stage…</p>
  }
  if (!readiness?.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
        {readiness?.error ?? 'Could not read this stage.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{readiness.display}</h2>
        {readiness.description && <p className="mt-1 text-sm text-slate-500">{readiness.description}</p>}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Documents</h3>
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {readiness.documents.map((doc) => (
            <li key={doc.path}>
              <button
                type="button"
                disabled={!doc.exists}
                onClick={() => onOpenDocument(doc.path)}
                className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{doc.name}</span>
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

      {readiness.judgementConditions.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Questions for whoever signs this off
          </h3>
          {/* These are deliberately not checkboxes. No check can answer them, and rendering
              them as something tickable would suggest the app had verified them. */}
          <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            {readiness.judgementConditions.map((c) => (
              <li key={c} className="text-sm text-slate-700">— {c}</li>
            ))}
          </ul>
        </div>
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
