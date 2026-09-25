import { useCallback, useEffect, useState } from 'react'
import type { SpecReadiness } from '../../shared/types'

/** What a spec still needs before anyone can be handed it (spec 0011).
 *
 * Studio decides nothing here. Every item comes from the plugin's readiness checker — the
 * same source the hand-off command uses — so this screen and the command that actually
 * refuses cannot drift apart. A panel with its own opinion would eventually say "ready" to
 * something the hand-off then rejects, which is worse than no panel.
 *
 * The blocking/advisory split is the checker's too. In particular the vague-acceptance-check
 * lint ADVISES and never blocks: it flags a check two people could build different things
 * from, and that judgement belongs to a person, not to a pattern match. Showing it as
 * blocking would be Studio promoting a hint into a rule. */
export function SpecReadinessPanel({
  projectPath,
  specPath,
  onHandOff,
}: {
  projectPath: string
  specPath: string
  onHandOff?: () => void
}) {
  const [readiness, setReadiness] = useState<SpecReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Only ever shown after a refusal has said a downgrade needs a name. Never pre-filled,
   * never remembered — the point of the rule is that each downgrade is a deliberate act
   * with somebody's name on it, and a remembered name would make the second one free. */
  const [authorisedBy, setAuthorisedBy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setReadiness(await window.studio.getSpecReadiness(projectPath, specPath))
    setLoading(false)
  }, [projectPath, specPath])

  useEffect(() => { load() }, [load])

  const act = async (run: () => Promise<{ ok: boolean; refusal?: { kind: string; message: string } }>) => {
    setBusy(true)
    setRefusal(null)
    const result = await run()
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.refusal?.message ?? 'That change was refused.')
      // The window does not decide this; it reacts to what the plugin said.
      if (result.refusal?.kind === 'lowering_needs_authorisation') setAuthorisedBy('')
      return
    }
    setAuthorisedBy(null)
    await load()
  }

  if (loading && !readiness) return <p className="text-sm text-slate-400">Checking this spec…</p>
  if (!readiness) return null

  if (!readiness.ok) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
        {readiness.error ?? 'Could not check this spec.'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border px-4 py-3 ${
          readiness.ready
            ? 'border-slate-200 bg-white'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <p className={`text-sm font-medium ${readiness.ready ? 'text-[var(--color-command-ok)]' : 'text-amber-900'}`}>
            {readiness.ready
              ? 'Ready to hand off.'
              : `${readiness.blocking.length} thing${readiness.blocking.length === 1 ? '' : 's'} still needed before this can be handed off.`}
          </p>
          {/* Two buttons, two different rules, deliberately.
              HAND OFF appears only when the spec is actually ready — offering an action
              that is going to be refused teaches people to ignore the panel above it.
              MARK READY appears even when it is not, because its refusal comes back from
              the plugin WITH its reasons; hiding that button would make the rule invisible
              instead of enforced, and the person would never learn what is missing. */}
          <div className="flex shrink-0 gap-2">
            {readiness.status === 'draft' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => window.studio.markSpecReady(projectPath, specPath))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
              >
                Mark ready
              </button>
            )}
            {readiness.ready && onHandOff && (
              <button
                type="button"
                onClick={onHandOff}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Hand off
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Risk tier</h3>
        <div className="flex flex-wrap items-center gap-2">
          {['LOW', 'MEDIUM', 'HIGH'].map((tier) => (
            <button
              key={tier}
              type="button"
              disabled={busy || tier === readiness.risk}
              onClick={() => act(() => window.studio.setSpecRisk(
                projectPath, specPath, tier, authorisedBy?.trim() || undefined,
              ))}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                tier === readiness.risk
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {tier}
            </button>
          ))}
          <span className="text-xs text-slate-400">
            Raising a tier is free. Lowering one is recorded against whoever decided it.
          </span>
        </div>

        {authorisedBy !== null && (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-amber-900">
              Who authorised lowering this tier? Written into the spec.
            </span>
            <input
              value={authorisedBy}
              onChange={(e) => setAuthorisedBy(e.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      {refusal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {/* The plugin's own words — it knows why it refused. */}
          <p className="whitespace-pre-wrap">{refusal}</p>
        </div>
      )}

      {readiness.blocking.length > 0 && (
        <Group title="Still needed" tone="blocking" findings={readiness.blocking} />
      )}

      {readiness.advisory.length > 0 && (
        <Group
          title="Worth a look"
          tone="advisory"
          findings={readiness.advisory}
          note="These do not stop a hand-off. A flagged acceptance check is a hint that two people could build different things from it — whether that is true is a judgement, not a pattern match."
        />
      )}

      {readiness.passed.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-400">
            {readiness.passed.length} check{readiness.passed.length === 1 ? '' : 's'} already passing
          </summary>
          <ul className="mt-2 space-y-1">
            {readiness.passed.map((f, i) => (
              <li key={`${f.check}-${i}`} className="text-sm text-slate-500">
                <span className="text-[var(--color-command-ok)]">✓</span> {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Group({
  title, tone, findings, note,
}: {
  title: string
  tone: 'blocking' | 'advisory'
  findings: SpecReadiness['blocking']
  note?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</h3>
      <ul className="space-y-2">
        {findings.map((f, i) => (
          <li key={`${f.check}-${i}`} className="text-sm">
            <span className={tone === 'blocking' ? 'text-amber-700' : 'text-slate-400'}>
              {tone === 'blocking' ? '•' : '–'}
            </span>{' '}
            {/* The checker's own words. It knows why it flagged this; a paraphrase would be
                Studio guessing at a judgement it did not make. */}
            <span className="text-slate-700">{f.message}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-xs text-slate-400">{note}</p>}
    </div>
  )
}
