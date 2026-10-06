import { useEffect, useRef, useState } from 'react'
import type { PipelineEvidenceResult, PipelineRail, PipelineRailStatus } from '../../shared/types'
import type { ChipTone, DotStatus } from '../ui'
import { Button, Card, Chip, Notice, StatusDot } from '../ui'
import { cliLabel, hostFeatureReason, hostLabel, type HostName } from '../../shared/codeHostModel'
import { useConnection } from '../stores/connectionStore'


/** Foundation closes only when the delivery rails are *proven*, not merely present: a rail that
 * has only ever been green has been assumed, not tested. This answers "which rails have actually
 * fired?" from GitHub's own history, in the app, so nobody has to leave it to find out.
 *
 * Read-only by construction (the script behind it cannot open, merge, label or trigger anything).
 * The forced failures that would PROVE a rail each open a real pull request, so they are listed
 * here and never run from here. */

// Colour is never the only signal: every status has a label and a dot, so a rail still reads in
// monochrome. `NO_DATA` is dashed on purpose — it is the absence of a reading, not a bad one.
const STATUS: Record<PipelineRailStatus, { label: string; tone: ChipTone; className?: string; hint: string }> = {
  PROVEN: { label: 'Proven', tone: 'ok', hint: 'A failure was caught: it went red on a pull request that was then fixed or closed unmerged.' },
  RAN_UNPROVEN: { label: 'Ran, never caught anything', tone: 'warn', hint: 'It ran, but nothing it did shows it can stop a bad change.' },
  NEVER_FIRED: { label: 'Never fired', tone: 'neutral', hint: 'No run of this exists.' },
  BROKEN: { label: 'Broken', tone: 'error', hint: 'It ran in a way its own design says it never should.' },
  NO_DATA: { label: 'No data', tone: 'neutral', className: 'border border-dashed border-line-2 bg-transparent text-ink-3', hint: 'The code host keeps no record of this, or it could not be read. Not a zero.' },
}

const PROTECTION_DOT: Record<NonNullable<PipelineEvidenceResult['protection']>['state'], DotStatus> = {
  enforcing: 'ok', not_enforcing: 'error', none: 'error', unreadable: 'warn',
}

type Phase = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; result: PipelineEvidenceResult } | { kind: 'error'; message: string }

export function PipelineEvidencePanel({
  projectPath,
  onOpenDocument,
  host: hostProp,
  onResult,
}: {
  projectPath: string
  onOpenDocument: (relPath: string) => void
  /** The project's code host, when the caller knows it. Otherwise the connection store's last
   * value; otherwise GitHub — today's wording, unchanged for every screen that predates this. */
  host?: HostName
  /** Round 2 (S2): the gathered result, for the stage summary strip above this panel. Called with
   * the script's own `ok` result when a gather lands and with null when the project changes; a
   * failed gather reports nothing, since "could not read" is not a count. */
  onResult?: (result: PipelineEvidenceResult | null) => void
}) {
  const connection = useConnection()
  const host = hostProp ?? connection?.host ?? 'github'
  // The exact §7.1 sentence when the main process has established what is wrong; the same
  // sentence built from `cliLabel` when it has not (the script failed, so the need still holds).
  const needs = (connection && hostFeatureReason(connection, 'pipelineEvidence'))
    ?? `This needs the ${cliLabel(host)} installed and signed in on this machine, and pipelines on the installed CI platform.`
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  // A result for a project the person already left must not land on the one they are looking at.
  const current = useRef(projectPath)
  // Held in a ref so an inline callback never re-runs the reset below on every render.
  const report = useRef(onResult)
  useEffect(() => { report.current = onResult }, [onResult])
  useEffect(() => { current.current = projectPath; setPhase({ kind: 'idle' }); report.current?.(null) }, [projectPath])

  const gather = async () => {
    const forProject = projectPath
    setPhase({ kind: 'running' })
    try {
      const result = await window.studio.gatherPipelineEvidence(projectPath)
      if (current.current !== forProject) return
      setPhase(result.ok ? { kind: 'done', result } : { kind: 'error', message: result.error ?? 'The evidence could not be gathered.' })
      if (result.ok) report.current?.(result)
    } catch (err) {
      if (current.current !== forProject) return
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'The evidence could not be gathered.' })
    }
  }

  const running = phase.kind === 'running'
  const hasResult = phase.kind === 'done'

  return (
    <Card as="section" aria-labelledby="pipeline-evidence-title" aria-busy={running || undefined} className="mt-6">
      <h3 id="pipeline-evidence-title" className="text-sm font-semibold text-ink-1">Pipeline evidence</h3>
      <p className="mt-1 text-xs text-ink-3">
        Which of this project&apos;s delivery rails have actually fired, read from {hostLabel(host)}&apos;s own history. A rail that has only
        ever been green has been assumed, not tested. Read-only: nothing is opened, merged or changed.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={running} onClick={gather}>
          {running ? 'Gathering…' : hasResult ? 'Gather again' : 'Gather pipeline evidence'}
        </Button>
        {phase.kind === 'done' && phase.result.wrote && (
          <Button variant="secondary" size="sm" onClick={() => onOpenDocument(phase.result.wrote!)}>
            Open pipeline-proof.md
          </Button>
        )}
        {running && <RunningClock host={host} />}
      </div>

      {phase.kind === 'error' && (
        <Notice tone="error" role="alert" className="mt-3">
          <p>{phase.message}</p>
          <p className="mt-1 opacity-80">{needs}</p>
        </Notice>
      )}

      {phase.kind === 'done' && <Result result={phase.result} />}
    </Card>
  )
}

/** The seconds are a real clock (1 s tick), swapped as text; `PipelineEvidencePanel.test.tsx` runs
 * it under fake timers and reads "Reading GitHub… 7s" exactly. */
function RunningClock({ host }: { host: HostName }) {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <span data-testid="pipeline-evidence-running" role="status" className="text-xs text-ink-3">
      Reading {hostLabel(host)}… {Math.floor((now - start) / 1000)}s — this reads the repository&apos;s history and can take up to a minute.
    </span>
  )
}

function Result({ result }: { result: PipelineEvidenceResult }) {
  const unproven = result.proofsNeeded
  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-ink-3">
        {result.repo} · gathered {result.gatheredAt}
      </p>

      {result.protection && (
        <p className="flex items-start gap-2 text-xs text-ink-2">
          <StatusDot status={PROTECTION_DOT[result.protection.state]} className="mt-1" />
          <span>{result.protection.detail}</span>
        </p>
      )}
      {typeof result.unapprovedMerges === 'number' && result.unapprovedMerges > 0 && (
        <Notice tone="warn">
          {result.unapprovedMerges} {result.unapprovedMerges === 1 ? 'merge' : 'merges'} since enforcement had no approval.
        </Notice>
      )}

      <ul data-testid="pipeline-rails" className="divide-y divide-line-1 rounded-lg border border-line-1">
        {result.rails.map((rail) => <RailRow key={rail.rail} rail={rail} />)}
      </ul>

      {unproven.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink-1">Not yet proven ({unproven.length})</h4>
          <p className="mt-1 text-xs text-ink-3">
            Proving a rail means making it fail on purpose. Each opens a real pull request, so they are listed here, never run from here.
          </p>
          <ul className="mt-2 space-y-1.5">
            {unproven.map((p) => (
              <li key={p.rail} className="text-xs text-ink-2">
                <span className="font-medium">{p.rail}</span> — {p.proof}
                <span className="text-ink-3"> Touches {p.touches}.</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** "N run(s), M red" is the script's reading and is shown only when it HAS one; a rail with no
 * data shows no number at all (the test pins that "No data" is never "0 run"). */
function RailRow({ rail }: { rail: PipelineRail }) {
  const s = STATUS[rail.status]
  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-1">{rail.rail}</span>
        <Chip tone={s.tone} dot title={s.hint} className={s.className}>{s.label}</Chip>
      </div>
      <p className="mt-0.5 text-xs text-ink-3">{rail.reason}</p>
      {rail.runs !== null && (
        <p className="mt-0.5 text-2xs text-ink-3">{rail.runs} run(s), {rail.red} red</p>
      )}
      {rail.evidence.length > 0 && (
        <p className="mt-0.5 text-2xs text-ink-3">
          Evidence: {rail.evidence.slice(0, 3).map((e) => e.label).join(', ')}
          {rail.evidence.length > 3 ? ` +${rail.evidence.length - 3} more` : ''} — links are in pipeline-proof.md
        </p>
      )}
    </li>
  )
}
