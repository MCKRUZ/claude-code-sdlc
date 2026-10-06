// @vitest-environment jsdom
/** The Build board after the Observatory pass (studio-observatory.md §7 "BuildBoard"). The pins
 * board.spec relies on must hold in jsdom too: the role buttons carry `bg-brand-600` when active,
 * every spec is a `main li button`, the search input says "Search", and the counts read the same.
 * Everything new — the Flip ids, the hover card, the Graph toggle, the backlog store write — is a
 * transformation of what was already fetched: `getBoard` is still called exactly once. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuildBoard, constellationFrom, ROW_GRID } from '../src/components/BuildBoard'
import { backlogStore } from '../src/stores/backlogStore'
import type { Board, BoardRow } from '../shared/types'

const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  spec: '0007', name: 'duplicate-claim-409', path: 'specs/0007-duplicate-claim-409.md', title: 'Duplicate claim 409',
  status: 'ready', risk: 'HIGH', team: 'claims', channel: '', owner: '@matt-k', developer: '', checker: '@priya-n',
  branch: '', sprint: 'S07', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null, ...over,
})

const BOARD: Board = {
  rows: [
    row(),
    row({ spec: '0008', name: 'claim-export', title: 'Claim export', risk: 'MEDIUM', team: 'platform', owner: '@sam-k', dependsOn: ['0007', '0042'] }),
    row({ spec: '0009', name: 'retry-rail', title: 'Retry rail', risk: 'LOW', team: 'claims', owner: '@sam-k', checker: '@matt-k', status: 'in-flight',
      pullRequest: { number: 12, url: 'https://x/12', state: 'OPEN', mergedAt: null, updatedAt: null, waitingOn: 'waiting for a non-author approval', waitingOnHandle: '@matt-k', waitHours: 30, overAlarm: true } }),
  ],
  codeHostAvailable: true,
  teamLimits: null,
} as unknown as Board

function install(board: Board = BOARD) {
  const studio = { getBoard: vi.fn().mockResolvedValue(board) }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  backlogStore.clear()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

async function renderBoard(account: string | null = '@matt-k') {
  const studio = install()
  const onOpenSpec = vi.fn()
  const view = render(<main><BuildBoard projectPath="/p" account={account} onOpenSpec={onOpenSpec} /></main>)
  await screen.findByRole('heading', { name: 'Build' })
  return { studio, onOpenSpec, view }
}

describe('BuildBoard: one read, many views', () => {
  it('reads the board once, writes the rows to the backlog store and opens on "Needs me" in brand colours', async () => {
    const { studio } = await renderBoard()
    expect(studio.getBoard).toHaveBeenCalledTimes(1)
    expect(backlogStore.rows.map((r) => r.spec)).toEqual(['0007', '0008', '0009'])
    const needsMe = screen.getByRole('button', { name: 'Needs me' })
    expect(needsMe.className).toContain('bg-brand-600')
    expect(needsMe.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: 'Role view' })).toBeTruthy()
  })

  it('switching role, searching and grouping never re-read; every spec is a `main li button` with a Flip id', async () => {
    const { studio } = await renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
    // The count is a count-up span beside its noun; read the sentence, as Playwright does.
    const count = () => screen.getByRole('heading', { name: 'Build' }).nextElementSibling?.textContent ?? ''
    expect(count()).toContain('3 specs')
    const buttons = document.querySelectorAll('main li button')
    expect(buttons.length).toBe(3)
    expect(buttons[0].getAttribute('data-flip-id')).toBe('spec:0007')

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'export' } })
    expect(count()).toContain('1 shown')
    expect(document.querySelectorAll('main li button').length).toBe(1)

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Grouping' }), { target: { value: 'team' } })
    expect(screen.getByRole('heading', { name: 'claims' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'platform' })).toBeTruthy()
    expect(studio.getBoard).toHaveBeenCalledTimes(1)
  })

  it('the surface opens on List and offers Graph; List is a toggle, not a memory', async () => {
    await renderBoard()
    const list = screen.getByRole('button', { name: 'List' })
    expect(list.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    expect(screen.getByRole('button', { name: 'Graph' }).getAttribute('aria-pressed')).toBe('true')
    // No scene is registered in a component test, so the rows stay — the Graph is a second view,
    // never a replacement for the list a screen reader can read.
    expect(document.querySelectorAll('main li button').length).toBeGreaterThan(0)
  })

  it('a row opens its spec and ↑/↓ move between rows', async () => {
    const { onOpenSpec } = await renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('main li button'))
    buttons[0].focus()
    fireEvent.keyDown(buttons[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[1])
    fireEvent.keyDown(buttons[1], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.click(buttons[1])
    expect(onOpenSpec).toHaveBeenCalledWith(expect.objectContaining({ spec: '0008' }))
  })

  it('the hover card shows the row\'s own facts — "you" for the signed-in person, the PR sentence, the wait as reported', async () => {
    vi.useFakeTimers()
    try {
      install()
      render(<main><BuildBoard projectPath="/p" account="@matt-k" onOpenSpec={vi.fn()} /></main>)
      await vi.waitFor(() => screen.getByRole('heading', { name: 'Build' }))
      fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
      const retry = document.querySelectorAll<HTMLButtonElement>('main li button')[2]
      fireEvent.mouseEnter(retry.parentElement!)
      await act(async () => { vi.advanceTimersByTime(400) })
      const card = within(screen.getByTestId('spec-hover-card'))
      expect(card.getByText(/owner @sam-k · developer nobody · checker you/)).toBeTruthy()
      expect(card.getByText(/waiting for a non-author approval/)).toBeTruthy()
      expect(card.getByText(/30h as reported/)).toBeTruthy()
      expect(screen.getByTestId('spec-hover-card').querySelectorAll('button, input, a').length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('signed out, "Needs me" says it cannot answer rather than showing a clean slate', async () => {
    await renderBoard(null)
    expect(screen.getByText(/Nobody is signed in, so this view cannot say what is waiting on you/)).toBeTruthy()
  })

  it('a code host that could not be reached is information — a status notice, never amber (amber is a measured wait) — with every row still shown', async () => {
    install({ ...BOARD, codeHostAvailable: false, error: 'gh: not signed in' } as Board)
    render(<main><BuildBoard projectPath="/p" account={null} onOpenSpec={vi.fn()} /></main>)
    await screen.findByRole('heading', { name: 'Build' })
    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('Showing what the spec files say.')
    expect(notice.textContent).toContain('gh: not signed in')
    expect(notice.className).not.toContain('amber')
    expect(notice.className).not.toMatch(/status-(warn|error)/)
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
    expect(document.querySelectorAll('main li button').length).toBe(3)
  })

  it('Refresh re-reads; nothing else does', async () => {
    const { studio } = await renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(studio.getBoard).toHaveBeenCalledTimes(2))
  })
})

describe('BuildBoard: the round-2 shape (studio-upgrade-2 S6)', () => {
  it('the header carries the area eyebrow, the heading "Build" and Refresh among its actions', async () => {
    await renderBoard()
    const heading = screen.getByRole('heading', { name: 'Build' })
    const header = heading.closest('header')!
    expect(header.textContent).toContain('Build · Board')
    expect(header.contains(screen.getByRole('button', { name: 'Refresh' }))).toBe(true)
  })

  it('every row wears its status as a chip, in the one tone map the slate uses; the risk tier in the one risk map (HIGH error, MEDIUM warn, LOW neutral)', async () => {
    await renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
    const chips = screen.getAllByTestId('spec-status-chip')
    expect(chips.map((c) => c.textContent)).toEqual(['ready', 'ready', 'in-flight'])
    expect(chips[0].className).toContain('stage-current')
    expect(chips[2].className).toContain('accent')
    expect(document.querySelectorAll('main li button').length).toBe(3)
    const risk = (text: string) => Array.from(document.querySelectorAll('main li button span.rounded-full')).find((c) => c.textContent === text) as HTMLElement
    expect(risk('HIGH').className).toContain('status-error')
    expect(risk('MEDIUM').className).toContain('status-warn')
    expect(risk('LOW').className).toContain('surface-2')
  })

  it('every row shares one set of tracks: the last column is fixed, so a row without the "mine" chip does not squeeze its neighbours\' columns', () => {
    expect(ROW_GRID).toContain('grid-cols-[3.5rem_minmax(0,1fr)_4.25rem_5.75rem_minmax(0,11rem)_5.5rem]')
    expect(ROW_GRID).not.toMatch(/_auto\]/)
  })

  it('the filter bar is a deliberate two-row wrap, both rows marked', async () => {
    await renderBoard()
    const rows = document.querySelectorAll('[data-filter-row]')
    expect(rows).toHaveLength(2)
    expect(rows[0].contains(screen.getByRole('group', { name: 'Role view' }))).toBe(true)
    expect(rows[0].contains(screen.getByRole('group', { name: 'Board surface' }))).toBe(true)
    expect(rows[1].contains(screen.getByPlaceholderText('Search'))).toBe(true)
    expect(rows[1].querySelectorAll('select')).toHaveLength(4)
  })

  it('the code-host notice is one line with the host\'s words behind a <details> and the team chips on its right', async () => {
    install({ ...BOARD, codeHostAvailable: false, error: 'gh: not signed in' } as Board)
    render(<main><BuildBoard projectPath="/p" account={null} onOpenSpec={vi.fn()} /></main>)
    await screen.findByRole('heading', { name: 'Build' })
    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('Showing what the spec files say.')
    const details = notice.querySelector('details') as HTMLDetailsElement
    expect(details).toBeTruthy()
    expect(details.open).toBe(false)
    expect(details.textContent).toContain('gh: not signed in')
    // The team-load pills ride in the notice's actions slot rather than a row of their own.
    expect(notice.querySelectorAll('span.rounded-full').length).toBeGreaterThan(0)
    expect(notice.textContent).toContain('claims')
  })
})

describe('BuildBoard: amber stays amber (studio-observatory.md §5.4, §2.3)', () => {
  it('a team over its review alarm gets a WARN chip, never the error red the Graph ring and HandoffDialog do not use', async () => {
    await renderBoard()
    // 'claims' owns 0009, whose PR is over the alarm; the words say so, the tone stays amber.
    const chip = screen.getByText('OVER ALARM', { exact: false }).closest('span.rounded-full') as HTMLElement
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('claims')
    expect(chip.className).toContain('status-warn')
    expect(chip.className).not.toContain('status-error')
    // A team with nothing to flag is neutral.
    const platform = screen.getByText('platform', { selector: 'span.font-medium' }).closest('span.rounded-full') as HTMLElement
    expect(platform.className).toContain('surface-2')
    expect(platform.className).not.toMatch(/status-(warn|error)/)
  })

  it('a team over its WIP limit is also warn-class — "over limit" is the differentiator, not a red tone', async () => {
    const limited: Board = { ...BOARD, teamLimits: { claims: { in_flight: 1, wip_limit: 0 } } }
    install(limited)
    render(<main><BuildBoard projectPath="/p" account="@matt-k" onOpenSpec={vi.fn()} /></main>)
    await screen.findByRole('heading', { name: 'Build' })
    const chip = screen.getByText('over limit').closest('span.rounded-full') as HTMLElement
    expect(chip.className).toContain('status-warn')
    expect(chip.className).not.toContain('status-error')
  })
})

describe('constellationFrom: the Graph is the filtered list, drawn', () => {
  it('one body per shown row, radius input is the risk string only, a dependency outside the filter is a Ghost', () => {
    const data = constellationFrom(BOARD.rows.slice(0, 2))
    expect(data.source).toBe('board')
    expect(data.bodies.map((b) => b.id)).toEqual(['0007', '0008'])
    expect(data.bodies[1].risk).toBe('MEDIUM')
    expect(data.tethers).toEqual([
      { from: '0008', to: '0007', ghost: false },
      { from: '0008', to: '0042', ghost: true },
    ])
    expect(data.ghosts).toEqual([{ id: '0042', reason: 'not-shown', referencedBy: ['0008'] }])
    expect(data.buildOrder).toEqual([])
    expect(data.dependencyGaps).toEqual([])
    expect(data.hasData).toBe(true)
  })

  it('an empty filter is "no data", not an empty sky', () => {
    expect(constellationFrom([]).hasData).toBe(false)
  })
})
