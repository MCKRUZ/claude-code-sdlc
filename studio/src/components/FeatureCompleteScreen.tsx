import { useCallback, useEffect, useState } from 'react'
import type { DeclarationStatus } from '../../shared/types'

/** Declaring Build finished (spec 0014).
 *
 * The one screen in this product where somebody says "we are done" out loud, in writing, with
 * their name on it. Everything here exists so that sentence is true when it is said.
 *
 * Studio enforces none of it. Every refusal comes back from the plugin, which means a
 * declaration cannot be slipped through by editing the state file — and this is the single most
 * consequential write in the product, so it is the last place a rule should live only in an
 * application.
 *
 * Two things are deliberately NOT smoothed over:
 *
 *   The declare button stays visible while it would be refused, and pressing it shows why. A
 *   hidden button makes the rule invisible; a visible one that explains itself teaches it.
 *
 *   A suggested reason for deferring is offered but never pre-filled. Spec 0014 asks for
 *   exactly that, and the reason is that a default reason gets accepted unread — which turns a
 *   record of WHY into a record of the tool's wording.
 */
export function FeatureCompleteScreen({
  projectPath,
  actor,
}: {
  projectPath: string
  actor: string
}) {
  const [status, setStatus] = useState<DeclarationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  /** Who confirmed which team, held here until the declaration carries them. Not persisted:
   * a confirmation is about the list as it stands right now, and one remembered from an hour
   * ago would be a confirmation of something else. */
  const [confirmed, setConfirmed] = useState<Record<string, string>>({})
  const [refusal, setRefusal] = useState<string | null>(null)
  const [declared, setDeclared] = useState<{ by: string; nextStep: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(await window.studio.getDeclarationStatus(projectPath, confirmed))
    setLoading(false)
  }, [projectPath, confirmed])

  useEffect(() => { load() }, [load])

  const declare = async () => {
    setBusy(true)
    setRefusal(null)
    const result = await window.studio.declareComplete(projectPath, actor, confirmed)
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.refusal?.message ?? 'The declaration was refused.')
      return
    }
    setDeclared({ by: result.declared_by ?? actor, nextStep: result.next_step ?? '' })
  }

  if (loading && !status) return <p className="text-sm text-slate-400">Reading the backlog…</p>
  if (!status) return null

  // After the declaration the screen states when and by whom, and offers nothing further —
  // spec 0014's last check. Reopening Build is not a thing this screen does.
  if (declared) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Build is declared complete</h2>
          <p className="mt-1 text-sm text-slate-700">Declared by {declared.by}.</p>
          {declared.nextStep && (
            <p className="mt-2 text-xs text-slate-500">{declared.nextStep}</p>
          )}
        </div>
        {status.deferred.length > 0 && (
          <DeferredList deferred={status.deferred} />
        )}
        <p className="text-xs text-slate-400">
          Late work rides the loop one spec at a time, as usual. Build does not reopen.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Declaring Build finished</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {status.totals.specs} spec{status.totals.specs === 1 ? '' : 's'} in the backlog ·{' '}
          {status.totals.unfinished} still undecided · {status.totals.deferred} deferred
        </p>
      </div>

      {status.can_declare ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <p className="text-[var(--color-command-ok)]">
            Every spec is decided and every team has confirmed its own list.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {status.blockers.map((blocker) => (
            <div key={blocker.kind} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              {/* The plugin's own words. It knows what is outstanding, and a refusal that
                  names the items is a to-do list rather than a wall. */}
              <p className="text-sm font-medium text-amber-900">{blocker.message}</p>
              {blocker.specs && blocker.specs.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {blocker.specs.map((spec) => (
                    <li key={spec.spec} className="text-sm">
                      <span className="font-mono text-xs text-amber-800">{spec.spec}</span>{' '}
                      <span className="text-amber-900">{spec.name}</span>
                      <span className="ml-2 text-xs text-amber-800">
                        {spec.status}
                        {spec.developer ? ` · ${spec.developer}` : ' · nobody assigned'}
                      </span>
                      {blocker.kind === 'unfinished_specs' && (
                        <DeferControl
                          projectPath={projectPath}
                          specName={spec.name}
                          actor={actor}
                          onDeferred={load}
                          onRefused={setRefusal}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {blocker.teams && blocker.teams.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {blocker.teams.map((team) => (
                    <li key={team}>
                      <ConfirmControl
                        team={team}
                        onConfirm={(handle) =>
                          setConfirmed((prev) => ({ ...prev, [team]: handle }))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {status.deferred.length > 0 && <DeferredList deferred={status.deferred} />}

      {refusal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="whitespace-pre-wrap">{refusal}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Visible even while it would be refused. A hidden button makes the rule invisible; a
            visible one that explains itself teaches it. */}
        <button
          type="button"
          onClick={declare}
          disabled={busy || !actor.trim()}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? 'Declaring…' : 'Declare Build complete'}
        </button>
        {actor.trim()
          ? <span className="text-xs text-slate-500">Recorded against {actor}.</span>
          : <span className="text-xs text-amber-800">
              A declaration needs a name — an unnamed one is an announcement nobody made.
            </span>}
      </div>
    </div>
  )
}

/** Deferring one spec. The suggestion is offered, never pre-filled — a default reason gets
 * accepted unread, which turns a record of why into a record of the tool's wording. */
function DeferControl({
  projectPath, specName, actor, onDeferred, onRefused,
}: {
  projectPath: string
  specName: string
  actor: string
  onDeferred: () => void
  onRefused: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const suggestion = 'not needed for this release — '

  const submit = async () => {
    setBusy(true)
    const result = await window.studio.deferSpec(
      projectPath, `specs/${specName}.md`, reason, actor,
    )
    setBusy(false)
    if (!result.ok) {
      onRefused(result.refusal?.message ?? 'The deferral was refused.')
      return
    }
    setOpen(false)
    setReason('')
    onDeferred()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-2 rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800"
      >
        Defer
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-white p-3">
      <label className="block">
        <span className="text-xs font-medium text-amber-900">
          Why was this not built? In your own words — it outlives you being asked.
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-amber-300 px-2 py-1 text-sm"
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          Defer this spec
        </button>
        <button
          type="button"
          onClick={() => setReason((r) => r || suggestion)}
          className="text-xs text-amber-800 underline"
        >
          Start from a suggestion
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** One team lead confirming their own list. The handle is required — the point of asking each
 * lead is whose assertion it is, and an anonymous yes is not one. */
function ConfirmControl({
  team, onConfirm,
}: {
  team: string
  onConfirm: (handle: string) => void
}) {
  const [handle, setHandle] = useState('')

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-amber-900">{team}</span>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="@lead"
        className="w-32 rounded-lg border border-amber-300 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => onConfirm(handle.trim())}
        disabled={!handle.trim()}
        className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 disabled:opacity-40"
      >
        Confirm this team's list
      </button>
    </span>
  )
}

function DeferredList({
  deferred,
}: {
  deferred: DeclarationStatus['deferred']
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Deferred, and why
      </h3>
      <ul className="space-y-2">
        {deferred.map((spec) => (
          <li key={spec.spec} className="text-sm">
            <span className="font-mono text-xs text-slate-400">{spec.spec}</span>{' '}
            <span className="text-slate-900">{spec.name}</span>
            <span className="mt-0.5 block text-xs text-slate-600">
              {/* A deferral with no reason is reported as such rather than left blank, because
                  blank reads as "nobody wrote one" when it may mean "it was lost". */}
              {spec.reason || 'No reason recorded — this cannot be told apart from an oversight.'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        These reasons go into the hand-over document, which is where somebody will look when
        they ask why an expected thing is not there.
      </p>
    </div>
  )
}
