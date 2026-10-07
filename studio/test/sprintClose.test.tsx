// @vitest-environment jsdom
/** Sprint review / close (togo-command-center.md §3.5, §7 P6 acceptance): Outcomes in the
 * standard's numbers with "no data" never a 0; Kept = merged; every open spec has Carry / Drop
 * with a reason; the close argv has one `--carry` / `--drop` per decided spec and the button is
 * never greyed on the UI's own count; an exit-1 shows the plugin's text; exit 0 renders and opens
 * the review page; decisions decided through `decideDecision`; the lazy chunk resolves. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Board, CommandCenter, FindingsView, ProjectSettings, Scorecard, SourcedBlock, SprintLogView, SprintSlateRow, SprintView } from '../shared/types'
import { createSprintFirst, NO_ACTOR } from '../shared/reasons'
import { closeRequest } from '../src/components/CloseSprintDialog'
import { SprintClose, nextSprintId } from '../src/components/SprintClose'

const block = <T,>(data: T | null, source: string, error: string | null = null): SourcedBlock<T> => ({ source, fetchedAt: 'now', ok: data !== null, data, error })
const slateRow = (over: Partial<SprintSlateRow>): SprintSlateRow => ({
  id: '0003', name: 'three', risk: 'HIGH', type: '', channel: '', status: 'merged', sprint: 'S08', nextOwner: '', engReview: '', dataReview: '',
  dependsOn: [], dor: 'READY', dorBlocking: [], path: '', relPath: '', ...over,
})
const VIEW: SprintView = {
  ok: true,
  sprint: { id: 'S08', goal: 'Adjusters file without a phone call', start: '2026-10-05', end: '2026-10-16', state: 'ready', target: 3, mix: '', boardRef: '', readiedBy: '@sam-k', closedBy: '', created: '', path: '', relPath: '', days: { total: 10, elapsed: 9, remaining: 1 } },
  slate: [slateRow({ id: '0003' }), slateRow({ id: '0004', name: 'four', status: 'in-flight', risk: 'MEDIUM' }), slateRow({ id: '0005', name: 'five', status: 'ready', risk: 'LOW' })],
  readiness: { ready: 3, total: 3, gaps: [] }, verdictsPending: [], handoffsOpen: [], mix: {}, mixWarnings: [], wip: { inFlight: 1, cap: 4 },
  buildOrder: [], nextUp: null, dependencyGaps: [], decisions: null, carriedIn: [], hasData: true, note: null,
}
const CARD: Scorecard = {
  accepted_as_is_rate: 0.72, review_wait_median_hours: null, security_review_wait_median_hours: null, rework_revert_rate: 0, bounce_back_rate: null,
  escaped_bugs: [], dora: { deploy_count: 3, lead_time_median_hours: null, change_fail_rate: null, time_to_recover_median_hours: null }, totals: { merges: 4, reverts: 0, bounces: 0 },
}
function center(over: Partial<CommandCenter> = {}): CommandCenter {
  return {
    projectPath: '/p', fetchedAt: 'now', actor: { name: '@sam-k', source: 'roster' }, capabilities: ['sprint-status', 'sprint-write', 'sprint-list'],
    sprint: block(VIEW, 'sprint.py status --json'),
    sprints: block({ sprints: [{ id: 'S08', state: 'ready', goal: '', start: '', end: '', ordinal: 1 }, { id: 'S09', state: 'planning', goal: '', start: '', end: '', ordinal: 2 }], active: 'S08', count: 2 }, 'sprint.py list --json'),
    board: block<Board & { warnings: string[] }>(null, 'spec_status.py --all --json'),
    decisions: block({ total: 1, open: 1, overdue: 1, clockBusinessDays: 2, openDecisions: [{ id: 'DL-03', decision: 'Fail open or closed?', owner: '@sam-k', opened: '2026-10-01', due: '2026-10-03', status: 'open', businessDaysOpen: 3, clockDue: '2026-10-03', overdue: true }], overdueDecisions: [], logPath: '.sdlc/decision-log.md', exists: true }, 'track_decisions.py --json'),
    findings: block<FindingsView>(null, 'record_findings.py report --json'), scorecard: block(CARD, 'scorecard.py report --json'), roster: block<ProjectSettings['roster']>(null, 'project_settings.py --json'),
    log: block<SprintLogView>(null, 'sprint.py log --json'), needsYou: [], needsYouReason: null, sinceYesterday: [], since: 1, ...over,
  }
}
function install(c: CommandCenter = center(), over: Record<string, unknown> = {}) {
  const studio = {
    getCommandCenter: vi.fn().mockResolvedValue(c),
    runSprintVerb: vi.fn().mockResolvedValue({ ok: true, exitCode: 0, refused: false, stdout: 'Closed S08: 1 kept, 2 open (1 carried, 1 dropped)', stderr: '', argv: ['close'], verb: 'close' }),
    renderSprintReport: vi.fn().mockResolvedValue({ ok: true, relOutput: '.sdlc/reports/sprint-S08-review.html' }),
    openReport: vi.fn().mockResolvedValue({ ok: true }),
    decideDecision: vi.fn().mockResolvedValue({ ok: true, id: 'DL-03', status: 'decided', decided: '2026-10-06', by: '@sam-k' }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}
afterEach(() => { cleanup(); document.getElementById('overlays')?.remove(); delete (window as { studio?: unknown }).studio })

async function renderClose(props: Partial<Parameters<typeof SprintClose>[0]> = {}) {
  render(<main><SprintClose projectPath="/p" {...props}><p data-testid="beneath">feature complete</p></SprintClose></main>)
  await screen.findByTestId('close-outcomes')
}

describe('SprintClose', () => {
  it('Outcomes are the scorecard\'s fields — a number where there is one, the words "no data" where there is none, never a 0 for null; 0 the plugin reported stays 0', async () => {
    install(); await renderClose()
    const outcomes = screen.getByTestId('close-outcomes')
    expect(outcomes.querySelector('[data-outcome="accepted_as_is_rate"] [data-stat]')?.textContent).toBe('72%')
    expect(outcomes.querySelector('[data-outcome="review_wait_median_hours"] [data-no-data]')?.textContent).toBe('no data')
    expect(outcomes.querySelector('[data-outcome="rework_revert_rate"] [data-stat]')?.textContent).toBe('0%')
    // A measured 0 % names its base — the plugin's own `totals.merges` — so it cannot be read as no data.
    expect(outcomes.querySelector('[data-outcome="rework_revert_rate"] [data-denominator="totals.merges"]')?.textContent).toBe('of 4 merged')
    expect(outcomes.querySelector('[data-outcome="review_wait_median_hours"] [data-denominator]')).toBeNull()
    expect(outcomes.querySelector('[data-outcome="dora.deploy_count"] [data-stat]')?.textContent).toBe('3')
    // The state chip is the one sprint-state chip: `ready` is "now", never green.
    expect(screen.getByTestId('sprint-state').className).toContain('stage-current')
    expect(screen.getByTestId('sprint-state').className).not.toContain('status-ok')
    expect(outcomes.textContent).toContain('scorecard.py report --json')
    expect(screen.getByTestId('beneath')).toBeTruthy()
  })

  it('Kept = merged; every open spec offers Carry / Drop with a reason; picking Carry shows the row\'s Carry-to picker over the non-closed later sprint', async () => {
    install(); await renderClose()
    expect(within(screen.getByTestId('close-kept')).getAllByRole('listitem').map((li) => li.getAttribute('data-spec'))).toEqual(['0003'])
    expect(screen.getByTestId('close-kept').querySelector('[data-testid="close-row"][data-spec="0003"]')?.hasAttribute('data-kept')).toBe(true)
    const open = screen.getByTestId('close-open')
    expect(Array.from(open.querySelectorAll('li[data-spec]')).map((li) => li.getAttribute('data-spec'))).toEqual(['0004', '0005'])
    // The picker lives on the row (plan §3.5), once Carry is picked; one `--carry-to` for every carry.
    expect(within(open).queryByLabelText('Carry to')).toBeNull()
    fireEvent.click(within(open).getByRole('group', { name: 'Decision for 0004' }).querySelector('button[aria-pressed]')!) // Carry
    const carryTo = within(open).getByLabelText('Carry to') as HTMLSelectElement
    expect(Array.from(carryTo.options).map((o) => o.value)).toEqual(['', 'S09'])
    expect(within(open).getByLabelText('Reason for carrying 0004')).toBeTruthy()
    expect(open.textContent).toContain('one target for every carried spec')
  })

  it('the close argv has one --carry / --drop per decided spec; an undecided spec is named for the plugin to refuse; exit 0 renders and opens the review page', async () => {
    const studio = install(); await renderClose()
    const open = screen.getByTestId('close-open')
    const first = within(open).getByRole('group', { name: 'Decision for 0004' })
    fireEvent.click(within(first).getByRole('button', { name: /^Carry$/ }))
    expect(first.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Carry')
    fireEvent.change(within(open).getByLabelText('Carry to'), { target: { value: 'S09' } })
    fireEvent.change(within(open).getByLabelText('Reason for carrying 0004'), { target: { value: 'blocked on DL-03' } })
    // 0005 stays undecided on purpose: the button is NOT greyed; the dialog names it.
    fireEvent.click(screen.getByRole('button', { name: 'Close the sprint' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('close-argv').textContent).toBe('Run: sprint.py close --sprint S08 --carry-to S09 --carry "0004=blocked on DL-03" --by @sam-k')
    expect(within(dialog).getByText(/Still undecided/)).toBeTruthy()
    expect(within(dialog).getByText('0005')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Confirm — close the sprint/ }))
    await waitFor(() => expect(studio.runSprintVerb).toHaveBeenCalledWith('/p', { verb: 'close', sprint: 'S08', carryTo: 'S09', carry: { '0004': 'blocked on DL-03' }, drop: {} }))
    expect(await within(dialog).findByText('Done')).toBeTruthy()
    expect(within(dialog).getByText(/Closed S08: 1 kept/)).toBeTruthy()
    await waitFor(() => expect(studio.renderSprintReport).toHaveBeenCalledWith('/p', 'S08', 'review'))
    await waitFor(() => expect(studio.openReport).toHaveBeenCalledWith('/p', '.sdlc/reports/sprint-S08-review.html'))
    expect((await within(dialog).findByTestId('review-written')).textContent).toContain('sprint-S08-review.html')
    await waitFor(() => expect(studio.getCommandCenter).toHaveBeenCalledTimes(2))
  })

  it('an exit 1 shows the plugin\'s text under "Not done" and renders no review page', async () => {
    const studio = install(center(), { runSprintVerb: vi.fn().mockResolvedValue({ ok: false, exitCode: 1, refused: false, stdout: '', stderr: 'Cannot close S08: 0004, 0005 are neither carried nor dropped', argv: ['close'], verb: 'close' }) })
    await renderClose()
    fireEvent.click(screen.getByRole('button', { name: 'Close the sprint' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Confirm — close the sprint/ }))
    expect(await within(dialog).findByText('Not done')).toBeTruthy()
    expect(within(dialog).getByText(/0004, 0005 are neither carried nor dropped/)).toBeTruthy()
    expect(studio.renderSprintReport).not.toHaveBeenCalled()
  })

  it('a decision is decided through decideDecision with the typed resolution; overdue wears the plugin\'s flag', async () => {
    const studio = install(); await renderClose()
    const row = screen.getByTestId('close-decisions').querySelector('[data-decision="DL-03"]')!
    expect(row.hasAttribute('data-overdue')).toBe(true)
    fireEvent.change(within(row as HTMLElement).getByLabelText('Resolution for DL-03'), { target: { value: 'Fail closed' } })
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /^Decide/ }))
    await waitFor(() => expect(studio.decideDecision).toHaveBeenCalledWith('/p', 'DL-03', 'Fail closed'))
    expect((await screen.findByText(/decided 2026-10-06 by @sam-k/)).textContent).toBeTruthy()
  })

  it('no later sprint → "create S09 first →"; no actor → Close disabled with NO_ACTOR; the pure builder and the lazy chunk', async () => {
    const onNewSprint = vi.fn()
    install(center({ sprints: block({ sprints: [{ id: 'S08', state: 'ready', goal: '', start: '', end: '', ordinal: 1 }], active: 'S08', count: 1 }, 'sprint.py list --json') }))
    await renderClose({ onNewSprint })
    const open = screen.getByTestId('close-open')
    fireEvent.click(within(within(open).getByRole('group', { name: 'Decision for 0004' })).getByRole('button', { name: /^Carry$/ }))
    fireEvent.click(screen.getByRole('button', { name: createSprintFirst('S09') }))
    expect(onNewSprint).toHaveBeenCalledWith('S09')
    cleanup()
    install(center({ actor: null })); await renderClose()
    const close = screen.getByRole('button', { name: /^Close the sprint/ }) as HTMLButtonElement
    expect(close.disabled).toBe(true)
    expect(close.getAttribute('title')).toBe(NO_ACTOR)
    expect(nextSprintId('S08')).toBe('S09'); expect(nextSprintId('S99')).toBe('S100')
    expect(closeRequest('S08', 'S09', { '0004': { kind: 'carry', reason: 'r' }, '0005': { kind: 'drop', reason: 'd' }, '0006': { kind: null, reason: '' } }))
      .toEqual({ verb: 'close', sprint: 'S08', carryTo: 'S09', carry: { '0004': 'r' }, drop: { '0005': 'd' } })
    expect(closeRequest('S08', null, { '0005': { kind: 'drop', reason: 'd' } })).toEqual({ verb: 'close', sprint: 'S08', carry: {}, drop: { '0005': 'd' } })
    const mod = await import('../src/components/SprintClose')
    expect(mod.default).toBe(mod.SprintClose)
  })

  /** v12 critique: the close screen reads in steering mode's voice — the same two labelled rows
   * (Outcomes, then Delivery with the escaped bugs), the field on its own mono line, a grid that
   * measures the screen rather than the window, and "none recorded" as words, never a 0. */
  it('Outcomes are drawn as the two labelled rows steering draws — Outcomes, then Delivery with the escaped bugs — with no number the plugin did not report', async () => {
    install(); await renderClose()
    const outcomes = screen.getByTestId('close-outcomes')
    expect(outcomes.className).toContain('@container')
    // v13 fixer round: the provenance is a line a person can type — mono, lower-case, never the
    // eyebrow's caps ("SCORECARD.PY REPORT --JSON" / "TRACK_DECISIONS.PY --JSON" in the shots).
    for (const src of document.querySelectorAll('[data-source]')) {
      expect(src.className).toContain('font-mono')
      expect(src.className).toContain('normal-case')
      expect(src.className).toContain('tracking-normal')
      expect(src.closest('h3')).not.toBeNull()
    }
    expect(document.querySelectorAll('[data-source]')).toHaveLength(2)
    expect(outcomes.querySelector('[data-source]')?.textContent).toBe('scorecard.py report --json')
    expect(screen.getByTestId('close-decisions').querySelector('[data-source]')?.textContent).toBe('track_decisions.py --json')
    const groups = Array.from(outcomes.querySelectorAll('[data-outcome-group]')).map((g) => g.getAttribute('data-outcome-group'))
    expect(groups).toEqual(['outcomes', 'delivery'])
    expect(outcomes.querySelector('[data-outcome-group="outcomes"] [data-outcome="accepted_as_is_rate"]')).toBeTruthy()
    expect(outcomes.querySelector('[data-outcome-group="delivery"] [data-outcome="dora.deploy_count"]')).toBeTruthy()
    expect(outcomes.querySelector('[data-outcome-group="outcomes"] [data-outcome^="dora."]')).toBeNull()
    // v13: the field name breaks at its own `_` / `.` seams (a `<wbr>` after each), never mid-word —
    // the review shot showed `security_review_wait_media / n_hours`; its text is still the field exactly.
    const field = outcomes.querySelector('[data-outcome="review_wait_median_hours"] [data-field-name]')!
    expect(field.textContent).toBe('review_wait_median_hours')
    expect(field.querySelectorAll('wbr')).toHaveLength(3)
    expect(field.className).toContain('[overflow-wrap:anywhere]')
    for (const grid of outcomes.querySelectorAll('[data-outcome-group] ul')) expect(grid.className).toContain('@min-[960px]:grid-cols-5')
    const bugs = outcomes.querySelector('[data-outcome-group="delivery"] [data-outcome="escaped_bugs[]"]') as HTMLElement
    expect(bugs.textContent).toContain('none recorded in this window')
    expect(bugs.querySelector('[data-stat]')).toBeNull()
    expect(bugs.textContent).not.toMatch(/\b0\b/)
    // Every tile still names its field, and the stat count is the fixture's three non-null numbers
    // (accepted, rework, deployments) — the regrouping adds none.
    for (const tile of outcomes.querySelectorAll('[data-outcome]')) expect(tile.textContent).toContain(tile.getAttribute('data-outcome')!)
    expect(outcomes.querySelectorAll('[data-stat]')).toHaveLength(3)
  })
})
