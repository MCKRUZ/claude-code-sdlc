import { useEffect, useRef, useState } from 'react'
import type { PipelineEvidenceResult, PipelineRail, PipelineRailStatus } from '../../shared/types'

/** Foundation closes only when the delivery rails are *proven*, not merely present: a rail that
 * has only ever been green has been assumed, not tested. This answers "which rails have actually
 * fired?" from GitHub's own history, in the app, so nobody has to leave it to find out.
 *
 * Read-only by construction (the script behind it cannot open, merge, label or trigger anything).
 * The forced failures that would PROVE a rail each open a real pull request, so they are listed
 * here and never run from here. */

const STATUS: Record<PipelineRailStatus, { label: string; chip: string; hint: string }> = {
  PROVEN: { label: 'Proven', chip: 'bg-green-100 text-green-800', hint: 'A failure was caught: it went red on a pull request that was then fixed or closed unmerged.' },
  RAN_UNPROVEN: { label: 'Ran, never caught anything', chip: 'bg-amber-100 text-amber-800', hint: 'It ran, but nothing it did shows it can stop a bad change.' },
  NEVER_FIRED: { label: 'Never fired', chip: 'bg-slate-200 text-slate-700', hint: 'No run of this exists.' },
  BROKEN: { label: 'Broken', chip: 'bg-red-100 text-red-800', hint: 'It ran in a way its own design says it never should.' },
  NO_DATA: { label: 'No data', chip: 'border border-dashed border-slate-300 text-slate-500', hint: 'GitHub keeps no record of this, or it could not be read. Not a zero.' },
}

const PROTECTION_DOT: Record<NonNullable<PipelineEvidenceResult['protection']>['state'], string> = {
  enforcing: 'bg-green-500', not_enforcing: 'bg-red-500', none: 'bg-red-500', unreadable: 'bg-amber-500',
}

type Phase = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: PipelineEvidenceResult } | { kind: 'error'; message: string }

export function PipelineEvidencePanel({
  projectPath,
  onOpenDocument,
}: {
  projectPath: string
  onOpenDocument: (relPath: string) => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  // A result for a project the person already left must not land on the one they are looking at.
  const current = useRef(projectPath)
  useEffect(() => { current.current = projectPath; setPhase({ kind: 'idle' }) }, [projectPath])

  const gather = async () => {
    const forProject = projectPath
    setPhase({ kind: 'running' })
    try {
      const result = await window.studio.gatherPipelineEvidence(projectPath)
      if (current.current !== forProject) return
      setPhase(result.ok ? { kind: 'done', result } : { kind: 'error', message: result.error ?? 'The evidence could not be gathered.' })
    } catch (err) {
      if (current.current !== forProject) return
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'The evidence could not be gathered.' })
    }
  }

  const running = phase.kind === 'running'
  const hasResult = phase.kind === 'done'

  return (
    <section aria-labelledby="pipeline-evidence-title" className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h3 id="pipeline-evidence-title" className="text-sm font-semibold text-slate-900">Pipeline evidence</h3>
      <p className="mt-1 text-xs text-slate-500">
        Which of this project&apos;s delivery rails have actually fired, read from GitHub&apos;s own history. A rail that has only
        ever been green has been assumed, not tested. Read-only: nothing is opened, merged or changed.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running}
          onClick={gather}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {running ? 'Gathering…' : hasResult ? 'Gather again' : 'Gather pipeline evidence'}
        </button>
        {phase.kind === 'done' && phase.result.wrote && (
          <button
            type="button"
            onClick={() => onOpenDocument(phase.result.wrote!)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300"
          >
            Open pipeline-proof.md
          </button>
        )}
        {running && <RunningClock />}
      </div>

      {phase.kind === 'error' && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-command-error)]">
          <p>{phase.message}</p>
          <p className="mt-1 text-red-700/80">This needs the GitHub CLI (<code>gh</code>) installed and signed in on this machine, and a GitHub repository for the project.</p>
        </div>
      )}

      {phase.kind === 'done' && <Result result={phase.result} />}
    </section>
  )
}

function RunningClock() {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <span data-testid="pipeline-evidence-running" className="text-xs text-slate-500">
      Reading GitHub… {Math.floor((now - start) / 1000)}s — this reads the repository&apos;s history and can take up to a minute.
    </span>
  )
}

function Result({ result }: { result: PipelineEvidenceResult }) {
  const unproven = result.proofsNeeded
  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-slate-500">
        {result.repo} · gathered {result.gatheredAt}
      </p>

      {result.protection && (
        <p className="flex items-start gap-2 text-xs text-slate-700">
          <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PROTECTION_DOT[result.protection.state]}`} />
          <span>{result.protection.detail}</span>
        </p>
      )}
      {typeof result.unapprovedMerges === 'number' && result.unapprovedMerges > 0 && (
        <p className="text-xs text-amber-800">
          {result.unapprovedMerges} {result.unapprovedMerges === 1 ? 'merge' : 'merges'} since enforcement had no approval.
        </p>
      )}

      <ul data-testid="pipeline-rails" className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {result.rails.map((rail) => <RailRow key={rail.rail} rail={rail} />)}
      </ul>

      {unproven.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-800">Not yet proven ({unproven.length})</h4>
          <p className="mt-1 text-xs text-slate-500">
            Proving a rail means making it fail on purpose. Each opens a real pull request, so they are listed here, never run from here.
          </p>
          <ul className="mt-2 space-y-1.5">
            {unproven.map((p) => (
              <li key={p.rail} className="text-xs text-slate-700">
                <span className="font-medium">{p.rail}</span> — {p.proof}
                <span className="text-slate-400"> Touches {p.touches}.</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RailRow({ rail }: { rail: PipelineRail }) {
  const s = STATUS[rail.status]
  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-900">{rail.rail}</span>
        <span title={s.hint} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.chip}`}>{s.label}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{rail.reason}</p>
      {rail.runs !== null && (
        <p className="mt-0.5 text-[11px] text-slate-400">{rail.runs} run(s), {rail.red} red</p>
      )}
      {rail.evidence.length > 0 && (
        <p className="mt-0.5 text-[11px] text-slate-400">
          Evidence: {rail.evidence.slice(0, 3).map((e) => e.label).join(', ')}
          {rail.evidence.length > 3 ? ` +${rail.evidence.length - 3} more` : ''} — links are in pipeline-proof.md
        </p>
      )}
    </li>
  )
}
