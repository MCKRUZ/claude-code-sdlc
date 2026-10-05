import type { HintStatus, SignOffQuestion } from '../../shared/types'

const HINT: Record<HintStatus, { label: string; tone: string }> = {
  looks_met: { label: 'Looks done', tone: 'text-[var(--color-command-ok)]' },
  not_yet: { label: 'Not yet', tone: 'text-amber-700' },
  judgement: { label: 'Needs your judgement', tone: 'text-slate-500' },
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The questions for whoever signs a stage off: a box for each, and beside it what Studio could
 * see. The box is ticked only by a named person — a hint that says "Looks done" leaves it empty,
 * because the hint is a pre-check and the person is the one who signs. */
export function SignOffQuestions({
  questions,
  actor,
  busyId,
  error,
  onToggle,
}: {
  questions: SignOffQuestion[]
  /** Who a confirmation is recorded under. Empty means there is no one to record it for. */
  actor: string
  busyId: string | null
  error: string | null
  onToggle: (question: SignOffQuestion, confirmed: boolean) => void
}) {
  const confirmed = questions.filter((q) => q.confirmation).length
  const tooOld = questions.some((q) => !q.id)

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Questions for whoever signs this off</h3>
        <span className="text-xs text-slate-500">{`${confirmed} of ${questions.length} confirmed`}</span>
      </div>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {questions.map((q) => {
          const hint = HINT[q.hint.status]
          const canTick = Boolean(actor.trim()) && Boolean(q.id) && busyId !== q.id
          return (
            <li key={q.id || q.text} className="flex items-start justify-between gap-6 px-4 py-3">
              <label className="flex min-w-0 flex-1 items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  aria-label={q.text}
                  checked={Boolean(q.confirmation)}
                  disabled={!canTick}
                  onChange={(e) => onToggle(q, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span className="min-w-0">
                  {q.text}
                  {q.confirmation && (
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {`Confirmed by ${q.confirmation.actor} · ${formatWhen(q.confirmation.ts)}`}
                    </span>
                  )}
                </span>
              </label>
              <p className="w-2/5 shrink-0 text-xs leading-relaxed">
                <span className={`font-medium ${hint.tone}`}>{hint.label}</span>
                {q.hint.status !== 'judgement' && <span className="text-slate-500">{` — ${q.hint.detail}`}</span>}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        The notes on the right are pre-checks: they show what Studio could see, and you still confirm.
      </p>
      {!actor.trim() && (
        <p className="mt-1 text-xs text-amber-700">Studio records who confirmed, and you need to sign in before you can confirm.</p>
      )}
      {tooOld && (
        <p className="mt-1 text-xs text-amber-700">This plugin is too old to keep confirmations. To tick these, update the plugin.</p>
      )}
      {error && <p className="mt-1 text-xs text-[var(--color-command-error)]">{error}</p>}
    </div>
  )
}
