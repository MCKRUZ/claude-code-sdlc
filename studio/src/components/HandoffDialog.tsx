import { useState } from 'react'
import type { BoardRow, HandoffResult } from '../../shared/types'

/** Handing a spec to a developer (spec 0011).
 *
 * This screen enforces nothing. Every rule about who may be handed what lives in the
 * plugin's command, and asking it is the only way to find out — so the flow here is
 * deliberately "try it, and deal with the answer", not "check first, then try". A copy of
 * the rules living in this file would be a rule enforced only in the app, which is exactly
 * what the spec's Checking Plan tells its reviewer to look for.
 *
 * What it DOES do is respond usefully to each refusal, and it decides that from the
 * refusal's kind rather than its wording. */
export function HandoffDialog({
  projectPath,
  row,
  onClose,
  onHandedOff,
}: {
  projectPath: string
  row: BoardRow
  onClose: () => void
  onHandedOff: () => void
}) {
  const [developer, setDeveloper] = useState('')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<HandoffResult | null>(null)
  const [busy, setBusy] = useState(false)

  const refusal = result?.ok === false ? result.refusal! : null
  const atLimit = refusal?.kind === 'team_at_limit'

  const submit = async () => {
    setBusy(true)
    // The reason is sent ONLY after a refusal has already said the team is at its limit.
    // Sending it pre-emptively would let someone breach a limit they were never told about,
    // which is the whole value of having one.
    setResult(await window.studio.handOff(projectPath, row.path, developer.trim(), atLimit ? reason : undefined))
    setBusy(false)
  }

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {result.alreadyInFlight ? 'Already with a developer' : 'Handed off'}
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-slate-900">
            {row.spec} → <span className="font-medium">{result.developer}</span>
            {result.checker && <span className="text-slate-500"> · {result.checker} checks it</span>}
          </p>
          {result.branch && <p className="mt-1 font-mono text-xs text-slate-400">{result.branch}</p>}
          {result.prUrl && (
            <p className="mt-1 text-xs text-slate-500">Pull request opened.</p>
          )}
          {result.assignmentError && (
            // The branch and the commit are real; nobody was told. Hiding this would leave
            // someone waiting for a review request that was never sent.
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The hand-off is done locally, but the code host could not be told:{' '}
              {result.assignmentError} — assign it by hand once that is working.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onHandedOff}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Back to the board
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Hand off {row.spec}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{row.title || row.name}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">
          Cancel
        </button>
      </div>

      {/* The three roles, stated before anyone commits to anything — the spec asks for the
          hand-off to name all three, because confusing who owns a change with who builds it
          is what makes review theatre. */}
      <dl className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Owns it</dt>
          <dd className="mt-0.5 text-slate-900">{row.owner || <span className="text-slate-400">nobody</span>}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Builds it</dt>
          <dd className="mt-0.5 text-slate-900">
            {developer.trim() || <span className="text-slate-400">choose below</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Checks it</dt>
          <dd className="mt-0.5 text-slate-900">
            {row.checker || <span className="text-slate-400">nobody yet</span>}
          </dd>
        </div>
      </dl>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Developer</span>
        <input
          value={developer}
          onChange={(e) => setDeveloper(e.target.value)}
          placeholder="@handle"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      {refusal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{refusalHeading(refusal.kind)}</p>
          {/* The plugin's own words, not a paraphrase — it knows why it refused. */}
          <p className="mt-1 whitespace-pre-wrap text-xs text-amber-900">{refusal.message}</p>

          {atLimit && (
            <label className="mt-3 block">
              <span className="text-xs font-medium text-amber-900">
                Why are you going past the limit? This is written into the record.
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
              />
            </label>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !developer.trim() || (atLimit && !reason.trim())}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? 'Handing off…' : atLimit ? 'Hand off anyway' : 'Hand off'}
        </button>
        {atLimit && !reason.trim() && (
          <span className="text-xs text-amber-800">A reason is required to go past a limit.</span>
        )}
      </div>
    </div>
  )
}

/** A plain-language heading per refusal, chosen from the KIND. The detail underneath is
 * always the plugin's own message — this only frames it. */
function refusalHeading(kind: string): string {
  switch (kind) {
    case 'not_ready': return 'This spec is not ready to hand off yet'
    case 'unknown_developer': return 'That person is not on this project'
    case 'developer_is_checker': return 'That person is already checking this change'
    case 'team_at_limit': return 'That team is at its limit'
    default: return 'The hand-off was refused'
  }
}
