// Report an issue — `/sdlc-report-issue new` in the app, for a bug in the PRODUCT the team is
// building (CLAUDE.md: every tooling upgrade reaches the Tōgō UI). The questions are the plugin's own
// plan (`report_issue.py questions --json`), rendered by kind and re-read when the channel changes
// (the follow-ups change with it); the build under test is the plugin's `env --json`; the screenshot
// is of the product — pasted from the clipboard or chosen as a file, this window only as a fallback;
// the privacy confirmation is the person's and never pre-ticked. Confirm shows the EXACT
// `report_issue.py new` line the closed table builds and runs it once; the answer is the plugin's,
// verbatim, under Done / Not done / Refused by the plugin, with its `gaps[]` routed back beside the
// fields they name. On Done the report is `new` — the Issues view is where it is reviewed.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ClipboardPaste, FolderOpen, X } from 'lucide-react'
import type { NavTarget } from '../../shared/nav'
import type { ActorInfo, IssueCapture, IssueEnvironmentRead, IssuePlanRead, IssueQuestion, IssueReportResult } from '../../shared/types'
import { describeIssueArgv } from '../../shared/issueArgv'
import { CAPABILITIES, NO_ACTOR, exitHeading } from '../../shared/reasons'
import { Button, DefinitionList, Dialog, Field, Icon, Input, Notice, Segmented, Select, Textarea, cn } from '../ui'
import { buildRequest, buildUnderTest, confirmReason, followUpIds, gapsByField, previewLine, type Answers } from './reportIssueModel'

export const REPORT_ISSUE_TITLE = 'Report an issue'
export const CONFIRM_REPORT = 'Confirm — write the report'
export const PASTE_SCREENSHOT = 'Paste from the clipboard'
export const CHOOSE_FILE = 'Choose a file…'
export const CAPTURE_WINDOW = 'Capture this window'
export const PRIVACY_STATEMENT = 'Nothing in the screenshot or these words is client data, personal data or a secret.'
export const OPEN_ISSUES = 'Open the Issues view'

type Shot = Extract<IssueCapture, { ok: true }>

export interface ReportIssueDialogProps {
  open: boolean
  projectPath: string
  actor: ActorInfo | null
  capabilities: readonly string[] | null
  /** The board's specs, for the optional "built under" picker. */
  specs: readonly { id: string; name: string }[]
  onClose: () => void
  /** Exit 0 landed: the host re-reads whatever lists issues. */
  onReported?: (issue: string) => void
  onNavigate?: (target: NavTarget) => void
}

export function ReportIssueDialog({ open, projectPath, actor, capabilities, specs, onClose, onReported, onNavigate }: ReportIssueDialogProps) {
  const [channel, setChannel] = useState('web')
  const [plan, setPlan] = useState<IssuePlanRead | null>(null)
  const [env, setEnv] = useState<IssueEnvironmentRead | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [shots, setShots] = useState<Shot[]>([])
  const [shotError, setShotError] = useState<string | null>(null)
  const [noClientData, setNoClientData] = useState(false)
  const [escapedFrom, setEscapedFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [result, setResult] = useState<IssueReportResult | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const canQuestions = !capabilities || capabilities.includes(CAPABILITIES.issueQuestions)

  // The plan for the chosen channel — re-read when it changes; the follow-ups change with it.
  useEffect(() => {
    if (!open || !canQuestions) return
    let live = true
    setPlan(null)
    window.studio.getIssueQuestions(projectPath, channel).then((r) => { if (live) setPlan(r) })
    return () => { live = false }
  }, [open, projectPath, channel, canQuestions])

  // The build under test once per open: the plugin's document, written to a temp file main names.
  useEffect(() => {
    if (!open) return
    let live = true
    window.studio.getIssueEnvironment(projectPath).then((r) => { if (live) setEnv(r) })
    return () => { live = false }
  }, [open, projectPath])

  // A local run's build is the branch and commit the plugin read — offered, never forced.
  useEffect(() => {
    const line = buildUnderTest(env)
    if (line && answers.environment === 'local' && !answers.product_version) setAnswers((prev) => ({ ...prev, product_version: line }))
  }, [env, answers.environment, answers.product_version])

  const questions: IssueQuestion[] = plan?.ok ? plan.plan.questions : []
  const followUps = useMemo(() => followUpIds(questions), [questions])
  const request = useMemo(() => buildRequest({ channel, answers, followUps, shots, noClientData, env, escapedFrom }), [channel, answers, followUps, shots, noClientData, env, escapedFrom])
  const reason = result?.ok ? null : confirmReason({ actor: actor?.name ?? null, capabilities, channel, shots: shots.length, noClientData, req: request })
  const preview = previewLine(request, actor?.name ?? null)
  const gaps = useMemo(() => gapsByField(result?.gaps ?? []), [result])

  const set = (id: string, value: string) => setAnswers((prev) => ({ ...prev, [id]: value }))
  const addShot = (cap: IssueCapture | null) => {
    if (!cap) return
    if (cap.ok) { setShots((prev) => (prev.some((s) => s.path === cap.path) ? prev : [...prev, cap])); setShotError(null) } else setShotError(cap.error)
  }
  const paste = async () => addShot(await window.studio.pasteScreenshot())
  const choose = async () => addShot(await window.studio.pickScreenshot())
  const capture = async () => {
    // The dialog steps out of the picture for the capture, so the image is the screen, not this panel.
    setCapturing(true)
    await new Promise((r) => setTimeout(r, 180))
    try { addShot(await window.studio.captureWindow()) } finally { setCapturing(false) }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const r = await window.studio.reportIssue(projectPath, request)
      setResult(r)
      if (r.ok && r.issue) onReported?.(r.issue)
    } finally { setBusy(false) }
  }

  if (capturing) return null

  const channelQuestion = questions.find((q) => q.id === 'channel')
  const channelOptions = channelQuestion?.options ?? [{ value: 'web', label: 'The web UI (a screen in the browser)' }]

  return (
    <Dialog open={open} onClose={onClose} title={REPORT_ISSUE_TITLE} size="lg" className="sm:max-w-5xl" scrollBody initialFocus={confirmRef} data-testid="report-issue-dialog"
      description="A bug in the product, with what a fixer needs. The plugin's own questions, your screenshot of the product, one line it runs. Nothing is written until the report is complete."
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3" title={preview} data-testid="issue-argv">{preview}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={onClose}>{result?.ok ? 'Close' : 'Cancel'}</Button>
            {!result?.ok && (
              <Button ref={confirmRef} variant="primary" data-write="" loading={busy} loadingLabel="Writing…" disabled={reason !== null} disabledReason={reason ?? undefined} onClick={confirm}>
                {CONFIRM_REPORT}
              </Button>
            )}
          </div>
        </div>
      )}
    >
      {!actor && (
        <Notice tone="warn" className="mb-3" actions={onNavigate ? <Button size="sm" variant="secondary" onClick={() => onNavigate({ area: 'settings' })}>Sign in</Button> : undefined}>
          <p className="text-xs">{NO_ACTOR}</p>
        </Notice>
      )}
      {plan && !plan.ok && <Notice tone="error" className="mb-3"><p className="text-xs">{plan.error}</p></Notice>}
      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <section aria-labelledby="issue-shots">
            <h3 id="issue-shots" className="text-xs font-semibold uppercase tracking-wide text-ink-3">Screenshot of the product</h3>
            <div className="mt-2 space-y-2" data-testid="issue-screenshots">
              {shots.map((s, i) => (
                <figure key={s.path} className="relative overflow-hidden rounded-lg ring-1 ring-line-1">
                  {s.previewUrl
                    ? <img src={s.previewUrl} alt={`Screenshot ${i + 1}, ${s.source === 'clipboard' ? 'pasted from the clipboard' : s.source === 'file' ? s.name : 'this window'}`} className="block w-full" />
                    : <div className="p-3 text-xs text-ink-3">{s.name}</div>}
                  <figcaption className="flex items-center justify-between gap-2 px-2 py-1 text-2xs text-ink-3">
                    <span>{s.source === 'clipboard' ? 'clipboard' : s.source === 'file' ? s.name : 'this window'}{s.width ? ` · ${s.width}×${s.height}` : ''} · {Math.max(1, Math.round(s.bytes / 1024))} KB</span>
                    <button type="button" aria-label={`Remove screenshot ${i + 1}`} onClick={() => setShots((prev) => prev.filter((x) => x.path !== s.path))} className="rounded p-0.5 hover:bg-surface-2"><Icon icon={X} size={12} /></button>
                  </figcaption>
                </figure>
              ))}
              {shots.length === 0 && (
                <p className="rounded-lg border border-dashed border-line-2 p-3 text-xs text-ink-3" data-testid="issue-no-shot">
                  No screenshot yet. Take one of the product as it looked (⌘⇧4 / Win+Shift+S), then paste it here. The plugin will not write a report without one.
                </p>
              )}
              {shotError && <p className="text-xs text-status-warn-ink" role="status">{shotError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={ClipboardPaste} onClick={paste}>{PASTE_SCREENSHOT}</Button>
                <Button size="sm" variant="secondary" icon={FolderOpen} onClick={choose}>{CHOOSE_FILE}</Button>
                <Button size="sm" variant="ghost" icon={Camera} onClick={capture} title="When the bug is visible in this app itself">{CAPTURE_WINDOW}</Button>
              </div>
            </div>
          </section>
          <section aria-labelledby="issue-env">
            <h3 id="issue-env" className="text-xs font-semibold uppercase tracking-wide text-ink-3">The build under test <span className="font-normal normal-case">· report_issue.py env</span></h3>
            {env === null && <p className="mt-2 text-xs text-ink-3">reading…</p>}
            {env && !env.ok && <p className="mt-2 text-xs text-status-warn-ink">{env.error}</p>}
            {env?.ok && (
              <DefinitionList columns={1} className="mt-2 text-xs" data-testid="issue-env" items={[
                { term: 'Repository', detail: env.env.repo.slug ?? 'no origin remote' },
                { term: 'Branch', detail: env.env.repo.branch ?? 'no repository' },
                { term: 'Commit', detail: env.env.repo.commit ?? 'not recorded' },
                { term: 'Code host', detail: env.env.repo.host },
                { term: 'Your machine', detail: env.env.machine.os },
              ]} />
            )}
            <p className="mt-2 text-2xs text-ink-4">For a local run the branch and commit become the product version below; for any other environment, type the build or release.</p>
          </section>
        </div>
        <div className="space-y-3" data-testid="issue-form">
          <Field label="Where in the product did you see it?" required hint={channelQuestion?.hint ?? 'The next questions depend on this answer.'}>
            <Select value={channel} onChange={(v) => { setChannel(v); setResult(null) }} aria-label="Where in the product did you see it?" options={channelOptions} />
          </Field>
          {questions.filter((q) => q.id !== 'channel' && q.id !== 'screenshot' && q.id !== 'no_client_data').map((q) => (
            <QuestionField key={q.id} q={q} value={answers[q.id] ?? ''} onChange={(v) => set(q.id, v)} error={gaps.byField[q.id]} specs={specs} />
          ))}
          {questions.length > 0 && (
            <Field label="Which check should have caught it? (optional)" hint="The grader, the security pass, a CI gate — records the scorecard's escaped_bug event. A production bug should name one.">
              <Input value={escapedFrom} onChange={(e) => setEscapedFrom(e.target.value)} placeholder="e.g. grader" />
            </Field>
          )}
          {questions.length > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-line-1 bg-surface-2/40 p-3 text-sm">
              <input type="checkbox" checked={noClientData} onChange={(e) => setNoClientData(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent-600" data-testid="issue-privacy" />
              <span>
                <span className="font-medium text-ink-1">{PRIVACY_STATEMENT}</span>
                <span className="block text-xs text-ink-3">Your statement, recorded with your name. Crop names, emails, policy and account numbers out first; a token-shaped string is refused regardless.</span>
                {gaps.byField.no_client_data && <span className="block text-xs text-status-error-ink" role="alert">{gaps.byField.no_client_data}</span>}
              </span>
            </label>
          )}
          {(gaps.byField.screenshot || gaps.byField.environment) && (
            <Notice tone="warn"><p className="text-xs">{[gaps.byField.screenshot, gaps.byField.environment].filter(Boolean).join(' · ')}</p></Notice>
          )}
          <p className="text-xs text-ink-3">
            Recorded against {actor ? <><span className="font-medium text-ink-1">{actor.name}</span> ({actor.source})</> : <span className="text-status-error-ink">{NO_ACTOR}</span>}.
          </p>
          {result && (
            <div data-testid="issue-result" className="space-y-2">
              <Notice tone={result.exitCode === 0 ? 'ok' : result.exitCode === 2 ? 'error' : 'warn'} title={exitHeading(result.exitCode)} data-exit-code={result.exitCode ?? 'none'}>
                <p className="font-mono text-[11px] text-ink-3">{result.argv.length ? describeIssueArgv(result.argv) : 'not run'}</p>
                {gaps.general.length > 0 && <ul className="mt-1 text-xs">{gaps.general.map((g) => <li key={g}>• {g}</li>)}</ul>}
                {[result.stdout, result.stderr].filter((s) => s.trim()).length > 0
                  ? <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink-1">{[result.stdout, result.stderr].filter((s) => s.trim()).join('\n').trim()}</pre>
                  : <p className="mt-1 text-xs text-ink-3">The plugin printed nothing.</p>}
              </Notice>
              {result.ok && result.issue && (
                <div className="space-y-2 rounded-lg border border-line-1 p-3" data-testid="issue-written">
                  <p className="text-sm text-ink-1"><span className="font-mono">{result.issue}</span> is <span className="font-medium">new</span>, awaiting review{result.path ? <> — <span className="font-mono text-xs">{result.path}</span></> : null}.</p>
                  {(result.proposedPriority || result.proposedRisk) && (
                    <p className="text-xs text-ink-2" data-testid="issue-proposal">
                      The plugin's proposal from this report: priority <span className="font-medium">{result.proposedPriority ?? '—'}</span>, bugfix tier <span className="font-medium">{result.proposedRisk ?? '—'}</span> — a reviewer confirms or changes both.
                    </p>
                  )}
                  {result.advisory.length > 0 && <ul className="text-xs text-status-warn-ink">{result.advisory.map((a) => <li key={a}>• {a}</li>)}</ul>}
                  {result.warnings.length > 0 && <ul className="text-xs text-status-warn-ink">{result.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
                  <p className="text-xs text-ink-3">Someone other than {actor?.name ?? 'the reporter'} reviews it next: triage, prioritize, then promote it to a bugfix spec.</p>
                  {onNavigate && <Button size="sm" variant="secondary" onClick={() => { onNavigate({ area: 'issues' }); onClose() }}>{OPEN_ISSUES}</Button>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/** One question, rendered by its kind. Choice → a Segmented when it has three options or fewer
 * (severity, frequency), a Select otherwise; `lines` and `multiline` → a Textarea. */
function QuestionField({ q, value, onChange, error, specs }: { q: IssueQuestion; value: string; onChange: (v: string) => void; error?: string; specs: readonly { id: string; name: string }[] }) {
  const label = q.auto ? <>{q.prompt} <span className="font-normal text-ink-4">· offered by the app</span></> : q.prompt
  if (q.id === 'spec' && specs.length > 0) {
    return (
      <Field label={label} hint={q.hint ?? undefined} error={error} required={q.required}>
        <Select value={value} onChange={onChange} aria-label={q.prompt} options={[{ value: '', label: 'none' }, ...specs.map((s) => ({ value: s.id, label: `${s.id} — ${s.name}` }))]} />
      </Field>
    )
  }
  if (q.kind === 'choice' && q.options) {
    if (q.options.length <= 3) {
      return (
        <Field label={label} hint={q.hint ?? undefined} error={error} required={q.required}>
          <Segmented label={q.prompt} value={value} onChange={onChange} options={q.options.map((o) => ({ value: o.value, label: o.label }))} size="sm" tone="neutral" className="flex-wrap" />
        </Field>
      )
    }
    return (
      <Field label={label} hint={q.hint ?? undefined} error={error} required={q.required}>
        <Select value={value} onChange={onChange} aria-label={q.prompt} options={[...(value ? [] : [{ value: '', label: 'pick one' }]), ...q.options]} />
      </Field>
    )
  }
  if (q.kind === 'multiline' || q.kind === 'lines') {
    return (
      <Field label={label} hint={q.hint ?? undefined} error={error} required={q.required}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={q.kind === 'lines' ? 4 : 3} aria-label={q.prompt} className={cn('w-full', q.kind === 'lines' && 'font-mono text-xs')} />
      </Field>
    )
  }
  return (
    <Field label={label} hint={q.hint ?? undefined} error={error} required={q.required}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode={q.kind === 'number' ? 'numeric' : undefined} aria-label={q.prompt} className="w-full" />
    </Field>
  )
}
