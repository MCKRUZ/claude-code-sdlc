// @vitest-environment jsdom
/** The planning screen (togo-command-center.md §3.2, §7 P6 acceptance): "Add to slate" enabled for
 * drafts, the slate in the plugin's build order with "order not given" after, the HIGH line
 * verbatim, the proposal applied as one `slate`, Commit stopping at the first non-zero exit and
 * showing each, every disabled control with its reason, and the lazy chunk resolving. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardRow, CommandCenter, ReadinessAll, SlateProposal, SourcedBlock, SprintSlateRow, SprintVerbResult, SprintView } from '../shared/types'
import { NO_ACTOR, ORDER_ARRIVES_ON_COMMIT, ORDER_NOT_GIVEN, REASONED_SLATE, SECURITY_SIGNER, newerPlugin } from '../shared/reasons'
import { Planning } from '../src/components/planning/Planning'
import { groupGaps } from '../src/components/planning/PluginSaysColumn'
import { COMPACT_SELECT_CLASS, COMPACT_SLOT_CLASS } from '../src/components/planning/RolePicker'
import { SLATE_INLINE_PX, SLATE_LINE_CLASS, SLATE_NAME_TRACK, SLATE_PICKER_SLOT_CLASS, SLATE_PICKERS_CLASS } from '../src/components/planning/SlateColumn'
import { COMMIT_CONFIRM, commitPreview } from '../src/components/planning/CommitDialog'

const block = <T,>(data: T | null, source: string, error: string | null = null): SourcedBlock<T> => ({ source, fetchedAt: '2026-10-06T10:00:00Z', ok: data !== null, data, error })
const row = (over: Partial<BoardRow>): BoardRow => ({
  spec: '0001', name: 'a', path: `specs/${over.spec ?? '0001'}-a.md`, title: 'A', status: 'draft', risk: 'LOW', team: 'core', channel: '', owner: '@sam-k',
  developer: '', checker: '', branch: '', sprint: '', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null, ...over,
})
const specIds = (list: HTMLElement) => Array.from(list.querySelectorAll(':scope > li')).map((li) => li.getAttribute('data-spec'))
const slateRow = (over: Partial<SprintSlateRow>): SprintSlateRow => ({
  id: '0003', name: 'three', risk: 'HIGH', type: '', channel: '', status: 'ready', sprint: 'S08', nextOwner: '', engReview: '', dataReview: '',
  dependsOn: [], dor: 'READY', dorBlocking: [], path: '/p/specs/0003-three.md', relPath: 'specs/0003-three.md', ...over,
})
const VIEW: SprintView = {
  ok: true,
  sprint: { id: 'S08', goal: 'Adjusters file without a phone call', start: '2026-10-05', end: '2026-10-16', state: 'planning', target: 3, mix: 'HIGH:1,MEDIUM:2', boardRef: '', readiedBy: '', closedBy: '', created: '', path: '', relPath: '', days: { total: 10, elapsed: 1, remaining: 9 } },
  slate: [slateRow({ id: '0003' }), slateRow({ id: '0004', name: 'four', risk: 'MEDIUM' }), slateRow({ id: '0005', name: 'five', risk: 'LOW', dor: 'NOT READY', dorBlocking: ['## Scope Out: missing'] })],
  readiness: { ready: 2, total: 3, gaps: [{ spec: '0005', gaps: ['DoR NOT READY'] }] }, verdictsPending: [], handoffsOpen: [],
  mix: { HIGH: { target: 1, actual: 1 }, MEDIUM: { target: 2, actual: 1 } }, mixWarnings: ['MEDIUM: 1 slated of 2 targeted'], wip: { inFlight: 0, cap: 4 },
  buildOrder: ['0004', '0003'], nextUp: '0004', dependencyGaps: [], decisions: null, carriedIn: [{ spec: '0003', fromSprint: 'S07', reason: 'blocked on the vendor API' }], hasData: true, note: null,
}
const BOARD: BoardRow[] = [
  row({ spec: '0001', status: 'draft', title: 'Draft one' }),
  row({ spec: '0002', status: 'ready', title: 'Ready two', risk: 'MEDIUM', dependsOn: ['0001'] }),
  row({ spec: '0003', status: 'ready', sprint: 'S08', title: 'Three', risk: 'HIGH', developer: '@lee-w', checker: '@lee-w' }),
  row({ spec: '0004', status: 'ready', sprint: 'S08', title: 'Four', risk: 'MEDIUM' }),
  row({ spec: '0005', status: 'draft', sprint: 'S08', title: 'Five' }),
  row({ spec: '0006', status: 'merged', title: 'Merged' }),
]
const READINESS: ReadinessAll = {
  ok: true,
  specs: [
    { ok: true, spec: '0001', risk: 'LOW', status: 'draft', ready: true, blocking: [], advisory: [], passed: [] },
    { ok: true, spec: '0002', risk: 'MEDIUM', status: 'ready', ready: false, blocking: [{ check: 'scope-out', passed: false, severity: 'MUST', message: '## Scope Out: missing' }], advisory: [], passed: [] },
    { ok: true, spec: '0003', risk: 'HIGH', status: 'ready', ready: true, blocking: [], advisory: [], passed: [], ladder: { tier: 'HIGH', touchesGatedPath: null, rungs: ['CI (lint, unit, contract) — blocks', 'security pass — blocks', 'named human sign-off in the PR'] } },
  ],
}
const PROPOSAL: SlateProposal = {
  sprint: 'S08', target: 3, mix: 'HIGH:1,MEDIUM:2', alreadySlated: ['0003', '0004', '0005'], candidates: 2,
  proposal: [slateRow({ id: '0002', name: 'b', risk: 'MEDIUM', status: 'ready', sprint: '' })], mixAfter: {}, mixWarnings: [], dependencyWarnings: [], hasData: true, note: null,
}
function center(over: Partial<CommandCenter> = {}): CommandCenter {
  return {
    projectPath: '/p', fetchedAt: '2026-10-06T10:00:00Z', actor: { name: '@sam-k', source: 'roster' },
    capabilities: ['sprint-status', 'sprint-write', 'sprint-list', 'readiness-all', 'confirm-tier', 'assign-roles', 'sprint-edit'],
    sprint: block(VIEW, 'sprint.py status --json'),
    sprints: block({ sprints: [{ id: 'S07', state: 'closed', goal: '', start: '', end: '', ordinal: 1 }, { id: 'S08', state: 'planning', goal: '', start: '', end: '', ordinal: 2 }], active: 'S08', count: 2 }, 'sprint.py list --json'),
    board: block({ rows: BOARD, codeHostAvailable: false, error: null, teamLimits: null, warnings: [] }, 'spec_status.py --all --json'),
    decisions: block(null, 'track_decisions.py --json', 'no decision-log'), findings: block(null, 'record_findings.py report --json'), scorecard: block(null, 'scorecard.py report --json'),
    roster: block({ file: '.sdlc/team.yaml', present: true, errors: [], teams: [], people: [{ handle: '@sam-k', name: 'Sam K', roles: ['owner', 'developer'] }, { handle: '@lee-w', name: 'Lee W', roles: ['developer', 'checker'] }, { handle: '@priya-n', name: 'Priya N', roles: ['checker', 'security'] }] }, 'project_settings.py --json'),
    log: block(null, 'sprint.py log --json'), needsYou: [], needsYouReason: null, sinceYesterday: [], since: 1, ...over,
  }
}
const done = (verb: SprintVerbResult['verb'], exitCode = 0, stdout = 'ok', stderr = ''): SprintVerbResult => ({ ok: exitCode === 0, exitCode, refused: exitCode === 2, stdout, stderr, argv: [verb], verb })

function install(c: CommandCenter = center(), over: Record<string, unknown> = {}) {
  const studio = {
    getCommandCenter: vi.fn().mockResolvedValue(c),
    getReadinessAll: vi.fn().mockResolvedValue(READINESS),
    getSlateProposal: vi.fn().mockResolvedValue(PROPOSAL),
    getSprintStatus: vi.fn().mockResolvedValue({ ...VIEW, mix: { HIGH: { target: 1, actual: 2 } } }),
    runSprintVerb: vi.fn().mockResolvedValue(done('slate')),
    assignRoles: vi.fn().mockResolvedValue({ ok: true, changed: true, message: 'checker set' }),
    confirmTier: vi.fn().mockResolvedValue({ ok: true, changed: true, message: 'confirmed by @sam-k' }),
    renderSprintReport: vi.fn().mockResolvedValue({ ok: true, relOutput: '.sdlc/reports/sprint-S08-planning.html' }),
    openReport: vi.fn().mockResolvedValue({ ok: true }),
    openDecision: vi.fn(),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}
afterEach(() => { cleanup(); delete (window as { studio?: unknown }).studio })

async function renderPlanning(props: Partial<Parameters<typeof Planning>[0]> = {}) {
  const onOpenSpec = vi.fn()
  render(<main><Planning projectPath="/p" onOpenSpec={onOpenSpec} {...props} /></main>)
  await screen.findByTestId('planning-header')
  return { onOpenSpec }
}

describe('Planning: three columns, the plugin\'s order, the plugin\'s words', () => {
  it('orders the backlog READY first and enables "Add to slate" on a draft; the click is one slate request and exit 0 re-reads', async () => {
    const studio = install()
    await renderPlanning()
    const backlog = within(screen.getByTestId('planning-backlog'))
    expect(specIds(screen.getByTestId('planning-backlog').querySelector(':scope > ul')!)).toEqual(['0001', '0002']) // 0001 is a READY draft; 0002 is a NOT READY ready spec
    expect(backlog.getByText(/## Scope Out: missing/)).toBeTruthy()
    const add = backlog.getAllByRole('button', { name: /^Add to slate/ })[0] as HTMLButtonElement
    expect(add.disabled).toBe(false)
    expect(add.hasAttribute('data-write')).toBe(true)
    fireEvent.click(add)
    await waitFor(() => expect(studio.runSprintVerb).toHaveBeenCalledWith('/p', { verb: 'slate', sprint: 'S08', specs: ['0001'] }))
    await waitFor(() => expect(studio.getCommandCenter).toHaveBeenCalledTimes(2))
    expect((await screen.findByText('Done')).closest('[data-verb-result]')).toBeTruthy()
  })

  it('the slate follows build_order with "order not given" after; the HIGH line is verbatim; the signer slot is disabled with its reason', async () => {
    install()
    await renderPlanning()
    const slate = screen.getByTestId('planning-slate')
    expect(specIds(within(slate).getByRole('list', { name: 'Slate in build order' }))).toEqual(['0004', '0003'])
    expect(specIds(within(slate).getByRole('list', { name: ORDER_NOT_GIVEN }))).toEqual(['0005'])
    expect(within(slate).getByText('“security pass — blocks”')).toBeTruthy()
    expect(within(slate).getByText('“named human sign-off in the PR”')).toBeTruthy()
    const signer = within(slate).getByLabelText('Security signer for 0003') as HTMLSelectElement
    expect(signer.disabled).toBe(true)
    expect(signer.getAttribute('title')).toBe(SECURITY_SIGNER)
    // Checker == builder on 0003: a note, never a disabled picker.
    expect(within(slate).getByText(/same person as the builder/)).toBeTruthy()
    expect((within(slate).getByLabelText('Checker for 0003') as HTMLSelectElement).disabled).toBe(false)
    // The meter is bars and numbers, last sprint beside: 3 tiers never a chart.
    const meter = within(screen.getByTestId('mix-meter'))
    expect(meter.getByText(/last sprint S07/)).toBeTruthy()
    expect(Array.from(screen.getByTestId('mix-meter').querySelectorAll('[data-mix-tier]')).map((li) => li.getAttribute('data-mix-tier'))).toEqual(['HIGH', 'MEDIUM'])
    // v13 fixer round: the mix gap is the SAME warn-tone chip the sprint header wears — one fact,
    // one meaning on every screen — never red text under the bars.
    const warning = meter.getByText('MEDIUM: 1 slated of 2 targeted')
    const chip = warning.closest('[data-mix-warning]') as HTMLElement
    expect(chip).not.toBeNull()
    expect(chip.className).toMatch(/warn/)
    expect(chip.className).not.toMatch(/error/)
    expect(screen.getByTestId('mix-meter').querySelectorAll('p.text-status-warn-ink, p.text-status-error-ink')).toHaveLength(0)
    expect(screen.getByTestId('carried-in').textContent).toContain('blocked on the vendor API')
    expect(slate.querySelectorAll('[data-person]')).not.toHaveLength(0)
    for (const el of slate.querySelectorAll('[data-person]')) expect(el.textContent).not.toMatch(/\d/)
  })

  it('a role change goes through assignRoles with the spec path and re-reads on ok', async () => {
    const studio = install()
    await renderPlanning()
    fireEvent.change(screen.getByLabelText('Checker for 0004'), { target: { value: '@priya-n' } })
    await waitFor(() => expect(studio.assignRoles).toHaveBeenCalledWith('/p', 'specs/0004-a.md', { checker: '@priya-n' }))
    await waitFor(() => expect(studio.getCommandCenter).toHaveBeenCalledTimes(2))
  })

  // Re-recorded (v13 integration): this asserted the union `['0003','0004','0005','0002']`. The
  // plugin's own rule says otherwise — `sprint.py slate` is additive and raises Illegal (exit 1)
  // for a merged spec even when it already sits in the sprint (sprint.py `cmd_slate`: "spec NNNN
  // is merged — slating delivered work is not a commitment"), so the union made the verb Not done
  // as soon as one slated spec had merged (cockpit.spec "Apply proposal", live refusal). Apply
  // sends the proposal alone.
  it('"The plugin proposes" lists the id-order fill and Apply sends ONE slate with the proposal alone; the reasoned slate is disabled with its reason', async () => {
    const studio = install()
    await renderPlanning()
    const says = within(screen.getByTestId('planning-plugin-says'))
    expect(says.getByRole('list', { name: 'Proposed slate' }).querySelector('[data-proposed="0002"]')).toBeTruthy()
    fireEvent.click(says.getByRole('button', { name: 'Apply proposal' }))
    await waitFor(() => expect(studio.runSprintVerb).toHaveBeenCalledWith('/p', { verb: 'slate', sprint: 'S08', specs: ['0002'] }))
    const reasoned = says.getByRole('button', { name: /Claude proposes a reasoned slate/ }) as HTMLButtonElement
    expect(reasoned.disabled).toBe(true)
    expect(reasoned.getAttribute('title')).toBe(REASONED_SLATE)
    expect(says.getByText(/DoR NOT READY/)).toBeTruthy()
    // The column's purpose leads: the proposal and Commit sit above the plugin's gap lines.
    const blocks = Array.from(screen.getByTestId('planning-plugin-says').querySelectorAll('[data-block]')).map((b) => b.getAttribute('data-block'))
    expect(blocks.slice(0, 2)).toEqual(['The plugin proposes', 'Commit the sprint'])
    // DoR gaps are grouped by the verbatim line with the ids beneath — one sentence, never one per spec.
    const grouped = screen.getByTestId('dor-gaps-grouped')
    expect(grouped.querySelectorAll('[data-gap-line]')).toHaveLength(1)
    expect(grouped.querySelector('[data-gap-spec="0005"]')).toBeTruthy()
  })

  it('groupGaps lists each distinct gap line once with the ids that carry it, in first-seen order', () => {
    const line = 'Scope > In scope is empty — a spec needs at least one In-scope item'
    expect(groupGaps([{ spec: '0001', gaps: [line, 'Unfilled template placeholder present'] }, { spec: '0003', gaps: [line] }, { spec: '0004', gaps: [line] }]))
      .toEqual([{ line, specs: ['0001', '0003', '0004'] }, { line: 'Unfilled template placeholder present', specs: ['0001'] }])
    expect(groupGaps([])).toEqual([])
  })

  it('a slate row is one line — numeral, id + name, chips, the two pickers — with the rest behind a disclosure on the row', async () => {
    install()
    await renderPlanning()
    const slate = screen.getByTestId('planning-slate')
    const row = slate.querySelector('li[data-spec="0003"]')!
    expect(row.querySelector('[data-slate-line]')).toBeTruthy()
    expect(within(row as HTMLElement).getByLabelText('Builder for 0003')).toBeTruthy()
    const more = row.querySelector('[data-testid="slate-row-more"]') as HTMLDetailsElement
    expect(more.open).toBe(false)
    expect(within(more).getByLabelText('Security signer for 0003')).toBeTruthy()
    expect(within(more).getByRole('button', { name: /^Remove from slate/ })).toBeTruthy()
    // The row's DoR chip is the one tone map: READY is "now", never green.
    const dor = within(row.querySelector('[data-slate-line]') as HTMLElement).getByText('READY')
    expect(dor.className).toContain('stage-current')
    expect(dor.className).not.toContain('status-ok')
  })

  it('Commit runs ready (the set is unchanged) and stops at its exit 1, showing the gaps verbatim; plan never runs', async () => {
    const studio = install(center(), { runSprintVerb: vi.fn().mockResolvedValue(done('ready', 1, '', 'S08 is not ready:\n  0005: DoR NOT READY')) })
    await renderPlanning()
    fireEvent.click(screen.getByRole('button', { name: 'Commit the sprint' }))
    // The column's button opens the dialog; nothing runs until its Confirm (§3.6).
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('commit-preview').textContent).toContain('Run: sprint.py ready --sprint S08 --by @sam-k')
    expect(studio.runSprintVerb).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: COMMIT_CONFIRM }))
    await waitFor(() => expect(within(dialog).getAllByTestId('commit-step')).toHaveLength(1))
    const step = within(dialog).getByTestId('commit-step')
    expect(step.getAttribute('data-step')).toBe('ready')
    expect(step.getAttribute('data-exit-code')).toBe('1')
    expect(step.textContent).toContain('Not done')
    expect(step.textContent).toContain('0005: DoR NOT READY')
    expect(studio.renderSprintReport).not.toHaveBeenCalled()
  })

  it('with no actor every write is disabled with NO_ACTOR; without sprint-write the capability is named', async () => {
    install(center({ actor: null }))
    await renderPlanning()
    const add = screen.getAllByRole('button', { name: /^Add to slate/ })[0] as HTMLButtonElement
    expect(add.disabled).toBe(true)
    expect(add.getAttribute('title')).toBe(NO_ACTOR)
    cleanup()
    install(center({ capabilities: ['sprint-status'] }))
    await renderPlanning()
    const commit = screen.getByRole('button', { name: /^Commit the sprint/ }) as HTMLButtonElement
    expect(commit.disabled).toBe(true)
    expect(commit.getAttribute('title')).toBe(newerPlugin('sprint-write'))
    const confirm = screen.getAllByRole('button', { name: /^Confirm tier/ })[0] as HTMLButtonElement
    expect(confirm.getAttribute('title')).toBe(newerPlugin('confirm-tier'))
    expect((screen.getByLabelText('Checker for 0004') as HTMLSelectElement).getAttribute('title')).toBe(newerPlugin('assign-roles'))
  })

  it('no sprint → the plugin\'s own note beside the figure, and New sprint only when the host can open the dialog', async () => {
    const noSprint = { ...VIEW, sprint: null, slate: [], hasData: false, note: 'No sprint record under .sdlc/sprints/.' }
    install(center({ sprint: block(noSprint, 'sprint.py status --json') }))
    const onNewSprint = vi.fn()
    render(<main><Planning projectPath="/p" onOpenSpec={vi.fn()} onNewSprint={onNewSprint} /></main>)
    expect(await screen.findByText('No sprint record under .sdlc/sprints/.')).toBeTruthy()
    expect(document.querySelector('[data-cc-figure="no-sprint"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New sprint' }))
    expect(onNewSprint).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('planning-header')).toBeNull()
  })

  it('the Proposal surface captions "order arrives when the slate is committed"; "refine in place →" opens the spec', async () => {
    install()
    const { onOpenSpec } = await renderPlanning()
    fireEvent.click(screen.getByRole('button', { name: 'Proposal' }))
    expect(screen.getByTestId('proposal-caption').textContent).toBe(ORDER_ARRIVES_ON_COMMIT)
    fireEvent.click(within(screen.getByTestId('planning-backlog')).getAllByRole('button', { name: /refine in place/ })[0])
    expect(onOpenSpec).toHaveBeenCalledWith(expect.objectContaining({ spec: '0001' }))
  })

  it('"Apply proposal" goes through the host\'s VerbDialog when given onIntent: one slate intent, nothing spawned here', async () => {
    const studio = install()
    const onIntent = vi.fn()
    render(<main><Planning projectPath="/p" onOpenSpec={vi.fn()} onIntent={onIntent} /></main>)
    await screen.findByTestId('planning-header')
    fireEvent.click(within(screen.getByTestId('planning-plugin-says')).getByRole('button', { name: 'Apply proposal' }))
    // The proposal alone (see the re-record note on the Apply test above).
    expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({ intent: { kind: 'sprint', request: { verb: 'slate', sprint: 'S08', specs: ['0002'] } } }))
    expect(studio.runSprintVerb).not.toHaveBeenCalled()
  })

  it('the commit preview is the exact sequence: a slate line only when the set changed, then ready, plan, the report, the tier step', () => {
    const same = commitPreview({ sprintId: 'S08', slated: ['0003'], specs: ['0003'], confirmTierAvailable: false }, '@sam-k')
    expect(same[0]).toBe('Run: sprint.py ready --sprint S08 --by @sam-k')
    expect(same).toHaveLength(4)
    expect(same[3]).toContain('tier confirmation')
    const changed = commitPreview({ sprintId: 'S08', slated: ['0003'], specs: ['0003', '0004'], confirmTierAvailable: true }, '@sam-k')
    expect(changed[0]).toBe('Run: sprint.py slate --sprint S08 --spec 0003 --spec 0004 --by @sam-k')
    expect(changed).toHaveLength(5)
  })

  it('the lazy chunk resolves to the screen', async () => {
    const mod = await import('../src/components/planning/Planning')
    expect(mod.default).toBe(mod.Planning)
  })

  /** v12 critique #2: the slate rows had lost their id + name (two intrinsic-width pickers in an
   * `auto` track collapsed the `1fr` name track to 0 and overflowed the column), and "The plugin
   * proposes" truncated ids and names. The slate must name what is slated on every row.
   * v13 fixer round (re-opened at ≥ 1600 px: "0001 dupl / icate- / claim-409"): the name track has
   * a 12 rem FLOOR, the name wraps at word seams only (`break-word`, never `anywhere`, which lets a
   * grid shrink a word to one letter per line), the pickers are a fixed 11 rem each INLINE, and
   * they join the line only from 820 px of column width — the arithmetic of those parts.
   * v14 (planning shot at 1440: "Sam Kowalski (@sam-k" cut with no cue): on their own line the two
   * pickers share the row as `minmax(0,1fr)` each, ≥ 10 rem, and a long value ellipsises with the
   * full text in the select's title. */
  it('every slate row names its spec — the name track has a 12 rem floor, wraps at word seams only, with the pickers sharing their own line (ellipsising, titled) under 820 px of column width and fixed at 11 rem inline', async () => {
    install()
    await renderPlanning()
    const slate = screen.getByTestId('planning-slate')
    // The column is the container the row measures against.
    expect(slate.className).toContain('@container')
    // The threshold holds the parts: numeral 2 rem + name floor 12 rem + chips ≈ 140 + two 11 rem
    // pickers + three 12 px gaps — anything narrower puts the pickers under the name.
    const rem = 16
    expect(SLATE_INLINE_PX).toBeGreaterThanOrEqual(2 * rem + 12 * rem + 140 + 2 * 11 * rem + 3 * 12)
    expect(COMPACT_SELECT_CLASS).toContain('w-full')
    expect(SLATE_PICKER_SLOT_CLASS).toContain(`@min-[${SLATE_INLINE_PX}px]:w-44`)
    expect(SLATE_PICKER_SLOT_CLASS).toContain(`@min-[${SLATE_INLINE_PX}px]:flex-none`)
    for (const row of slate.querySelectorAll('li[data-spec]')) {
      const line = row.querySelector('[data-slate-line]') as HTMLElement
      expect(line.className).toBe(SLATE_LINE_CLASS)
      expect(line.className).toContain(`grid-cols-[2rem_${SLATE_NAME_TRACK}_auto]`)
      expect(line.className).toContain(`@min-[${SLATE_INLINE_PX}px]:grid-cols-[2rem_${SLATE_NAME_TRACK}_auto_auto]`)
      expect(line.className).not.toContain('minmax(0,1fr)')
      expect(SLATE_NAME_TRACK).toBe('minmax(12rem,1fr)')
      const nameButton = line.querySelector('button') as HTMLButtonElement
      expect(nameButton.className).not.toContain('truncate')
      expect(nameButton.className).toContain('[overflow-wrap:break-word]')
      expect(nameButton.className).not.toContain('anywhere')
      expect(nameButton.textContent).toContain(row.getAttribute('data-spec')!)
      expect(nameButton.getAttribute('title')).toContain(row.getAttribute('data-spec')!)
      // Pickers: their own line by default, where the two SHARE the row — each slot `flex-1` over
      // a 0 basis (`minmax(0,1fr)`), the select filling it, never under 10 rem, ellipsising with
      // the full value in its title — joining the name's line only at ≥ 820 px, where each slot
      // is the fixed 11 rem the threshold is derived from, so a long roster name can never take
      // the name's track in either branch.
      const pickers = line.querySelector('[data-slate-pickers]') as HTMLElement
      expect(pickers.className).toBe(SLATE_PICKERS_CLASS)
      expect(pickers.className).toContain('col-span-3')
      expect(pickers.className).toContain(`@min-[${SLATE_INLINE_PX}px]:col-span-1`)
      expect(pickers.className).toContain('flex-wrap')
      const slots = pickers.querySelectorAll<HTMLElement>('[data-slot]')
      expect(slots).toHaveLength(2)
      for (const slot of slots) {
        expect(slot.className).toContain(COMPACT_SLOT_CLASS)
        expect(slot.className).toContain(SLATE_PICKER_SLOT_CLASS)
      }
      const selects = pickers.querySelectorAll('select')
      expect(selects).toHaveLength(2)
      for (const s of selects) {
        expect(s.className).toContain(COMPACT_SELECT_CLASS)
        expect(s.className).toContain('truncate')
        expect(s.className).toContain('min-w-[10rem]')
        expect(s.className).not.toContain('w-44')
        expect(s.getAttribute('title')).toBe(s.selectedOptions[0]?.textContent)
      }
    }
    // "The plugin proposes" wraps an id + name rather than cutting it.
    const proposed = screen.getByRole('list', { name: 'Proposed slate' }).querySelector('[data-proposed] > span') as HTMLElement
    expect(proposed.className).not.toContain('truncate')
    expect(proposed.className).toContain('[overflow-wrap:anywhere]')
    // The slate is the widest of the three columns, measured against the screen (a container
    // query), and stacks first below the threshold.
    const columns = screen.getByTestId('planning-columns')
    expect(columns.className).toContain('@min-[1056px]:grid-cols-[minmax(300px,1fr)_minmax(400px,1.4fr)_320px]')
    expect(columns.parentElement?.className).toContain('@container')
    expect(columns.querySelector('[data-slate-first]')?.className).toContain('order-first')
    expect(columns.querySelector('[data-slate-first] [data-testid="planning-slate"]')).toBeTruthy()
  })
})
