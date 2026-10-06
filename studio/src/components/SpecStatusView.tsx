import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GitPullRequest } from 'lucide-react'
import type { BoardRow, SpecStatus } from '../../shared/types'
import type { DotStatus } from '../ui'
import { BackLink, Button, Card, Chip, DefinitionList, EmptyState, Eyebrow, Icon, Notice, StatusDot } from '../ui'
import { useEnter } from '../motion/useEnter'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { motion } from '../motion/motion'
import { contextFrom, sharedElement } from '../motion/choreo'
import { SpecReadinessPanel } from './SpecReadinessPanel'
import { useConnection } from '../stores/connectionStore'
import { hostFeatureReason } from '../../shared/codeHostModel'
import { STICKY_HEADER_CLASS, useStuck } from './useStuck'

/** The sprint write verbs (`sprint.py verdict / next / ack / ready`) have no IPC yet. The slots
 * are drawn now so the screen's shape is settled, and each says why it does nothing. */
const BATCH3_REASON = "Needs the plugin's sprint write verbs (Batch 3)"
const BATCH3_SLOTS = ['Verdict', 'Pass next action', 'Acknowledge', 'Mark ready'] as const

/** Where a change got to (spec 0011).
 *
 * Read-only by construction: there is no control on this screen that changes anything, and
 * that is the spec's own acceptance check rather than a style preference. Everything shown
 * is read from the pull request — Studio computes none of it, and none of it is a status
 * someone had to remember to update.
 *
 * The only link out is to the pull request itself, because the checking happens there.
 *
 * Order (G4-11): who → is it ready → where is it → what checked it → what you cannot do yet. */
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
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  useEnter(rootRef, 'rise')
  useStuck(headerRef)
  // Row #8: the Board row stashed its state under the same id when it was clicked; the title
  // block Flips from there. Nothing stashed (deep link, Sprint slate) → it simply appears.
  useStudioGSAP(() => {
    const scope = rootRef.current
    if (!scope) return
    const ctx = contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion)
    sharedElement.play(ctx, { id: `spec:${row.spec}`, target: titleRef.current })
  }, { scope: rootRef, dependencies: [row.spec] })

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

  const pr = status?.pull_request ?? null
  const nobody = <span className="text-ink-4">nobody</span>

  return (
    <div ref={rootRef} className="space-y-6">
      <div ref={headerRef} className={STICKY_HEADER_CLASS}>
        <div ref={titleRef} data-flip-id={`spec:${row.spec}`} className="min-w-0">
          <BackLink label="← Back to the board" onClick={onBack} className="mb-1" />
          {/* The id in mono accent reads as an identifier, not a word; the title carries the rank. */}
          <h2 className="text-lg text-ink-1" data-page-heading tabIndex={-1}>
            <span className="font-mono text-base text-accent-700">{row.spec}</span> — {row.title || row.name}
          </h2>
          <p className="mt-1 font-mono text-xs text-ink-4">{row.path}</p>
        </div>
      </div>

      <Card>
        <DefinitionList
          columns={4}
          className="text-sm"
          items={[
            { term: <Eyebrow as="span">Owns it</Eyebrow>, detail: row.owner || nobody },
            { term: <Eyebrow as="span">Builds it</Eyebrow>, detail: row.developer || nobody },
            { term: <Eyebrow as="span">Checks it</Eyebrow>, detail: row.checker || nobody },
            { term: <Eyebrow as="span">Risk</Eyebrow>, detail: row.risk || nobody },
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
        <p className="text-sm text-ink-4" role="status" aria-busy="true">
          {hostName ? `Reading the pull request on ${hostName}…` : 'Reading the pull request…'}
        </p>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {status && !status.code_host_available && (
        // Never "not started" — that is a claim about the work. This is a claim about us. A
        // different fact-class from readiness, so it keeps its own notice, kept compact: the
        // host's own words sit behind a disclosure rather than as a mono block in the prose.
        <Notice tone="warn" title="Could not reach the code host.">
          The spec file itself says <span className="font-medium">{status.local_status || 'nothing'}</span>.
          {hostDownReason && <p className="mt-1">{hostDownReason}</p>}
          {status.error && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px]">Show the host's message</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{status.error}</pre>
            </details>
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
              <a href={pr.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-700 hover:underline">
                Open on the code host
              </a>
            </div>
            <p className="mt-1 text-sm text-ink-2">{pr.waiting_on}</p>
          </Card>

          {/* One card, hairline-divided sections, replacing four boxes: what checked it. */}
          <Card padding="none" className="divide-y divide-line-1">
            <Section title="Checks">
              {pr.checks.length === 0 ? (
                <p className="text-sm text-ink-4">No checks have reported yet.</p>
              ) : (
                <ul className="space-y-1">
                  {pr.checks.map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-ink-2">
                        <StatusDot status={checkDot(c.status, c.conclusion)} pulse={c.status !== 'COMPLETED'} />
                        {c.name}
                      </span>
                      <Chip tone={checkTone(c.status, c.conclusion)}>
                        {c.status !== 'COMPLETED' ? 'running' : (c.conclusion ?? 'unknown').toLowerCase()}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="The grader">
              {!pr.grader_ran ? (
                <p className="text-sm text-ink-4">Has not run yet.</p>
              ) : pr.verdict_error ? (
                // A grader that ran but cannot be read is NOT a pass. Said plainly, in warn ink.
                <p className="text-sm text-status-warn-ink">Ran, but its verdict could not be read: {pr.verdict_error}</p>
              ) : !pr.verdicts?.length ? (
                <p className="text-sm text-ink-4">Ran, but reported no per-check verdicts.</p>
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
              <p className="mt-2 text-xs text-ink-4">The grader advises. It never blocks a change on its own.</p>
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
                <p className="text-sm text-ink-4">Nobody has approved this yet.</p>
              ) : (
                <ul className="space-y-1">
                  {pr.approvals.map((a, i) => (
                    <li key={`${a.by}-${i}`} className="flex items-center gap-2 text-sm text-ink-2">
                      <StatusDot status="ok" />
                      {a.by ?? 'someone'}
                      {a.at && <span className="text-xs text-ink-4">{a.at.slice(0, 10)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>
        </div>
      )}

      {/* What you cannot do yet, last and quiet (inset). Reserved slots, drawn disabled with
          their reason (SpecStatusView.test pins all four): the note says up front that none of
          them works yet, so the row reads as a promise, not as four live controls. */}
      <Card tone="inset">
        <Eyebrow as="h3" className="mb-2">Sprint decisions</Eyebrow>
        <p className="mb-2 text-xs text-ink-4">Not available yet — these arrive with the plugin's sprint write verbs.</p>
        <div className="flex flex-wrap gap-2">
          {BATCH3_SLOTS.map((label) => (
            <Button key={label} size="sm" disabled disabledReason={BATCH3_REASON}>{label}</Button>
          ))}
        </div>
      </Card>
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
