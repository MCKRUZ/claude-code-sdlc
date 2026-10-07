// @vitest-environment jsdom
/** The hand-off after the Observatory pass (studio-observatory.md §7 "HandoffDialog", §6.4
 * "Hand-off Developer"). The screen still enforces nothing: it asks the plugin and frames the
 * answer. New here is the RosterPicker — a combobox over a roster the host passes in, falling back
 * to free text when there is none — and the toast on success. The texts tests and people rely on
 * ("Hand off", "Hand off anyway", "Back to the board") are unchanged. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HandoffDialog } from '../src/components/HandoffDialog'
import { RosterPicker, filterRoster } from '../src/components/RosterPicker'
import { clearToasts, getSnapshot } from '../src/ui/toastStore'
import { configureMotionForTests } from '../src/motion/motion'
import { gsap } from 'gsap'
import type { BoardRow } from '../shared/types'
import type { RosterEntry } from '../src/ui'

const ROW: BoardRow = {
  spec: '0008', name: 'claim-export', path: 'specs/0008-claim-export.md', title: 'Claim export', status: 'ready',
  risk: 'MEDIUM', team: 'platform', channel: '', owner: '@sam-k', developer: '', checker: '@priya-n', branch: '',
  sprint: 'S07', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null,
}

const ROSTER: RosterEntry[] = [
  { handle: '@sam-k', name: 'Sam K', team: 'platform' },
  { handle: '@priya-n', name: 'Priya N', team: 'claims' },
  { handle: '@lee-w', name: 'Lee W', team: 'platform' },
]

function install(handOff = vi.fn().mockResolvedValue({ ok: true, developer: '@lee-w', checker: '@priya-n', branch: 'spec/0008', prUrl: 'https://x/13' })) {
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { handOff }
  return handOff
}

afterEach(() => {
  cleanup()
  clearToasts()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('HandoffDialog: try it, and deal with the answer', () => {
  it('names the three roles, disables Hand off until a developer is named, and sends no reason unprompted', async () => {
    const handOff = install()
    render(<main><HandoffDialog projectPath="/p" row={ROW} roster={ROSTER} onClose={vi.fn()} onHandedOff={vi.fn()} /></main>)
    expect(screen.getByText('Owns it').closest('div')?.textContent).toContain('@sam-k')
    expect(screen.getByText('Builds it').closest('div')?.textContent).toContain('choose below')
    expect(screen.getByText('Checks it').closest('div')?.textContent).toContain('@priya-n')
    const button = screen.getByRole('button', { name: /^Hand off/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.className).toContain('bg-brand-600')

    const input = screen.getByRole('combobox', { name: 'Developer' })
    fireEvent.change(input, { target: { value: '@lee-w' } })
    expect(screen.getByText('Builds it').closest('div')?.textContent).toContain('@lee-w')
    fireEvent.click(screen.getByRole('button', { name: 'Hand off' }))
    await waitFor(() => expect(handOff).toHaveBeenCalledWith('/p', 'specs/0008-claim-export.md', '@lee-w', undefined))
  })

  it('success shows the result, offers "Back to the board" and raises one toast', async () => {
    install()
    const onHandedOff = vi.fn()
    render(<main><HandoffDialog projectPath="/p" row={ROW} roster={ROSTER} onClose={vi.fn()} onHandedOff={onHandedOff} /></main>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Developer' }), { target: { value: '@lee-w' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hand off' }))
    await screen.findByText('Handed off')
    expect(screen.getByText('Pull request opened.')).toBeTruthy()
    expect(getSnapshot().length).toBe(1)
    expect(String(getSnapshot()[0].title)).toContain('0008 handed off')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the board' }))
    expect(onHandedOff).toHaveBeenCalledTimes(1)
  })

  it('a team at its limit is refused in the plugin\'s words; the reason field appears, and only then is it sent', async () => {
    const handOff = vi.fn()
      .mockResolvedValueOnce({ ok: false, refusal: { kind: 'team_at_limit', message: 'platform has 3 in flight; the limit is 3.' } })
      .mockResolvedValueOnce({ ok: true, developer: '@lee-w' })
    install(handOff)
    render(<main><HandoffDialog projectPath="/p" row={ROW} roster={ROSTER} onClose={vi.fn()} onHandedOff={vi.fn()} /></main>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Developer' }), { target: { value: '@lee-w' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hand off' }))
    const notice = await screen.findByText('That team is at its limit')
    expect(notice.closest('[role="status"]')?.className).toContain('amber')
    expect(screen.getByText('platform has 3 in flight; the limit is 3.')).toBeTruthy()
    const anyway = screen.getByRole('button', { name: /^Hand off anyway/ }) as HTMLButtonElement
    expect(anyway.disabled).toBe(true)
    // Said twice on purpose: once visibly, once as the disabled button's hidden reason.
    expect(screen.getAllByText('A reason is required to go past a limit.').length).toBe(2)
    fireEvent.change(screen.getByLabelText(/Why are you going past the limit/), { target: { value: 'vendor deadline' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hand off anyway' }))
    await waitFor(() => expect(handOff).toHaveBeenLastCalledWith('/p', 'specs/0008-claim-export.md', '@lee-w', 'vendor deadline'))
    expect(getSnapshot().length).toBe(1)
  })

  it('a refusal writes no toast; an assignment error after a local success is shown, not hidden', async () => {
    install(vi.fn().mockResolvedValue({ ok: true, developer: '@lee-w', assignmentError: 'gh: 403' }))
    render(<main><HandoffDialog projectPath="/p" row={ROW} onClose={vi.fn()} onHandedOff={vi.fn()} /></main>)
    // No roster → a plain text field, still labelled Developer, still inside <main>.
    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.change(screen.getByLabelText('Developer'), { target: { value: '@lee-w' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hand off' }))
    expect((await screen.findByText(/could not be told/)).textContent).toContain('gh: 403')
  })
})

describe('RosterPicker: a combobox over the roster the host holds', () => {
  it('filters by handle, name or team', () => {
    expect(filterRoster(ROSTER, 'lee').map((p) => p.handle)).toEqual(['@lee-w'])
    expect(filterRoster(ROSTER, 'Priya').map((p) => p.handle)).toEqual(['@priya-n'])
    expect(filterRoster(ROSTER, 'platform').map((p) => p.handle)).toEqual(['@sam-k', '@lee-w'])
    expect(filterRoster(ROSTER, '')).toEqual(ROSTER)
  })

  it('opens on focus, moves with ↓, picks with Enter, closes with Esc without bubbling it', async () => {
    const onChange = vi.fn()
    const onEscape = vi.fn()
    render(<div onKeyDown={(e) => { if (e.key === 'Escape') onEscape() }}><RosterPicker roster={ROSTER} value="" onChange={onChange} label="Developer" /></div>)
    const input = screen.getByRole('combobox', { name: 'Developer' })
    expect(input.getAttribute('aria-expanded')).toBe('false')
    fireEvent.focus(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('option').length).toBe(3)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('@priya-n')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onEscape).not.toHaveBeenCalled()
    await act(async () => {})
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('with no roster it is a plain input that says the command will check the handle', () => {
    render(<RosterPicker roster={[]} value="" onChange={vi.fn()} label="Developer" />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByLabelText('Developer').tagName).toBe('INPUT')
    expect(screen.getByText(/the hand-off command checks it/)).toBeTruthy()
  })
})

describe('HandoffDialog: M9 with the engine ON leaves the success card visible', () => {
  afterEach(() => {
    configureMotionForTests(null)
    gsap.globalTimeline.clear()
  })

  it('the form root fades to 0 and is unmounted; "Handed off" mounts on a fresh node at opacity 1', async () => {
    configureMotionForTests({ isTestMode: () => false })
    install()
    render(<main><HandoffDialog projectPath="/p" row={ROW} roster={ROSTER} onClose={vi.fn()} onHandedOff={vi.fn()} /></main>)
    const formRoot = screen.getByText('Hand off 0008').closest('.space-y-4') as HTMLElement
    fireEvent.change(screen.getByRole('combobox', { name: 'Developer' }), { target: { value: '@lee-w' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hand off' }))
    const heading = await screen.findByText('Handed off', undefined, { timeout: 5000 })
    const cardRoot = heading.closest('.space-y-4') as HTMLElement
    // A different DOM node than the form's — the one the ceremony tweened to opacity 0 is gone.
    expect(cardRoot).not.toBe(formRoot)
    expect(formRoot.isConnected).toBe(false)
    expect(cardRoot.style.opacity === '' || Number(cardRoot.style.opacity) === 1).toBe(true)
    expect(getComputedStyle(cardRoot).opacity).not.toBe('0')
    expect(screen.getByRole('button', { name: 'Back to the board' })).toBeTruthy()
  })
})
