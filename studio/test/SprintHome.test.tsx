// @vitest-environment jsdom
/** The sprint home as a person meets it: one `getCommandCenter` read drawn as it came; the lanes
 * a partition of the slate; the header's test ids kept; "no data" never a zero; no Approve
 * control anywhere; `v` on my own build is a note, not a disabled button; a write re-reads before
 * anything moves; the slate twin keeps the `sprint-slate` pins. `window.studio` is mocked
 * PARTIALLY — only the bridge calls this screen makes. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SprintHome } from '../src/components/SprintHome'
import { resetRoomStore } from '../src/stores/roomStore'
import { FORBIDDEN_METRIC_WORDS, NOTHING_NEEDS_YOU, OWN_BUILD_VERDICT, SIGN_IN_TO_SEE } from '../shared/reasons'
import type { SprintVerbResult } from '../shared/types'
import { CC, EMPTY_CC, ME, withCc } from './sprintHomeFixture'

const ok: SprintVerbResult = { ok: true, exitCode: 0, refused: false, stdout: 'verdict recorded', stderr: '', argv: [], verb: 'verdict' }

function install(doc = CC, over: Record<string, unknown> = {}) {
  const studio = {
    getCommandCenter: vi.fn().mockResolvedValue(doc),
    getReadinessAll: vi.fn().mockResolvedValue({ ok: true, specs: [] }),
    runSprintVerb: vi.fn().mockResolvedValue(ok),
    decideDecision: vi.fn().mockResolvedValue({ ok: true, id: 'DL-01', status: 'decided', decided: '2026-10-06', by: ME }),
    confirmTier: vi.fn().mockResolvedValue({ ok: true, changed: true, message: 'confirmed' }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  resetRoomStore()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

const mount = (props: Partial<Parameters<typeof SprintHome>[0]> = {}) =>
  render(<SprintHome projectPath="/p" onOpenSpec={vi.fn()} onNewSprint={vi.fn()} {...props} />)

describe('SprintHome: one read, drawn as it came', () => {
  it('reads the command center once with the default window and lands on [data-testid=sprint-home]', async () => {
    const studio = install()
    mount()
    expect(await screen.findByTestId('sprint-header')).toBeTruthy()
    expect(studio.getCommandCenter).toHaveBeenCalledTimes(1)
    expect(studio.getCommandCenter).toHaveBeenCalledWith('/p', 1)
    expect(screen.getByTestId('sprint-home')).toBeTruthy()
    expect(screen.getByTestId('sprint-state').textContent).toBe('ready')
    expect(screen.getByTestId('sprint-target').textContent).toBe('4 specs')
    expect(screen.getByTestId('sprint-wip').textContent).toBe('2 of 4')
  })

  it('places the slate in the four lanes as the partition says, with the next-up card marked', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    const ids = (lane: string) => Array.from(screen.getByTestId(`lane-${lane}`).querySelectorAll('[data-lane-card]')).map((c) => c.getAttribute('data-spec'))
    expect(ids('ready')).toEqual(['0007'])
    expect(ids('building')).toEqual(['0008'])
    expect(ids('checking')).toEqual(['0009'])
    expect(ids('merged')).toEqual(['0010'])
    expect(screen.getByTestId('lane-unplaced').textContent).toContain('0011')
    expect(document.querySelector('[data-lane-card][data-next-up]')?.getAttribute('data-spec')).toBe('0007')
    expect(screen.getByTestId('lane-ready').textContent).toContain('next up · deps merged · pull →')
  })

  it('the Checking card carries the plugin\'s wait, amber only on its condition, and the baton sits on the edge', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    const card = screen.getByTestId('lane-checking').querySelector('[data-lane-card]')!
    expect(card.querySelector('[data-wait="eng"]')?.textContent).toContain('2 business days')
    expect(card.querySelector('[data-wait="eng"]')?.hasAttribute('data-long')).toBe(true)
    expect(card.querySelector('[data-wait="data"]')?.textContent).toContain('no data')
    expect(screen.getByTestId('baton').textContent).toContain('0008 → @sam-k · 2 business days')
  })

  it('people are rings with at most one you-ring and no digit inside [data-person]', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    const persons = Array.from(document.querySelectorAll('[data-person]'))
    expect(persons.length).toBeGreaterThan(0)
    for (const p of persons) expect(p.textContent ?? '').not.toMatch(/\d/)
    const card = screen.getByTestId('lane-building').querySelector('[data-lane-card]')!
    expect(card.querySelectorAll('[data-person][data-you]')).toHaveLength(1)
  })

  it('shows no Approve control and no forbidden metric word', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.getByTestId('sprint-home').textContent ?? '').not.toMatch(/\bApprove\b/)
    expect(screen.getByTestId('sprint-home').textContent ?? '').not.toMatch(FORBIDDEN_METRIC_WORDS)
  })

  it('the needs-you list is main\'s list, item for item, and the TopBand chip would be its length', async () => {
    install()
    mount()
    await screen.findByTestId('needs-you-list')
    expect(screen.getAllByTestId('needs-you-list')[0].querySelectorAll('[data-needs-you-item]')).toHaveLength(CC.needsYou.length)
    expect(document.querySelector('[data-needs-you-item][data-late]')?.getAttribute('data-kind')).toBe('decide')
  })
})

describe('SprintHome: writes re-read before anything moves', () => {
  it('v on a card I built opens the verdict dialog with the note, not a disabled button; Confirm runs the closed table and re-reads', async () => {
    const studio = install()
    mount()
    await screen.findByTestId('lane-board')
    const mine = screen.getByTestId('lane-building').querySelector<HTMLButtonElement>('[data-lane-card]')!
    fireEvent.focus(mine)
    fireEvent.keyDown(mine, { key: 'v' })
    const dialog = await screen.findByTestId('verdict-dialog')
    expect(within(dialog).getByTestId('own-build-note').textContent).toContain(OWN_BUILD_VERDICT)
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' })
    expect(confirm.hasAttribute('disabled')).toBe(false)
    expect(within(dialog).getByTestId('verdict-argv').textContent).toContain('Run: sprint.py verdict --spec 0008 --lane eng --verdict accepted --by @arjun-m')
    fireEvent.click(confirm)
    await waitFor(() => expect(studio.runSprintVerb).toHaveBeenCalledWith('/p', { verb: 'verdict', spec: '0008', lane: 'eng', verdict: 'accepted', reason: undefined }))
    await waitFor(() => expect(studio.getCommandCenter).toHaveBeenCalledTimes(2))
    expect(within(dialog).getByTestId('verb-result').textContent).toContain('Done')
    expect(within(dialog).getByTestId('verb-result').textContent).toContain('verdict recorded')
  })

  it('a refused verdict renders "Refused by the plugin" and the stderr verbatim, and does not re-read', async () => {
    const refused: SprintVerbResult = { ...ok, ok: false, exitCode: 2, refused: true, stdout: '', stderr: 'refused: "Claude" is not a person' }
    const studio = install(CC, { runSprintVerb: vi.fn().mockResolvedValue(refused) })
    mount()
    await screen.findByTestId('lane-board')
    const card = screen.getByTestId('lane-checking').querySelector<HTMLButtonElement>('[data-lane-card]')!
    fireEvent.focus(card)
    fireEvent.keyDown(card, { key: 'v' })
    const dialog = await screen.findByTestId('verdict-dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    const result = await within(dialog).findByTestId('verb-result')
    expect(result.textContent).toContain('Refused by the plugin')
    expect(result.textContent).toContain('refused: "Claude" is not a person')
    expect(studio.getCommandCenter).toHaveBeenCalledTimes(1)
  })

  it('j k ↵ roam the cards in lane order and open the third one', async () => {
    const onOpenSpec = vi.fn()
    install()
    mount({ onOpenSpec })
    await screen.findByTestId('lane-board')
    const first = screen.getByTestId('lane-ready').querySelector<HTMLButtonElement>('[data-lane-card]')!
    first.focus()
    fireEvent.keyDown(first, { key: 'j' })
    fireEvent.keyDown(document.activeElement!, { key: 'j' })
    expect(document.activeElement?.getAttribute('data-spec')).toBe('0009')
    fireEvent.keyDown(document.activeElement!, { key: 'k' })
    expect(document.activeElement?.getAttribute('data-spec')).toBe('0008')
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onOpenSpec).toHaveBeenCalledWith(expect.objectContaining({ spec: '0008', developer: ME }))
  })

  it('h hands the row to the host\'s dialog as a board row', async () => {
    const onHandOff = vi.fn()
    install()
    mount({ onHandOff })
    await screen.findByTestId('lane-board')
    const first = screen.getByTestId('lane-ready').querySelector<HTMLButtonElement>('[data-lane-card]')!
    fireEvent.focus(first)
    fireEvent.keyDown(first, { key: 'h' })
    expect(onHandOff).toHaveBeenCalledWith(expect.objectContaining({ spec: '0007' }))
  })
})

describe('SprintHome: the slate twin and the empty fixture', () => {
  it('keeps the slate table twin with its sprint-slate pins and the three page buttons inside sprint-board', async () => {
    install()
    mount()
    await screen.findByTestId('sprint-slate')
    expect(screen.getAllByTestId('sprint-slate-row')).toHaveLength(CC.sprint.data!.slate.length)
    const buttons = within(screen.getByTestId('sprint-board')).getAllByRole('button').map((b) => b.textContent?.trim() ?? '')
    const names = buttons.filter((b) => !/^\d{4}$/.test(b) && !['READY', 'NOT READY'].includes(b))
    expect(names.sort()).toEqual(['Planning page', 'Refresh', 'Review page'])
    // Exactly one header carries the facts' test ids.
    expect(screen.getAllByTestId('sprint-header')).toHaveLength(1)
  })

  it('the empty fixture: the plugin\'s note, New sprint, sign-in sentence, no roster, no data — and no zero inside [data-stat]', async () => {
    install(EMPTY_CC)
    mount()
    await screen.findByTestId('sprint-empty')
    const home = screen.getByTestId('sprint-home')
    expect(screen.getByTestId('sprint-empty').textContent).toBe(EMPTY_CC.sprint.data!.note)
    expect(screen.getByRole('button', { name: /New sprint/ })).toBeTruthy()
    expect(screen.getByTestId('needs-you-empty').textContent).toContain(SIGN_IN_TO_SEE)
    expect(screen.getByTestId('room-empty').textContent).toContain('no roster')
    expect(screen.getByTestId('going-empty').textContent).toContain('no data')
    expect(screen.queryByTestId('lane-board')).toBeNull()
    for (const el of Array.from(home.querySelectorAll('[data-stat]'))) expect(el.textContent ?? '').not.toMatch(/\b0\b/)
    for (const b of Array.from(home.querySelectorAll<HTMLButtonElement>('button[disabled]'))) {
      expect(b.querySelector('[data-disabled-reason]')?.textContent, b.textContent ?? '').toBeTruthy()
    }
  })

  it('with an actor and nothing addressed, "nothing needs you" is the words plus the figure', async () => {
    install(withCc({ needsYou: [], needsYouReason: null }))
    mount()
    await screen.findByTestId('needs-you-empty')
    expect(screen.getByTestId('needs-you-empty').textContent).toContain(NOTHING_NEEDS_YOU)
    expect(document.querySelector('[data-cc-figure="nothing-needs-you"]')).toBeTruthy()
  })
})

describe('SprintHome: the baton is one overlay on the gutter; rings never read as one word (fixer round)', () => {
  it('renders the baton once, outside every lane, as the grid\'s own overlay; the two gutter lanes reserve its slot, the others do not', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    const baton = screen.getByTestId('baton')
    expect(baton.closest('[data-lane]')).toBeNull()
    expect(baton.closest('[data-baton-overlay]')).not.toBeNull()
    expect(baton.closest('[data-lanes-grid]')?.className).toContain('relative')
    expect(screen.getByTestId('lane-checking').querySelector('[data-testid="baton"]')).toBeNull()
    // The 24 px glyph and the words whole — no truncation class on the label.
    expect(baton.querySelector('[data-baton]')?.getAttribute('width')).toBe('24')
    expect(baton.querySelector('span[data-baton]')?.className).not.toContain('truncate')
    const reserve = (lane: string) => screen.getByTestId(`lane-${lane}`).querySelector('[data-baton-reserve]')?.getAttribute('data-baton-reserve') ?? null
    expect(reserve('building')).toBe('40')
    expect(reserve('checking')).toBe('40')
    expect(reserve('ready')).toBeNull()
    expect(reserve('merged')).toBeNull()
  })

  it('with no hand-off open there is no baton and no reserved slot anywhere — the four lanes paint identically', async () => {
    install(withCc({ sprint: { ...CC.sprint, data: { ...CC.sprint.data!, handoffsOpen: [] } } }))
    mount()
    await screen.findByTestId('lane-board')
    expect(screen.queryByTestId('baton')).toBeNull()
    expect(document.querySelector('[data-baton-reserve]')).toBeNull()
  })

  it('a row with more than two people stacks its rings with a surface gap and a descending z-order; a pair sits spaced', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    const checking = screen.getByTestId('lane-checking').querySelector('[data-lane-card]')! // owner, developer, checker
    const rings = Array.from(checking.querySelectorAll<HTMLElement>('[data-person]'))
    expect(rings.length).toBe(3)
    expect(checking.querySelector('[data-rings]')?.getAttribute('data-rings')).toBe('stacked')
    expect(rings.map((r) => r.style.zIndex)).toEqual(['3', '2', '1'])
    for (const r of rings) if (!r.hasAttribute('data-you')) expect(r.className).toContain('ring-surface-1')
    const ready = screen.getByTestId('lane-ready').querySelector('[data-lane-card]')! // the owner alone
    expect(ready.querySelector('[data-rings]')?.getAttribute('data-rings')).toBe('spaced')
  })

  it('the host\'s sentence is one quiet status notice above the lanes, never amber', async () => {
    install(withCc({ board: { ...CC.board, data: { ...CC.board.data!, codeHostAvailable: false, error: 'gh: offline' } } }))
    mount()
    await screen.findByTestId('lane-board')
    const notice = screen.getByTestId('lanes-host-reason')
    expect(notice.getAttribute('role')).toBe('status')
    expect(notice.className).not.toContain('amber')
    expect(notice.className).not.toContain('status-warn')
  })
})

describe('SprintHome: Today sits beside the lanes on a working window (fixer round)', () => {
  it('the home grid gives Today its 320 px column from a 1000 px screen, and the Today band collapses to one column there', async () => {
    install()
    mount()
    await screen.findByTestId('lane-board')
    const grid = document.querySelector('[data-home-grid]') as HTMLElement
    expect(grid.className).toContain('@min-[1000px]:grid-cols-[minmax(0,1fr)_320px]')
    expect(grid.className).not.toContain('@min-[1308px]')
    expect(screen.getAllByTestId('today')[0].className).toContain('@min-[1000px]:grid-cols-1')
    // The lanes wrap two by two below 940 px of their own width and go four across above it.
    expect(document.querySelector('[data-lanes-grid]')?.className).toContain('@min-[940px]:grid-cols-4')
  })
})
