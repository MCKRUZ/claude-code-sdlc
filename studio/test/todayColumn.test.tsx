// @vitest-environment jsdom
/** The Today column shows main's lists as they came: needs-you first with one action each,
 * `today-late` only on the plugin's `overdue:true`, verdicts as a lane (never a person), the
 * stream with origin tags and "undated" last, the window as a filter, Standup notes present and
 * disabled with its reason. No IPC of its own — every action is a callback. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodayColumn, prUrlFor, stampText } from '../src/components/today/TodayColumn'
import { SIGN_IN_TO_SEE, STANDUP_NOTES, STREAM_ARRIVES, UNDATED } from '../shared/reasons'
import type { SprintVerbResult } from '../shared/types'
import { CC, EMPTY_CC, withCc } from './sprintHomeFixture'

afterEach(cleanup)

const ok: SprintVerbResult = { ok: true, exitCode: 0, refused: false, stdout: 'acknowledged', stderr: '', argv: [], verb: 'ack' }

function mount(cc = CC, over: Partial<Parameters<typeof TodayColumn>[0]> = {}) {
  const props = {
    cc,
    onRun: vi.fn().mockResolvedValue(ok),
    onDecide: vi.fn().mockResolvedValue({ ok: true, id: 'DL-01', status: 'decided', decided: '2026-10-06', by: '@arjun-m' }),
    onConfirmTier: vi.fn().mockResolvedValue({ ok: true, changed: true, message: 'confirmed' }),
    onSince: vi.fn(),
    onActed: vi.fn(),
    claudeLine: 'drafted 2 fields · 1 proposal waiting for a yes',
    ...over,
  }
  render(<TodayColumn {...props} />)
  return props
}

describe('needs you', () => {
  it('lists main\'s items in order, each with one action, the overdue one in today-late', () => {
    mount()
    const items = screen.getByTestId('needs-you-list').querySelectorAll('[data-needs-you-item]')
    expect(items).toHaveLength(3)
    expect(items[0].getAttribute('data-kind')).toBe('decide')
    expect(items[0].hasAttribute('data-late')).toBe(true)
    expect(items[0].className).toContain('today-late')
    expect(items[1].className).toContain('today-act')
    expect(within(items[1] as HTMLElement).getByRole('link', { name: 'Open PR' }).getAttribute('href')).toBe('https://example.test/pr/43')
    expect(within(items[2] as HTMLElement).getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(items[0].getAttribute('title')).toBe('track_decisions.py --json')
    // The item's words are their own row, clamped to two lines — never truncated to a sliver.
    const text = items[0].querySelector('[data-needs-you-text]') as HTMLElement
    expect(text.textContent).toBe('Fail open or closed?')
    expect(text.className).toContain('line-clamp-2')
    expect(text.className).not.toContain('truncate')
  })

  it('Decide asks for a resolution, records through the callback and tells the host to re-read', async () => {
    const props = mount()
    const item = screen.getByTestId('needs-you-list').querySelector('[data-needs-you-item][data-kind="decide"]') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: 'Decide' }))
    fireEvent.change(within(item).getByLabelText('Resolution for DL-01'), { target: { value: 'Fail closed' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Record' }))
    await waitFor(() => expect(props.onDecide).toHaveBeenCalledWith('DL-01', 'Fail closed'))
    await waitFor(() => expect(props.onActed).toHaveBeenCalledTimes(1))
    expect(within(item).getByTestId('needs-you-outcome').textContent).toContain('decided')
  })

  it('Confirm runs confirmTier with the spec id', async () => {
    const props = mount()
    const item = screen.getByTestId('needs-you-list').querySelector('[data-needs-you-item][data-kind="confirm-tier"]') as HTMLElement
    fireEvent.click(within(item).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(props.onConfirmTier).toHaveBeenCalledWith('0012'))
  })

  it('no actor → the sign-in sentence; the chip would be 0 items but no digit is drawn', () => {
    mount(EMPTY_CC)
    expect(screen.getByTestId('needs-you-empty').textContent).toContain(SIGN_IN_TO_SEE)
    expect(screen.getByTestId('needs-you-empty').textContent ?? '').not.toMatch(/\d/)
  })

  it('prUrlFor is a lookup by exact spec id on the board block', () => {
    expect(prUrlFor(CC, '0009')).toBe('https://example.test/pr/43')
    expect(prUrlFor(CC, '0007')).toBeNull()
    expect(prUrlFor(CC, undefined)).toBeNull()
  })
})

describe('team is waiting on, since yesterday, Claude, standup', () => {
  it('verdicts pending are grouped per spec with a lane and the plugin\'s wait — never a person', () => {
    mount()
    const team = screen.getByTestId('team-waiting')
    expect(team.textContent).toContain('0009')
    expect(team.textContent).toContain('eng · 2 business days')
    expect(team.textContent).toContain('data · no data')
    expect(team.textContent).not.toContain('@')
  })

  it('the stream tags each row by origin, dates from the source, undated rows labelled; the window is a filter the person picks', () => {
    const props = mount()
    const rows = screen.getByTestId('stream').querySelectorAll('[data-stream-key]')
    expect(rows).toHaveLength(3)
    expect(rows[0].getAttribute('data-origin')).toBe('log')
    expect(rows[1].getAttribute('data-origin')).toBe('board')
    expect(rows[2].textContent).toContain(UNDATED)
    expect(stampText('2026-10-05T16:10:00Z')).toBe('2026-10-05 16:10')
    expect(stampText(null)).toBe(UNDATED)
    fireEvent.click(screen.getByRole('button', { name: '3 business days' }))
    expect(props.onSince).toHaveBeenCalledWith(3)
  })

  it('without sprint-log the stream says what arrives with a newer plugin', () => {
    mount(withCc({ capabilities: ['sprint-status', 'sprint-write'] }))
    expect(screen.getByTestId('stream-unavailable').textContent).toBe(STREAM_ARRIVES)
  })

  it('Claude\'s line is labelled as Tōgō\'s record; Standup notes is present, disabled, with its reason', () => {
    mount()
    expect(screen.getByTestId('claude-line').textContent).toContain('drafted 2 fields · 1 proposal waiting for a yes')
    expect(screen.getByTestId('claude-line').textContent).toContain("Tōgō's record")
    const standup = screen.getByRole('button', { name: /Standup notes/ })
    expect(standup.hasAttribute('disabled')).toBe(true)
    expect(standup.querySelector('[data-disabled-reason]')?.textContent).toBe(STANDUP_NOTES)
  })
})
