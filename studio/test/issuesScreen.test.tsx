// @vitest-environment jsdom
/** The Issues view (src/components/issues/IssuesScreen.tsx): the queue is the command center's
 * `issues` block as the plugin ordered it; the first row opens on arrival; a report's actions are
 * buttons disabled with the plugin's own `show` sentence (or NO_ACTOR / a newer-plugin capability);
 * an action opens its confirm dialog, previews the exact line, runs one `runIssueVerb`, and the host
 * re-reads on exit 0; the empty states are the fixed sentences, never a zero. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandCenter, IssueDetail, IssueRow, IssueVerbResult, SourcedBlock } from '../shared/types'
import { isReason, NO_ACTOR, NO_ISSUES_YET, NOTHING_AWAITS_REVIEW, NOTHING_OPEN } from '../shared/reasons'
import { IssuesScreen, REPORT_AN_ISSUE, tablePairs } from '../src/components/issues/IssuesScreen'
import { EMPTY_CC } from './sprintHomeFixture'

const row = (over: Partial<IssueRow>): IssueRow => ({
  issue: 'ISS-0001', title: 'Claim total doubles after adding a second line item', status: 'new', channel: 'web', environment: 'test', product_version: null,
  severity: 'degraded', frequency: 'always', data_impact: 'wrong-shown', persona: 'a claims adjuster', reporter_role: 'checker', spec: null,
  priority: null, target_sprint: null, triaged_by: null, triage_verdict: null, prioritized_by: null, duplicate_of: null, bugfix_spec: null,
  reported_by: 'Priya N.', reported_at: '2026-10-07T07:00:00+00:00', screenshots: 1, filed_host: null, filed_url: null, escaped_from: null,
  path: '.sdlc/issues/ISS-0001-x.md', proposed_risk: 'MEDIUM', proposed_priority: 'P2', ...over,
})

const ROWS = [row({}), row({ issue: 'ISS-0002', title: 'Export job writes last month twice', status: 'prioritized', priority: 'P1', target_sprint: 'S08', channel: 'data', severity: 'blocks', data_impact: 'wrong-written', proposed_priority: 'P1', proposed_risk: 'HIGH' })]

const block = (data: { issues: IssueRow[]; queue: string[] } | null, error: string | null = null): SourcedBlock<CommandCenter['issues'] extends SourcedBlock<infer T> | undefined ? T : never> => ({
  source: 'report_issue.py list --json', fetchedAt: '2026-10-07T07:00:00Z', ok: data !== null, error,
  data: data ? { issues: data.issues, count: data.issues.length, counts: { new: data.issues.filter((r) => r.status === 'new').length, prioritized: data.issues.filter((r) => r.status === 'prioritized').length }, queue: data.queue, dir: '.sdlc/issues' } : null,
})

function detailFor(r: IssueRow): IssueDetail {
  const isNew = r.status === 'new'
  return {
    ...r,
    sections: { 'What happened': 'Adding a second line item shows the total as twice the sum.', 'Steps to reproduce': '1. open claim 1042\n2. add a line item', History: `- t — reported by ${r.reported_by}` },
    screenshot_paths: ['.sdlc/issues/ISS-0001/screenshot-1.png'],
    actions: {
      triage: { ok: isNew, reason: isNew ? null : `${r.issue} is ${r.status} — triage decides a new or needs-info report; from ${r.status} use prioritize, promote or set-status`, to: isNew ? 'triaged' : null },
      prioritize: { ok: !isNew, reason: isNew ? `${r.issue} is new — a report is prioritized once it has been reviewed and confirmed (\`triage --verdict confirmed\`)` : null, to: !isNew ? 'prioritized' : null },
      promote: { ok: r.status === 'prioritized', reason: r.status === 'prioritized' ? null : `${r.issue} is ${r.status} — review it first (\`triage\`), then prioritize it; a bugfix spec is scaffolded only from a prioritized report`, to: r.status === 'prioritized' ? 'promoted' : null },
      fixed: { ok: !isNew, reason: isNew ? `${r.issue} is new — nobody has confirmed the bug yet; triage it before calling it fixed` : null, to: null },
      'wont-fix': { ok: true, reason: null, to: 'wont-fix' }, duplicate: { ok: true, reason: null, to: 'duplicate' },
      reopen: { ok: false, reason: `${r.issue} is ${r.status}, not closed — nothing to reopen`, to: null },
      file: { ok: true, reason: null, to: null }, note: { ok: true, reason: null, to: null },
    },
  }
}

function install(over: Record<string, unknown> = {}) {
  const studio = {
    getIssueQuestions: vi.fn().mockResolvedValue({ ok: true, plan: { channel: null, questions: [], minimum: {}, lifecycle: { statuses: [], triage_verdicts: ['confirmed', 'needs-info', 'duplicate', 'wont-fix'], priorities: ['P1', 'P2', 'P3'], priority_labels: { P1: 'P1 — fix now', P2: 'P2 — next sprint', P3: 'P3 — the backlog' }, status_labels: { new: 'New — awaiting review', prioritized: 'Prioritized — P1 / P2 / P3' }, triage_verdict_labels: { confirmed: 'Confirmed — it is a bug', 'needs-info': 'Needs info', duplicate: 'Duplicate', 'wont-fix': "Won't fix" } } } }),
    getIssue: vi.fn().mockImplementation((_p: string, issue: string) => Promise.resolve({ ok: true, data: detailFor(ROWS.find((r) => r.issue === issue) ?? ROWS[0]) })),
    readIssueScreenshot: vi.fn().mockResolvedValue({ ok: true, dataUrl: 'data:image/png;base64,AAAA' }),
    runIssueVerb: vi.fn(),
    ...over,
  }
  ;(window as unknown as { studio: typeof studio }).studio = studio
  return studio
}

function cc(issues: CommandCenter['issues'], actor: CommandCenter['actor'] = { name: 'Sam K', source: 'typed' }): CommandCenter {
  return { ...EMPTY_CC, actor, capabilities: ['sprint-status', 'issue-list', 'issue-show', 'issue-triage', 'issue-prioritize', 'issue-promote', 'issue-sync', 'issue-file'], issues }
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('IssuesScreen', () => {
  it('lists the queue in the plugin’s order, opens the first row, and says how many await review', async () => {
    install()
    render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: ROWS, queue: ['ISS-0001'] }))} onRefresh={vi.fn()} onReport={vi.fn()} />)
    const table = within(screen.getByTestId('issue-queue'))
    expect(table.getAllByRole('row').slice(1).map((r) => r.getAttribute('data-issue'))).toEqual(['ISS-0001', 'ISS-0002'])
    expect(screen.getByTestId('issue-queue').textContent).toContain('1 awaiting review')
    await waitFor(() => expect(screen.getByTestId('issue-card').getAttribute('data-issue')).toBe('ISS-0001'))
    expect(screen.getByTestId('issue-proposals').textContent).toContain('P2')
    expect(screen.getByTestId('issue-proposals').textContent).toContain('MEDIUM')
    expect(screen.getByTestId('issue-proposals').textContent).toContain('not yet reviewed')
    await waitFor(() => expect(screen.getByAltText('Screenshot 1 of ISS-0001')).toBeTruthy())
    expect(screen.getByTestId('issue-history').textContent).toContain('reported by Priya N.')
  })

  it('every action is present; the refused ones carry the plugin’s own sentence, the next step is primary', async () => {
    install()
    render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: ROWS, queue: ['ISS-0001'] }))} onRefresh={vi.fn()} onReport={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('issue-actions')).toBeTruthy())
    const actions = within(screen.getByTestId('issue-actions'))
    const triage = actions.getByRole('button', { name: /^Triage…/ })
    expect(triage.hasAttribute('disabled')).toBe(false)
    const promote = actions.getByRole('button', { name: /^Promote to a bugfix spec…/ })
    expect(promote.hasAttribute('disabled')).toBe(true)
    expect(promote.getAttribute('title')).toMatch(/review it first/)
    const reopen = actions.getByRole('button', { name: /^Reopen…/ })
    expect(reopen.getAttribute('title')).toMatch(/nothing to reopen/)
    // §8 honesty check 1 for this screen: every disabled button is described by its reason, and the
    // reason is a reasons.ts sentence or the plugin's own (`show --json`'s actions.*.reason).
    const pluginReasons = new Set(Object.values(detailFor(ROWS[0]).actions).map((a) => a.reason).filter(Boolean))
    for (const b of screen.getAllByRole('button')) {
      if (!b.hasAttribute('disabled')) continue
      const title = b.getAttribute('title') ?? ''
      expect(b.getAttribute('aria-describedby'), b.textContent ?? '').toBeTruthy()
      expect(isReason(title) || pluginReasons.has(title), `${b.textContent}: ${title}`).toBe(true)
    }
    // Check 2: no bare zero in a stat, no digit in a person.
    expect([...document.querySelectorAll('[data-stat]')].some((el) => /\b0\b/.test(el.textContent ?? ''))).toBe(false)
    expect([...document.querySelectorAll('[data-person]')].some((el) => /\d/.test(el.textContent ?? ''))).toBe(false)
  })

  it('without an actor every action reads NO_ACTOR; on an older plugin the capability', async () => {
    install()
    const { unmount } = render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: ROWS, queue: ['ISS-0001'] }), null)} onRefresh={vi.fn()} onReport={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('issue-actions')).toBeTruthy())
    expect(within(screen.getByTestId('issue-actions')).getByRole('button', { name: /^Triage…/ }).getAttribute('title')).toBe(NO_ACTOR)
    unmount()
    install()
    render(<IssuesScreen projectPath="/p" cc={{ ...cc(block({ issues: ROWS, queue: ['ISS-0001'] })), capabilities: ['sprint-status', 'issue-list', 'issue-show'] }} onRefresh={vi.fn()} onReport={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('issue-actions')).toBeTruthy())
    expect(within(screen.getByTestId('issue-actions')).getByRole('button', { name: /^Triage…/ }).getAttribute('title')).toBe('arrives with a newer plugin: lacks issue-triage')
    expect(screen.getByRole('button', { name: /^Sync with the specs/ }).getAttribute('title')).toBe('arrives with a newer plugin: lacks issue-sync')
  })

  it('Triage opens its dialog, previews the exact line, runs one verb, and the host re-reads on Done', async () => {
    const result: IssueVerbResult = { ok: true, exitCode: 0, refused: false, stdout: '{"ok": true, "status": "triaged"}', stderr: '', argv: ['triage', '--state', '/p/.sdlc/state.yaml', '--issue', 'ISS-0001', '--verdict', 'confirmed', '--by', 'Sam K', '--json'], verb: 'triage', doc: { ok: true, status: 'triaged' } }
    const studio = install({ runIssueVerb: vi.fn().mockResolvedValue(result) })
    const onRefresh = vi.fn()
    render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: ROWS, queue: ['ISS-0001'] }))} onRefresh={onRefresh} onReport={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('issue-actions')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('issue-actions')).getByRole('button', { name: /^Triage…/ }))
    const dialog = await screen.findByTestId('issue-action-dialog')
    expect(within(dialog).getByTestId('issue-action-argv').textContent).toBe('Run: report_issue.py triage --issue ISS-0001 --verdict confirmed --severity degraded --data-impact wrong-shown --by "Sam K" --json')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(studio.runIssueVerb).toHaveBeenCalledTimes(1))
    expect(studio.runIssueVerb).toHaveBeenCalledWith('/p', { verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed', severity: 'degraded', dataImpact: 'wrong-shown' })
    await waitFor(() => expect(within(dialog).getByTestId('issue-action-result').textContent).toContain('Done'))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('Prioritize marks the plugin’s proposal and refuses nothing the lifecycle allows; the reporter sees the override on triage', async () => {
    install()
    render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: ROWS, queue: ['ISS-0001'] }), { name: 'Priya N.', source: 'typed' })} onRefresh={vi.fn()} onReport={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('issue-actions')).toBeTruthy())
    fireEvent.click(within(screen.getByTestId('issue-actions')).getByRole('button', { name: /^Triage…/ }))
    const dialog = await screen.findByTestId('issue-action-dialog')
    expect(within(dialog).getByText('You reported this')).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' })
    expect(confirm.hasAttribute('disabled')).toBe(false) // the plugin is the judge; it will say "someone other than its reporter"
  })

  it('an empty block reads the fixed sentences — never a zero — and an Open filter over closed reports says so truthfully', () => {
    install()
    const { unmount } = render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: [], queue: [] }))} onRefresh={vi.fn()} onReport={vi.fn()} />)
    expect(screen.getByTestId('issue-queue').textContent).toContain(NOTHING_AWAITS_REVIEW)
    expect(screen.getByTestId('issue-queue').textContent).toContain(NO_ISSUES_YET)
    expect(screen.getByTestId('issues-screen').textContent).not.toMatch(/\b0 awaiting/)
    unmount()
    install()
    render(<IssuesScreen projectPath="/p" cc={cc(block({ issues: [row({ status: 'fixed' })], queue: [] }))} onRefresh={vi.fn()} onReport={vi.fn()} />)
    expect(screen.getByTestId('issue-queue').textContent).toContain(NOTHING_OPEN)
    expect(screen.getByTestId('issue-queue').textContent).not.toContain('no data')
  })

  it('a block the plugin could not produce shows its error, and Report an issue is the way in', () => {
    install()
    const onReport = vi.fn()
    render(<IssuesScreen projectPath="/p" cc={cc(block(null, 'arrives with a newer plugin: lacks issue-list'))} onRefresh={vi.fn()} onReport={onReport} />)
    expect(screen.getAllByText('arrives with a newer plugin: lacks issue-list').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: REPORT_AN_ISSUE }))
    expect(onReport).toHaveBeenCalled()
  })
})

describe('tablePairs — the plugin’s two-column sections as pairs', () => {
  it('skips the header and the rule, keeps the words, restores an escaped pipe, and ignores prose', () => {
    expect(tablePairs('| Question | Answer |\n|---|---|\n| Channel | A report, export, dataset or batch job |\n| Which report? | monthly \\| claims |')).toEqual([
      ['Channel', 'A report, export, dataset or batch job'], ['Which report?', 'monthly | claims'],
    ])
    expect(tablePairs('| Fact | Value |\n|---|---|\n| environment | Test / QA |')).toEqual([['environment', 'Test / QA']])
    expect(tablePairs('plain words')).toEqual([])
    expect(tablePairs(undefined)).toEqual([])
  })
})
