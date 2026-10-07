// The Issues view (Build Loop · Issues; `/sdlc-report-issue` in the app): the product's bug reports
// from report to fix. The queue is the plugin's own order (`report_issue.py list --json`, the
// command center's `issues` block) — new and needs-info first, then by priority — with counts by
// status (counts of reports, never of people). A report opens in place with its sections verbatim,
// its screenshots, its history and the plugin's proposals; every lifecycle action is a button that
// is present and disabled with the plugin's own reason when `show` says the lifecycle refuses it,
// and a confirm dialog otherwise. Nothing here computes a status: the plugin is the truth.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bug, RefreshCw } from 'lucide-react'
import type { ActorInfo, CommandCenter, IssueDetail, IssueDetailRead, IssueLifecycleWords, IssueQuestion, IssueRow, IssueVerbResult } from '../../../shared/types'
import { CAPABILITIES, NO_DATA, NO_ISSUES_YET, NOTHING_AWAITS_REVIEW, NOTHING_OPEN, SELECT_A_REPORT, exitHeading, newerPlugin } from '../../../shared/reasons'
import { Button, Chip, DataTable, DefinitionList, Eyebrow, Notice, Segmented, cn } from '../../ui'
import { IssueActionDialog } from './IssueActionDialog'
import { ACTION_LABEL, ACTION_ORDER, actionReason, countsLine, dataImpactTone, severityTone, statusTone, visibleRows, type IssueActionKind } from './issuesModel'

export const ISSUES_TITLE = 'Issues'

/** `| Question | Answer |` rows of a section the plugin wrote as a table → [term, detail] pairs, the
 * header and the rule skipped, an escaped pipe restored. Anything that is not such a table → []. */
export function tablePairs(section: string | undefined): Array<[string, string]> {
  if (!section) return []
  const out: Array<[string, string]> = []
  for (const line of section.split(/\r?\n/)) {
    const m = /^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line)
    if (!m) continue
    if (/^-+$/.test(m[1]) || (m[1] === 'Question' && m[2] === 'Answer') || (m[1] === 'Fact' && m[2] === 'Value')) continue
    out.push([m[1], m[2].replace(/\\\|/g, '|')])
  }
  return out
}
export const REPORT_AN_ISSUE = 'Report an issue…'
export const SYNC_WITH_SPECS = 'Sync with the specs'

type Filter = 'queue' | 'open' | 'all'
const FILTERS = [{ value: 'queue' as const, label: 'Awaiting review' }, { value: 'open' as const, label: 'Open' }, { value: 'all' as const, label: 'All' }]

export interface IssuesScreenProps {
  projectPath: string
  cc: CommandCenter | null
  /** The same read the rest of the command center re-runs after an exit 0. */
  onRefresh: () => void
  onReport: () => void
  /** Open a spec by its repo-relative path (the Board's own way). */
  onOpenSpec?: (relPath: string) => void
}

export function IssuesScreen({ projectPath, cc, onRefresh, onReport, onOpenSpec }: IssuesScreenProps) {
  const [filter, setFilter] = useState<Filter>('open')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<IssueDetailRead | null>(null)
  const [shots, setShots] = useState<Record<string, string>>({})
  const [words, setWords] = useState<IssueLifecycleWords | null>(null)
  const [questions, setQuestions] = useState<IssueQuestion[]>([])
  /** The open action dialog and the report AS IT WAS when it opened: the dialog keeps that
   * snapshot while the screen re-reads after Done, so it never unmounts under the person's eyes. */
  const [action, setAction] = useState<{ kind: IssueActionKind; detail: IssueDetail } | null>(null)
  const [rereading, setRereading] = useState(false)
  const [syncResult, setSyncResult] = useState<IssueVerbResult | null>(null)
  const [syncing, setSyncing] = useState(false)

  const actor: ActorInfo | null = cc?.actor ?? null
  const capabilities = cc?.capabilities ?? null
  const block = cc?.issues ?? null
  const rows: IssueRow[] = block?.data?.issues ?? []
  const visible = useMemo(() => visibleRows(rows, filter), [rows, filter])
  const canList = !capabilities || capabilities.includes(CAPABILITIES.issueList)

  // The lifecycle's words (status, verdict and priority labels) come from the plugin, once.
  useEffect(() => {
    if (!canList) return
    let live = true
    window.studio.getIssueQuestions(projectPath).then((r) => { if (live && r.ok) { setWords(r.plan.lifecycle); setQuestions(r.plan.questions) } })
    return () => { live = false }
  }, [projectPath, canList])

  // A re-read keeps the previous detail on screen until the new one lands (no flash to "reading…",
  // and nothing mounted on it unmounts); only a different report clears the pane.
  const load = useCallback((issue: string) => {
    setDetail((prev) => (prev?.ok && prev.data.issue === issue ? prev : null))
    setRereading(true)
    window.studio.getIssue(projectPath, issue).then((r) => {
      setDetail(r)
      setRereading(false)
      if (r.ok) {
        for (const rel of r.data.screenshot_paths) {
          window.studio.readIssueScreenshot(projectPath, rel).then((img) => { if (img.ok) setShots((prev) => ({ ...prev, [rel]: img.dataUrl })) })
        }
      }
    })
  }, [projectPath])

  useEffect(() => { if (selected) load(selected) }, [selected, load, cc?.fetchedAt])

  // The first row of the queue is selected on arrival, so the view opens on what needs a decision.
  useEffect(() => {
    if (selected === null && visible.length > 0) setSelected(visible[0].issue)
    if (selected !== null && !rows.some((r) => r.issue === selected)) setSelected(visible[0]?.issue ?? null)
  }, [visible, rows, selected])

  const current: IssueDetail | null = detail?.ok ? detail.data : null
  const specPathOf = (id: string | null) => (id ? cc?.board.data?.rows.find((r) => r.spec === id)?.path ?? null : null)
  const sprints = cc?.sprints.data?.sprints.map((s) => ({ id: s.id, state: (s as { state?: string | null }).state ?? null })) ?? []
  const roster = (cc?.roster.data?.people ?? []).map((p) => ({ handle: p.handle, name: p.name ?? p.handle }))

  const sync = async () => {
    setSyncing(true)
    try {
      const r = await window.studio.runIssueVerb(projectPath, { verb: 'sync' })
      setSyncResult(r)
      if (r.ok) onRefresh()
    } finally { setSyncing(false) }
  }
  const syncReason = capabilities && !capabilities.includes(CAPABILITIES.issueSync) ? newerPlugin(CAPABILITIES.issueSync) : null

  return (
    <div data-testid="issues-screen" className="flex min-h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-1">{ISSUES_TITLE}</h2>
          <p className="text-xs text-ink-3" title={block?.source ?? 'report_issue.py list --json'}>
            Bugs in the product, from report to a bugfix spec · {block?.data ? (countsLine(block.data.counts, words?.status_labels) || NO_ISSUES_YET) : block ? (block.error ?? NO_DATA) : NO_DATA}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* No `title` of its own: a disabled control's title IS its reason (§2.7); the provenance sits in the caption. */}
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={syncing} disabled={syncReason !== null} disabledReason={syncReason ?? undefined} onClick={sync}>{SYNC_WITH_SPECS}</Button>
          <Button size="sm" variant="primary" icon={Bug} onClick={onReport}>{REPORT_AN_ISSUE}</Button>
        </div>
      </header>
      <p className="-mt-2 text-2xs text-ink-4">Sync runs <span className="font-mono">report_issue.py sync</span>: promoted reports whose bugfix spec is merged become fixed. Nothing else moves on its own.</p>
      {syncResult && (
        <Notice tone={syncResult.ok ? 'ok' : 'warn'} title={exitHeading(syncResult.exitCode)} data-testid="issues-sync-result">
          <pre className="whitespace-pre-wrap font-mono text-[11px]">{[syncResult.stdout, syncResult.stderr].filter((s) => s.trim()).join('\n').trim() || 'The plugin printed nothing.'}</pre>
        </Notice>
      )}
      {block && !block.ok && (
        <Notice tone="warn"><p className="text-xs">{block.error}</p></Notice>
      )}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <section aria-label="Issue queue" className="min-w-0 space-y-2" data-testid="issue-queue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented<Filter> label="Which reports" size="sm" tone="neutral" options={FILTERS} value={filter} onChange={setFilter} />
            <span className="text-xs text-ink-3">{block?.data ? (block.data.queue.length === 0 ? NOTHING_AWAITS_REVIEW : `${block.data.queue.length} awaiting review`) : NO_DATA}</span>
          </div>
          <DataTable<IssueRow>
            aria-label="Issue reports"
            dense
            rows={visible}
            rowKey={(r) => r.issue}
            rowProps={(r) => ({
              'data-issue': r.issue, 'data-status': r.status, 'data-selected': r.issue === selected ? '' : undefined, tabIndex: 0,
              className: cn('cursor-pointer', r.issue === selected && 'bg-accent-50 dark:bg-accent-900/20'),
              onClick: () => setSelected(r.issue),
              onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r.issue) } },
            })}
            empty={<span>{rows.length === 0 ? NO_ISSUES_YET : filter === 'queue' ? NOTHING_AWAITS_REVIEW : NOTHING_OPEN}</span>}
            columns={[
              { id: 'issue', header: 'Report', mono: true, width: 'w-[5.5rem]', cell: (r) => <span className="whitespace-nowrap">{r.issue}</span> },
              { id: 'title', header: 'Title', cell: (r) => <span className="text-ink-1">{r.title}</span> },
              { id: 'status', header: 'Status', cell: (r) => <Chip size="xs" tone={statusTone(r.status)} casing="state">{r.status}</Chip> },
              { id: 'priority', header: 'Priority', cell: (r) => (r.priority ? <span className="font-mono text-xs">{r.priority}{r.target_sprint ? ` → ${r.target_sprint}` : ''}</span> : <span className="text-ink-4" title={`the plugin proposes ${r.proposed_priority}`}>—</span>) },
              { id: 'severity', header: 'Severity', cell: (r) => <Chip size="xs" tone={severityTone(r.severity)} casing="state">{r.severity}</Chip> },
              { id: 'where', header: 'Seen', cell: (r) => <span className="text-xs text-ink-2">{r.environment} · {r.channel}</span> },
            ]}
          />
        </section>
        <section aria-label="Report" className="min-w-0" data-testid="issue-detail">
          {!selected && <p className="rounded-[10px] border border-dashed border-line-2 px-4 py-6 text-sm text-ink-3">{SELECT_A_REPORT}</p>}
          {selected && detail === null && <p className="text-xs text-ink-3">reading {selected}…</p>}
          {rereading && detail !== null && <p className="sr-only" role="status">re-reading {selected}</p>}
          {detail && !detail.ok && <Notice tone="warn"><p className="text-xs">{detail.error}</p></Notice>}
          {current && (
            <article className="space-y-4 rounded-[14px] border border-line-1 bg-surface-1 p-4" data-testid="issue-card" data-issue={current.issue} data-status={current.status}>
              <header className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-ink-2">{current.issue}</span>
                  <Chip size="xs" tone={statusTone(current.status)} casing="state">{current.status}</Chip>
                  <Chip size="xs" tone={severityTone(current.severity)} casing="state">{current.severity}</Chip>
                  <Chip size="xs" tone={dataImpactTone(current.data_impact)} casing="state">data: {current.data_impact}</Chip>
                  {current.priority && <Chip size="xs" tone="accent" casing="identifier">{current.priority}{current.target_sprint ? ` → ${current.target_sprint}` : ''}</Chip>}
                </div>
                <h3 className="text-base font-semibold text-ink-1">{current.title}</h3>
                <p className="text-xs text-ink-3">
                  {current.environment}{current.product_version ? ` · ${current.product_version}` : ''} · {current.channel} · {current.frequency} · as {current.persona} · reported by {current.reported_by} ({current.reporter_role}) on {current.reported_at.slice(0, 10)}
                </p>
                <p className="text-xs text-ink-2" data-testid="issue-proposals" title="issue_model.proposed_priority / proposed_risk — proposals, never decisions">
                  The plugin proposes priority <span className="font-medium">{current.proposed_priority}</span> and bugfix tier <span className="font-medium">{current.proposed_risk}</span>
                  {current.triaged_by ? <> · reviewed by {current.triaged_by} ({current.triage_verdict})</> : <> · not yet reviewed</>}
                  {current.prioritized_by ? <> · prioritized by {current.prioritized_by}</> : null}
                </p>
              </header>

              <div className="flex flex-wrap gap-2" data-testid="issue-actions">
                {ACTION_ORDER.map((kind) => {
                  const reason = actionReason(kind, current, actor?.name ?? null, capabilities)
                  const primary = kind === 'triage' && current.status === 'new' || kind === 'prioritize' && current.status === 'triaged' || kind === 'promote' && current.status === 'prioritized'
                  return (
                    <Button key={kind} size="sm" variant={primary ? 'primary' : 'secondary'} data-write={kind !== 'file' ? '' : undefined} disabled={reason !== null} disabledReason={reason ?? undefined} onClick={() => setAction({ kind, detail: current })} data-action={kind}>
                      {ACTION_LABEL[kind]}
                    </Button>
                  )
                })}
              </div>

              <DefinitionList columns={2} className="text-xs" items={[
                { term: 'Built under', detail: current.spec ? (specPathOf(current.spec) && onOpenSpec ? <button type="button" className="font-mono underline" onClick={() => onOpenSpec(specPathOf(current.spec)!)}>spec {current.spec}</button> : `spec ${current.spec}`) : 'not named' },
                { term: 'Bugfix spec', detail: current.bugfix_spec ? (specPathOf(current.bugfix_spec) && onOpenSpec ? <button type="button" className="font-mono underline" onClick={() => onOpenSpec(specPathOf(current.bugfix_spec)!)}>spec {current.bugfix_spec}</button> : `spec ${current.bugfix_spec}`) : 'none yet' },
                { term: 'Filed', detail: current.filed_url ? <a href={current.filed_url} target="_blank" rel="noreferrer" className="underline">{current.filed_host} · {current.filed_url}</a> : 'not filed' },
                { term: 'Escaped from', detail: current.escaped_from ?? 'no check named' },
                ...(current.duplicate_of ? [{ term: 'Duplicate of', detail: current.duplicate_of }] : []),
              ]} />

              {['What happened', 'What you expected', 'Steps to reproduce'].map((heading) => current.sections[heading] ? (
                <section key={heading}>
                  <Eyebrow as="p">{heading}</Eyebrow>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-ink-1">{current.sections[heading]}</pre>
                </section>
              ) : null)}
              {/* The plugin writes Where and Environment as two-column tables; shown as pairs, the words untouched. */}
              {['Where', 'Environment'].map((heading) => {
                const pairs = tablePairs(current.sections[heading])
                return pairs.length ? (
                  <section key={heading}>
                    <Eyebrow as="p">{heading}</Eyebrow>
                    <DefinitionList columns={2} className="mt-1 text-xs" items={pairs.map(([term, detail]) => ({ term, detail }))} />
                  </section>
                ) : null
              })}

              {current.screenshot_paths.length > 0 && (
                <section>
                  <Eyebrow as="p">Screenshots</Eyebrow>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2" data-testid="issue-shots">
                    {current.screenshot_paths.map((rel, i) => shots[rel]
                      ? <img key={rel} src={shots[rel]} alt={`Screenshot ${i + 1} of ${current.issue}`} className="w-full rounded-lg ring-1 ring-line-1" />
                      : <div key={rel} className="rounded-lg border border-dashed border-line-2 p-3 font-mono text-2xs text-ink-3">{rel}</div>)}
                  </div>
                </section>
              )}

              {current.sections.History && (
                <section>
                  <Eyebrow as="p">History</Eyebrow>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-2" data-testid="issue-history">{current.sections.History}</pre>
                </section>
              )}
            </article>
          )}
        </section>
      </div>
      {action && (
        <IssueActionDialog
          open
          kind={action.kind}
          projectPath={projectPath}
          detail={action.detail}
          actor={actor}
          words={words}
          questions={questions}
          sprints={sprints}
          others={rows.map((r) => ({ issue: r.issue, title: r.title }))}
          roster={roster}
          onClose={() => setAction(null)}
          onDone={() => { onRefresh(); if (selected) load(selected) }}
        />
      )}
    </div>
  )
}
