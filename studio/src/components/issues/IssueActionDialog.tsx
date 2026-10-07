// One lifecycle action on one report, confirmed (togo-command-center.md §2.4's pattern): the form
// for the verb, the plugin's proposal pre-selected and MARKED as a proposal, the EXACT
// `report_issue.py` line the closed table builds, who it is recorded against, a Confirm
// (`data-write`), and the plugin's stdout / stderr verbatim under Done / Not done / Refused by the
// plugin. Filing shows the dry run — the exact `gh` / `az` command — before a second Confirm sends
// anything off this computer. On exit 0 the host re-reads; nothing here moves on its own.
import { useMemo, useRef, useState } from 'react'
import type { ActorInfo, IssueDetail, IssueLifecycleWords, IssueVerbResult } from '../../../shared/types'
import { describeIssueArgv } from '../../../shared/issueArgv'
import { NO_ACTOR, NO_OPEN_SPRINT_TO_SLATE, exitHeading } from '../../../shared/reasons'
import { Button, Dialog, Field, Input, Notice, Segmented, Select, Textarea } from '../../ui'
import { actionTitle, initialForm, previewVerb, requestFor, type ActionForm, type IssueActionKind } from './issuesModel'

export interface IssueActionDialogProps {
  open: boolean
  kind: IssueActionKind
  projectPath: string
  detail: IssueDetail
  actor: ActorInfo | null
  words: IssueLifecycleWords | null
  /** Open sprints the plugin listed (`sprint.py list --json`), for the target-sprint picker. */
  sprints: readonly { id: string; state: string | null }[]
  /** The other reports, for the duplicate picker. */
  others: readonly { issue: string; title: string }[]
  roster: readonly { handle: string; name: string }[]
  onClose: () => void
  /** Exit 0 landed. */
  onDone: (result: IssueVerbResult) => void
}

const SEVERITIES = [{ value: 'blocks', label: 'Blocks the task' }, { value: 'degraded', label: 'Degraded' }, { value: 'cosmetic', label: 'Cosmetic' }]
const IMPACTS = [{ value: 'none', label: 'None' }, { value: 'wrong-shown', label: 'Wrong data shown' }, { value: 'wrong-written', label: 'Wrong data written' }, { value: 'exposed', label: 'Data exposed' }]

export function IssueActionDialog({ open, kind, projectPath, detail, actor, words, sprints, others, roster, onClose, onDone }: IssueActionDialogProps) {
  const [form, setForm] = useState<ActionForm>(() => initialForm(kind, detail))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<IssueVerbResult | null>(null)
  const [dry, setDry] = useState<IssueVerbResult | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const set = <K extends keyof ActionForm>(key: K, value: ActionForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const request = useMemo(() => requestFor(kind, detail.issue, { ...form, dryRun: kind === 'file' ? !dry : form.dryRun }), [kind, detail.issue, form, dry])
  const preview = previewVerb(request, actor?.name ?? null)
  const isReporter = Boolean(actor && detail.reported_by && actor.name.replace(/^@/, '').toLowerCase() === detail.reported_by.replace(/^@/, '').toLowerCase())
  const slateReason = !form.slate ? null : detail.target_sprint ? null : sprints.some((s) => s.state !== 'closed') ? null : NO_OPEN_SPRINT_TO_SLATE
  const reason = !actor ? NO_ACTOR : preview.errors.length ? preview.errors.join('; ') : slateReason

  const run = async () => {
    setBusy(true)
    try {
      const r = await window.studio.runIssueVerb(projectPath, request)
      if (kind === 'file' && !dry) { setDry(r); return }
      setResult(r)
      if (r.ok) onDone(r)
    } finally { setBusy(false) }
  }

  const priorityLabel = (p: string) => words?.priority_labels[p] ?? p
  const verdictLabel = (v: string) => words?.triage_verdict_labels[v] ?? v
  const openSprints = sprints.filter((s) => s.state !== 'closed')

  return (
    <Dialog open={open} onClose={onClose} title={actionTitle(kind, detail.issue)} size="lg" initialFocus={confirmRef} data-testid="issue-action-dialog"
      description={<span className="font-mono text-xs">{detail.title}</span>}
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3" title={preview.line} data-testid="issue-action-argv">{preview.line}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
            {!result && (
              <Button ref={confirmRef} variant="primary" data-write="" loading={busy} loadingLabel="Running…" disabled={reason !== null} disabledReason={reason ?? undefined} onClick={run}>
                {kind === 'file' ? (dry ? 'Confirm — file it' : 'Show the command') : 'Confirm'}
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="space-y-3 text-sm">
        {kind === 'triage' && (
          <>
            {isReporter && (
              <Notice tone="warn" title="You reported this">
                <p className="text-xs">A report is reviewed by someone other than its reporter. A team of one may override, with a reason the record keeps.</p>
                <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={form.override} onChange={(e) => set('override', e.target.checked)} /> Override — I am reviewing my own report</label>
              </Notice>
            )}
            <Field label="Verdict" required>
              <Select value={form.verdict} onChange={(v) => set('verdict', v as ActionForm['verdict'])} aria-label="Verdict" options={['confirmed', 'needs-info', 'duplicate', 'wont-fix'].map((v) => ({ value: v, label: verdictLabel(v) }))} />
            </Field>
            {form.verdict === 'confirmed' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Severity" hint={`the report says ${detail.severity}`}><Select value={form.severity} onChange={(v) => set('severity', v)} aria-label="Severity" options={SEVERITIES} /></Field>
                <Field label="Data impact" hint={`the report says ${detail.data_impact}`}><Select value={form.dataImpact} onChange={(v) => set('dataImpact', v)} aria-label="Data impact" options={IMPACTS} /></Field>
              </div>
            )}
            {form.verdict === 'needs-info' && (
              <Field label="What should the reporter add?" required><Input value={form.question} onChange={(e) => set('question', e.target.value)} className="w-full" /></Field>
            )}
            {form.verdict === 'duplicate' && (
              <Field label="Duplicate of" required>
                <Select value={form.of} onChange={(v) => set('of', v)} aria-label="Duplicate of" options={[{ value: '', label: 'pick a report' }, ...others.filter((o) => o.issue !== detail.issue).map((o) => ({ value: o.issue, label: `${o.issue} — ${o.title}` }))]} />
              </Field>
            )}
            <Field label={form.verdict === 'wont-fix' ? 'Why — the reporter will read it' : form.override ? 'Why you review your own report' : 'A note (optional)'} required={form.verdict === 'wont-fix' || form.override}>
              <Input value={form.reason} onChange={(e) => set('reason', e.target.value)} className="w-full" />
            </Field>
          </>
        )}
        {kind === 'prioritize' && (
          <>
            <Field label="Priority" required hint={<>the plugin's proposal from this report: <span className="font-medium" data-testid="proposal">{detail.proposed_priority}</span> — yours to confirm or change</>}>
              <Segmented label="Priority" value={form.priority} onChange={(v) => set('priority', v as ActionForm['priority'])} size="sm" tone="neutral" className="flex-wrap"
                options={['P1', 'P2', 'P3'].map((p) => ({ value: p, label: p === detail.proposed_priority ? `${priorityLabel(p)} · proposed` : priorityLabel(p) }))} />
            </Field>
            <Field label="Target sprint" hint={openSprints.length ? 'the sprint the fix should land in' : 'no open sprint record yet — the id is recorded as typed'}>
              {openSprints.length
                ? <Select value={form.targetSprint} onChange={(v) => set('targetSprint', v)} aria-label="Target sprint" options={[{ value: '', label: 'none yet' }, ...openSprints.map((s) => ({ value: s.id, label: s.id }))]} />
                : <Input value={form.targetSprint} onChange={(e) => set('targetSprint', e.target.value.toUpperCase())} placeholder="S08" />}
            </Field>
            <Field label={form.priority && form.priority !== detail.proposed_priority ? 'Why it differs from the proposal' : 'A reason (optional)'}>
              <Input value={form.reason} onChange={(e) => set('reason', e.target.value)} className="w-full" />
            </Field>
          </>
        )}
        {kind === 'promote' && (
          <>
            <Field label="Risk tier of the fix" required hint={<>the plugin's proposal from this report: <span className="font-medium" data-testid="proposal">{detail.proposed_risk}</span> — a tier is a decision the method records against you</>}>
              <Segmented label="Risk tier" value={form.risk} onChange={(v) => set('risk', v as ActionForm['risk'])} size="sm" tone="neutral"
                options={['HIGH', 'MEDIUM', 'LOW'].map((t) => ({ value: t, label: t === detail.proposed_risk ? `${t} · proposed` : t }))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Owner (optional)">
                {roster.length
                  ? <Select value={form.owner} onChange={(v) => set('owner', v)} aria-label="Owner" options={[{ value: '', label: 'none' }, ...roster.map((p) => ({ value: p.handle, label: `${p.name} (${p.handle})` }))]} />
                  : <Input value={form.owner} onChange={(e) => set('owner', e.target.value)} placeholder="@handle" />}
              </Field>
              <Field label="Team (optional)"><Input value={form.team} onChange={(e) => set('team', e.target.value)} /></Field>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-line-1 p-3 text-sm">
              <input type="checkbox" checked={form.slate} onChange={(e) => set('slate', e.target.checked)} data-testid="promote-slate" />
              <span>
                <span className="font-medium text-ink-1">Also slate it into {detail.target_sprint ?? 'the active sprint'}</span>
                <span className="block text-xs text-ink-3">Runs <span className="font-mono">sprint.py slate</span> after the scaffold; its own refusal (over target, closed) comes back as a warning on an otherwise promoted report. The spec still has to reach READY through /sdlc-spec before the sprint can.</span>
              </span>
            </label>
            <p className="text-xs text-ink-3">The scaffold is <span className="font-mono">new_spec.py</span>'s, with <span className="font-mono">type: bugfix</span> — the first acceptance check is the reproduction, a test that fails on the pre-fix code.</p>
          </>
        )}
        {kind === 'note' && (
          <Field label="Note" required hint="for the fixer or the reporter — an answer to a question, a finding, a link"><Textarea value={form.note} onChange={(e) => set('note', e.target.value)} rows={3} className="w-full" /></Field>
        )}
        {(kind === 'reopen' || kind === 'wont-fix') && (
          <Field label={kind === 'reopen' ? 'What still happens' : 'Why — the reporter will read it'} required><Input value={form.reason} onChange={(e) => set('reason', e.target.value)} className="w-full" /></Field>
        )}
        {kind === 'fixed' && (
          <Field label="How it was fixed (optional)" hint={detail.bugfix_spec ? `the bugfix spec is ${detail.bugfix_spec}; Sync marks this fixed when it merges` : 'no bugfix spec — a fix that landed inside another change'}>
            <Input value={form.reason} onChange={(e) => set('reason', e.target.value)} className="w-full" />
          </Field>
        )}
        {kind === 'duplicate' && (
          <>
            <Field label="Duplicate of" required>
              <Select value={form.of} onChange={(v) => set('of', v)} aria-label="Duplicate of" options={[{ value: '', label: 'pick a report' }, ...others.filter((o) => o.issue !== detail.issue).map((o) => ({ value: o.issue, label: `${o.issue} — ${o.title}` }))]} />
            </Field>
            <Field label="A note (optional)"><Input value={form.reason} onChange={(e) => set('reason', e.target.value)} className="w-full" /></Field>
          </>
        )}
        {kind === 'file' && (
          <>
            <Field label="Label or tag (optional)" hint="a GitHub label or an Azure DevOps tag; it must already exist on the host"><Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="bug" /></Field>
            <p className="text-xs text-ink-3">The report stays in the repository either way. First the exact command the plugin would run; then, if you confirm, it runs.</p>
            {dry && (
              <Notice tone={dry.ok ? 'info' : dry.exitCode === 2 ? 'error' : 'warn'} title={dry.ok ? 'Would run' : exitHeading(dry.exitCode)} data-testid="issue-file-dry">
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-ink-1">{dry.ok && Array.isArray(dry.doc?.argv) ? (dry.doc!.argv as string[]).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ') : [dry.stdout, dry.stderr].filter((s) => s.trim()).join('\n').trim()}</pre>
              </Notice>
            )}
          </>
        )}
        <p className="text-xs text-ink-3">
          Recorded against {actor ? <><span className="font-medium text-ink-1">{actor.name}</span> ({actor.source})</> : <span className="text-status-error-ink">{NO_ACTOR}</span>}.
        </p>
        {result && (
          <Notice tone={result.exitCode === 0 ? 'ok' : result.exitCode === 2 ? 'error' : 'warn'} title={exitHeading(result.exitCode)} data-testid="issue-action-result" data-exit-code={result.exitCode ?? 'none'}>
            <p className="font-mono text-[11px] text-ink-3">{result.argv.length ? describeIssueArgv(result.argv) : 'not run'}</p>
            {[result.stdout, result.stderr].filter((s) => s.trim()).length > 0
              ? <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-1">{[result.stdout, result.stderr].filter((s) => s.trim()).join('\n').trim()}</pre>
              : <p className="mt-1 text-xs text-ink-3">The plugin printed nothing.</p>}
            {result.ok && typeof result.doc?.url === 'string' && result.doc.url && (
              <p className="mt-1 text-xs"><a href={String(result.doc.url)} target="_blank" rel="noreferrer" className="text-accent-600 underline">{String(result.doc.url)}</a></p>
            )}
          </Notice>
        )}
      </div>
    </Dialog>
  )
}
