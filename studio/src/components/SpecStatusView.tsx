import { useCallback, useEffect, useState } from 'react'
import type { BoardRow, SpecStatus } from '../../shared/types'

/** Where a change got to (spec 0011).
 *
 * Read-only by construction: there is no control on this screen that changes anything, and
 * that is the spec's own acceptance check rather than a style preference. Everything shown
 * is read from the pull request — Studio computes none of it, and none of it is a status
 * someone had to remember to update.
 *
 * The only link out is to the pull request itself, because the checking happens there. */
export function SpecStatusView({
  projectPath,
  row,
  onBack,
  onHandOff,
}: {
  projectPath: string
  row: BoardRow
  onBack: () => void
  onHandOff: () => void
}) {
  const [status, setStatus] = useState<SpecStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.studio.getSpecStatus(projectPath, row.path)
    if (result.ok && result.status) setStatus(result.status)
    else setError(result.error ?? 'Could not read this spec’s status.')
    setLoading(false)
  }, [projectPath, row.path])

  useEffect(() => { load() }, [load])

  const pr = status?.pull_request ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 text-xs text-slate-500 hover:text-slate-800">
            ← Back to the board
          </button>
          <h2 className="text-base font-semibold text-slate-900">
            {row.spec} — {row.title || row.name}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{row.path}</p>
        </div>
        {/* The one action, and it is not on this screen — it opens the hand-off, which is
            its own decision with its own refusals. */}
        {row.status !== 'in-flight' && row.status !== 'merged' && (
          <button
            type="button"
            onClick={onHandOff}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Hand off
          </button>
        )}
      </div>

      <dl className="grid grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <Fact label="Owns it" value={row.owner} />
        <Fact label="Builds it" value={row.developer} />
        <Fact label="Checks it" value={row.checker} />
        <Fact label="Risk" value={row.risk} />
      </dl>

      {loading && !status && <p className="text-sm text-slate-400">Reading the pull request…</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[var(--color-command-error)]">
          {error}
        </div>
      )}

      {status && !status.code_host_available && (
        // Never "not started" — that is a claim about the work. This is a claim about us.
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Could not reach the code host.</p>
          <p className="mt-0.5 text-xs">
            The spec file itself says <span className="font-medium">{status.local_status || 'nothing'}</span>.
            {status.error && <> {status.error}</>}
          </p>
        </div>
      )}

      {status?.code_host_available && !pr && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          No pull request yet. This spec has not been handed to anyone.
          <span className="ml-1 font-mono text-xs text-slate-400">{status.branch}</span>
        </div>
      )}

      {pr && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium text-slate-900">
                {pr.state === 'MERGED' ? 'Merged' : pr.state === 'CLOSED' ? 'Closed without merging' : 'Open'}
                <span className="ml-2 font-normal text-slate-500">#{pr.number}</span>
              </p>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Open on the code host
              </a>
            </div>
            <p className="mt-1 text-sm text-slate-700">{pr.waiting_on}</p>
          </div>

          <Panel title="Checks">
            {pr.checks.length === 0 ? (
              <p className="text-sm text-slate-400">No checks have reported yet.</p>
            ) : (
              <ul className="space-y-1">
                {pr.checks.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{c.name}</span>
                    <span className={checkTone(c.status, c.conclusion)}>
                      {c.status !== 'COMPLETED' ? 'running' : (c.conclusion ?? 'unknown').toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="The grader">
            {!pr.grader_ran ? (
              <p className="text-sm text-slate-400">Has not run yet.</p>
            ) : pr.verdict_error ? (
              // A grader that ran but cannot be read is NOT a pass. Said plainly.
              <p className="text-sm text-amber-700">Ran, but its verdict could not be read: {pr.verdict_error}</p>
            ) : !pr.verdicts?.length ? (
              <p className="text-sm text-slate-400">Ran, but reported no per-check verdicts.</p>
            ) : (
              <ul className="space-y-2">
                {pr.verdicts.map((v, i) => (
                  <li key={`${v.check}-${i}`} className="text-sm">
                    <span className={v.covered === 'covered' ? 'text-[var(--color-command-ok)]' : 'text-amber-700'}>
                      {v.covered === 'covered' ? '✓' : '—'}
                    </span>{' '}
                    <span className="text-slate-700">{v.check}</span>
                    {v.reason && <span className="block pl-4 text-xs text-slate-500">{v.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">
              The grader advises. It never blocks a change on its own.
            </p>
          </Panel>

          {pr.security_review && (
            <Panel title="Security review">
              <p className="text-sm text-slate-700">
                {(pr.security_review.conclusion ?? 'still running').toLowerCase()}
              </p>
            </Panel>
          )}

          <Panel title="Approvals">
            {pr.approvals.length === 0 ? (
              <p className="text-sm text-slate-400">Nobody has approved this yet.</p>
            ) : (
              <ul className="space-y-1">
                {pr.approvals.map((a, i) => (
                  <li key={`${a.by}-${i}`} className="text-sm text-slate-700">
                    {a.by ?? 'someone'}
                    {a.at && <span className="ml-2 text-xs text-slate-400">{a.at.slice(0, 10)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value || <span className="text-slate-400">nobody</span>}</dd>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

function checkTone(status: string | null, conclusion: string | null): string {
  if (status !== 'COMPLETED') return 'text-xs text-slate-400'
  if (conclusion === 'SUCCESS') return 'text-xs text-[var(--color-command-ok)]'
  if (conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') return 'text-xs text-slate-500'
  return 'text-xs font-medium text-[var(--color-command-error)]'
}
