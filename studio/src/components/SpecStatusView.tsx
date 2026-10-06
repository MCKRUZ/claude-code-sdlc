import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GitPullRequest } from 'lucide-react'
import type { ActorInfo, BoardRow, SpecStatus, SprintVerb } from '../../shared/types'
import type { DotStatus } from '../ui'
import { BackLink, Card, Chip, DefinitionList, Disclosure, EmptyState, Eyebrow, Icon, Notice, StatusDot } from '../ui'
import { useEnter } from '../motion/useEnter'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { motion } from '../motion/motion'
import { contextFrom, handoffCeremony, sharedElement } from '../motion/choreo'
import { stashBack } from '../motion/choreo/sharedElement'
import { riskTone, slateToBoardRow } from '../../shared/sprintModel'
import { SpecReadinessPanel } from './SpecReadinessPanel'
import { SpecFactsRail } from './SpecFactsRail'
import { SpecNeighbourhood } from './SpecNeighbourhood'
import { useConnection } from '../stores/connectionStore'
import { backlogStore } from '../stores/backlogStore'
import { hostFeatureReason } from '../../shared/codeHostModel'
import { STICKY_HEADER_CLASS, useStuck } from './useStuck'

/** Where a change got to (spec 0011).
 *
 * Read-only by construction: there is no control on this screen that changes anything, and
 * that is the spec's own acceptance check rather than a style preference. Everything shown
 * is read from the pull request — Studio computes none of it, and none of it is a status
 * someone had to remember to update.
 *
 * The only link out is to the pull request itself, because the checking happens there.
 *
 * Order (G4-11): who → is it ready → where is it → what checked it → where it sits among its
 * dependencies; the spec's own facts and the reserved sprint verbs live in the 280 px rail
 * beside the column at ≥ lg (studio-upgrade-2 S8), below it otherwise.
 *
 * Standalone or in-workflow: `onOpenSpec` is optional — without it (App today) the rail's
 * `dependsOn` ids and the neighbourhood's bodies are drawn but say why they do not open. */
export function SpecStatusView({
  projectPath,
  row,
  onBack,
  onHandOff,
  onOpenSpec,
  capabilities,
  actor,
  onVerb,
}: {
  projectPath: string
  row: BoardRow
  onBack: () => void
  onHandOff: () => void
  /** Opens another spec from this one (a dependency, a neighbour). P7 wires App's setter here. */
  onOpenSpec?: (row: BoardRow) => void
  /** Command center (togo-command-center.md §2.4): the plugin's capabilities, the resolved actor and
   * the host's VerbDialog opener, threaded to the facts rail's sprint-verb slots. All optional —
   * without them the slots stay disabled with their reason, exactly as before. */
  capabilities?: string[]
  actor?: ActorInfo | null
  onVerb?: (verb: SprintVerb, row: BoardRow) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  useEnter(rootRef, 'rise')
  useStuck(headerRef)
  // Row #8: the Board row stashed its state under the same id when it was clicked; the title
  // block Flips from there. Nothing stashed (deep link, Sprint slate) → it simply appears. The
  // opener is kept for the way back (M4): Back records the title's place, and the list screen
  // Flips its row from there and returns focus to it.
  useStudioGSAP(() => {
    const scope = rootRef.current
    if (!scope) return
    const ctx = contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion)
    sharedElement.play(ctx, { id: `spec:${row.spec}`, target: titleRef.current })
  }, { scope: rootRef, dependencies: [row.spec] })

  const back = () => {
    if (motion.enabled()) stashBack(row.spec, titleRef.current)
    else stashBack(row.spec, null)
    onBack()
  }

  const [status, setStatus] = useState<SpecStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // The host's name for the reading line, and the §7.1 reason when its CLI is what stands in
  // the way. Both fall back to today's wording until the main process has computed a connection.
  const connection = useConnection()
  const hostName = connection?.host === 'azure-devops' ? 'Azure DevOps' : connection?.host === 'github' ? 'GitHub' : null
  const hostDownReason = connection ? hostFeatureReason(connection, 'board') : null

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.studio.getSpecStatus(projectPath, row.path)
    if (result.ok && result.status) setStatus(result.status)
    else setError(result.error ?? 'Could not read this spec’s status.')
    setLoading(false)
  }, [projectPath, row.path])

  useEffect(() => { load() }, [load])

  // M9: the hand-off ceremony plays only once the REFRESHED row has arrived in-flight with the
  // plugin's developer on it — P2's `handoffCeremony` takes the cells this screen owns. A row
  // that arrived that way (deep link) plays nothing: the transition is the event, not the state.
  const buildsCellRef = useRef<HTMLElement>(null)
  const statusChipRef = useRef<HTMLElement>(null)
  const prChipRefs = useRef<Array<HTMLElement | null>>([])
  const previous = useRef<BoardRow>(row)
  useEffect(() => {
    const before = previous.current
    previous.current = row
    const handedOff = before.spec === row.spec && !before.developer && Boolean(row.developer) && row.status === 'in-flight'
    const scope = rootRef.current
    if (!handedOff || !scope) return
    handoffCeremony.play(contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion), {
      buildsCell: buildsCellRef.current,
      statusChip: statusChipRef.current,
      prChips: prChipRefs.current,
    })
  }, [row])

  const pr = status?.pull_request ?? null
  const nobody = <span className="text-ink-3">nobody</span>

  // Another spec, from the rows the Board or Sprint already fetched — never a second subprocess.
  const rowFor = useCallback((id: string): BoardRow | null => {
    const fromBoard = backlogStore.rows.find((r) => r.spec === id)
    if (fromBoard) return fromBoard
    const fromSlate = backlogStore.slate.find((r) => r.id === id)
    return fromSlate ? slateToBoardRow(fromSlate) : null
  }, [])
  const openDependency = onOpenSpec ? (id: string) => { const target = rowFor(id); if (target) onOpenSpec(target) } : null
  const dependencyReason = (id: string) => (rowFor(id) ? null : 'Open the Board once to open this spec from here.')

  return (
    <div ref={rootRef} className="space-y-6">
      <div ref={headerRef} className={STICKY_HEADER_CLASS}>
        <div ref={titleRef} data-flip-id={`spec:${row.spec}`} className="min-w-0">
          <BackLink label="← Back to the board" onClick={back} className="mb-1" />
          {/* S1 parity: every screen opens with its area eyebrow above the heading; here it is
              "BUILD · SPEC <id>", the id in mono as an identifier (the chip's `identifier` casing:
              mono, verbatim, never re-cased). The h2 beneath is untouched — its text,
              `data-page-heading`, `tabIndex` and the `data-flip-id` block are pinned by
              board.spec / sprint.spec and by the shared-element Flip. */}
          <Eyebrow className="mb-1" data-testid="spec-eyebrow">
            Build · Spec <span className="font-mono tabular-nums">{row.spec}</span>
          </Eyebrow>
          {/* The id in mono accent reads as an identifier, not a word; the title carries the rank. The
              file path is one of the rail's facts (S8, its "Path" row), so it is not repeated here —
              the document name appears once per screen. */}
          <h2 className="text-lg text-ink-1" data-page-heading tabIndex={-1}>
            <span className="font-mono text-base text-accent-text">{row.spec}</span> — {row.title || row.name}
          </h2>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-6">
          <Card>
            <DefinitionList
              columns={4}
              className="text-sm"
              items={[
                { term: <Eyebrow as="span">Owns it</Eyebrow>, detail: row.owner || nobody },
                { term: <Eyebrow as="span">Builds it</Eyebrow>, detail: <span ref={buildsCellRef}>{row.developer || nobody}</span> },
                { term: <Eyebrow as="span">Checks it</Eyebrow>, detail: row.checker || nobody },
                { term: <Eyebrow as="span">Risk</Eyebrow>, detail: row.risk ? <Chip tone={riskTone(row.risk)} casing="identifier">{row.risk}</Chip> : nobody },
              ]}
            />
          </Card>

          {/* Readiness sits here, above the pull request, because it is what a person is
              deciding about BEFORE there is one — and the hand-off button lives inside it, so
              it only ever appears when the spec would actually pass. */}
          {row.status !== 'in-flight' && row.status !== 'merged' && (
            <SpecReadinessPanel projectPath={projectPath} specPath={row.path} onHandOff={onHandOff} />
          )}

          {loading && !status && (
            <p className="text-sm text-ink-3" role="status" aria-busy="true">
              {hostName ? `Reading the pull request on ${hostName}…` : 'Reading the pull request…'}
            </p>
          )}

          {error && <Notice tone="error">{error}</Notice>}

          {status && !status.code_host_available && (
            // Never "not started" — that is a claim about the work. This is a claim about us. A
            // different fact-class from readiness, so it keeps its own notice, ONE line: the
            // headline, what the file says, the §7.1 reason, and the host's own words behind an
            // inline disclosure rather than as a mono block in the prose. Info, not amber: a
            // degraded read is information (visual §8 #4 keeps amber for a measured wait).
            <Notice tone="info" role="status">
              <span className="font-medium">Could not reach the code host.</span>{' '}
              The spec file itself says <span className="font-medium">{status.local_status || 'nothing'}</span>.
              {hostDownReason && <> {hostDownReason}</>}
              {status.error && (
                <Disclosure
                  className="inline-block align-baseline"
                  summary={<span className="ml-2 cursor-pointer text-[11px]">Show the host's message</span>}
                >
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{status.error}</pre>
                </Disclosure>
              )}
            </Notice>
          )}

          {status?.code_host_available && !pr && (
            <EmptyState
              title="No pull request yet. This spec has not been handed to anyone."
              body={<span className="font-mono">{status.branch}</span>}
            />
          )}

          {pr && (
            <div className="space-y-3">
              <Card>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink-1">
                    <Icon icon={GitPullRequest} size={16} className="text-ink-3" />
                    {pr.state === 'MERGED' ? 'Merged' : pr.state === 'CLOSED' ? 'Closed without merging' : 'Open'}
                    <span className="font-normal text-ink-3">#{pr.number}</span>
                  </p>
                  <a href={pr.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline">
                    Open on the code host
                  </a>
                </div>
                <p className="mt-1 text-sm text-ink-2">{pr.waiting_on}</p>
              </Card>

              {/* One card, hairline-divided sections, replacing four boxes: what checked it. */}
              <Card padding="none" className="divide-y divide-line-1">
                <Section title="Checks">
                  {pr.checks.length === 0 ? (
                    <p className="text-sm text-ink-3">No checks have reported yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {pr.checks.map((c) => (
                        <li key={c.name} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 text-ink-2">
                            <StatusDot status={checkDot(c.status, c.conclusion)} pulse={c.status !== 'COMPLETED'} />
                            {c.name}
                          </span>
                          <Chip tone={checkTone(c.status, c.conclusion)} casing="state">
                            {c.status !== 'COMPLETED' ? 'running' : (c.conclusion ?? 'unknown').toLowerCase()}
                          </Chip>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="The grader">
                  {!pr.grader_ran ? (
                    <p className="text-sm text-ink-3">Has not run yet.</p>
                  ) : pr.verdict_error ? (
                    // A grader that ran but cannot be read is NOT a pass. Said plainly, in warn ink.
                    <p className="text-sm text-status-warn-ink">Ran, but its verdict could not be read: {pr.verdict_error}</p>
                  ) : !pr.verdicts?.length ? (
                    <p className="text-sm text-ink-3">Ran, but reported no per-check verdicts.</p>
                  ) : (
                    <ul className="space-y-2">
                      {pr.verdicts.map((v, i) => (
                        <li key={`${v.check}-${i}`} className="text-sm">
                          <span className="inline-flex items-center gap-2">
                            <StatusDot status={v.covered === 'covered' ? 'ok' : 'warn'} />
                            <span className={v.covered === 'covered' ? 'text-status-ok-ink' : 'text-status-warn-ink'}>
                              {v.covered === 'covered' ? '✓' : '—'}
                            </span>
                            <span className="text-ink-2">{v.check}</span>
                          </span>
                          {v.reason && <span className="block pl-6 text-xs text-ink-3">{v.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-ink-3">The grader advises. It never blocks a change on its own.</p>
                </Section>

                {pr.security_review && (
                  <Section title="Security review">
                    <p className="flex items-center gap-2 text-sm text-ink-2">
                      <StatusDot status={securityDot(pr.security_review.conclusion)} pulse={pr.security_review.conclusion === null} />
                      {(pr.security_review.conclusion ?? 'still running').toLowerCase()}
                    </p>
                  </Section>
                )}

                <Section title="Approvals">
                  {pr.approvals.length === 0 ? (
                    <p className="text-sm text-ink-3">Nobody has approved this yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {pr.approvals.map((a, i) => (
                        <li key={`${a.by}-${i}`} className="flex items-center gap-2 text-sm text-ink-2">
                          <StatusDot status="ok" />
                          {a.by ?? 'someone'}
                          {a.at && <span className="text-xs text-ink-3">{a.at.slice(0, 10)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </Card>
            </div>
          )}

          <SpecNeighbourhood row={row} onOpenSpec={onOpenSpec ?? null} rowFor={rowFor} />
        </div>

        <SpecFactsRail
          row={row}
          pullRequest={pr ? { number: pr.number, url: pr.url } : null}
          onOpenDependency={openDependency}
          dependencyReason={dependencyReason}
          statusChipRef={statusChipRef}
          prChipRefs={prChipRefs}
          capabilities={capabilities}
          actor={actor}
          onVerb={onVerb}
        />
      </div>
    </div>
  )
}

/** One hairline-divided section of the checks card: the eyebrow is a real heading so a reader
 * (and the Approvals test) can find the block by name. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <Eyebrow as="h3" className="mb-2">{title}</Eyebrow>
      {children}
    </div>
  )
}

/** A COMPLETED check with no conclusion is UNKNOWN — the plugin's own words for it (the chip
 * reads "unknown", `spec_status.py` lists `None` among its non-terminal conclusions, and
 * `ado_map.py` emits it for a policy status it does not recognise). Unknown is neutral: never
 * the FAILURE red, which would be Studio computing a harsher status than the plugin reported.
 * Only a conclusion the host actually wrote and that is not a pass reads as an error. */
function isUnknownConclusion(status: string | null, conclusion: string | null): boolean {
  return status === 'COMPLETED' && conclusion === null
}

function checkDot(status: string | null, conclusion: string | null): DotStatus {
  if (status !== 'COMPLETED') return 'running'
  if (conclusion === 'SUCCESS') return 'ok'
  if (isUnknownConclusion(status, conclusion) || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') return 'idle'
  return 'error'
}

function checkTone(status: string | null, conclusion: string | null): 'neutral' | 'ok' | 'error' {
  if (status !== 'COMPLETED') return 'neutral'
  if (conclusion === 'SUCCESS') return 'ok'
  if (isUnknownConclusion(status, conclusion) || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') return 'neutral'
  return 'error'
}

function securityDot(conclusion: string | null): DotStatus {
  if (conclusion === null) return 'running'
  return conclusion.toUpperCase() === 'SUCCESS' ? 'ok' : 'error'
}
