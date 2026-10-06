// @vitest-environment jsdom
/** Refining lists the plugin's own candidates (SLATEABLE_STATUSES and no sprint) plus deferrals
 * with their reason — never a blank; DoR gaps verbatim from `spec_readiness.py --all`; "Confirm
 * tier" only when the capability exists, otherwise the column says what arrives with a newer
 * plugin; "refine in place →" opens the card. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { candidateRows, confirmTierReason, deferredReasonText, deferredRows, readinessFor, Refining } from '../src/components/Refining'
import { DEFERRED_REASON_RECORDED, NO_ACTOR, newerPlugin, TIER_CONFIRMATION_ARRIVES } from '../shared/reasons'
import type { ReadinessAll } from '../shared/types'
import { BOARD_ROWS, CC, ROSTER } from './sprintHomeFixture'

afterEach(cleanup)

const READINESS: ReadinessAll = {
  ok: true,
  specs: [{ ok: true, spec: '/p/specs/0012-batch-close.md', risk: 'LOW', status: 'draft', ready: false, blocking: [{ check: 'scope-out', passed: false, severity: 'MUST', message: '## Scope Out: missing' }], advisory: [], passed: [] }],
}

describe('the pure parts', () => {
  it('candidates = ready|draft with no sprint; deferred rows separately', () => {
    expect(candidateRows(BOARD_ROWS).map((r) => r.spec)).toEqual(['0012'])
    expect(deferredRows(BOARD_ROWS).map((r) => r.spec)).toEqual(['0013'])
  })
  it('a deferred row without the plugin\'s reason in the read points at the spec, never a blank', () => {
    expect(deferredReasonText(BOARD_ROWS[6])).toBe(DEFERRED_REASON_RECORDED)
    expect(deferredReasonText({ ...BOARD_ROWS[6], deferredReason: 'vendor slipped a quarter' } as never)).toBe('vendor slipped a quarter')
  })
  it('readinessFor is a lookup by path or NNNN- prefix', () => {
    expect(readinessFor(READINESS, BOARD_ROWS[5])?.ready).toBe(false)
    expect(readinessFor(READINESS, BOARD_ROWS[0])).toBeNull()
    expect(readinessFor(null, BOARD_ROWS[5])).toBeNull()
  })
  it('confirmTierReason: capability first, then the actor', () => {
    expect(confirmTierReason(CC.actor, ['sprint-status'])).toBe(TIER_CONFIRMATION_ARRIVES)
    expect(confirmTierReason(null, CC.capabilities)).toBe(NO_ACTOR)
    expect(confirmTierReason(CC.actor, CC.capabilities)).toBeNull()
  })
})

describe('Refining', () => {
  it('draws the candidate with its DoR gap verbatim, the risk chip, the owner ring and refine-in-place; the deferral with its pointer line', () => {
    const onOpen = vi.fn()
    render(<Refining rows={BOARD_ROWS} readiness={READINESS} roster={ROSTER.people} actor={CC.actor} capabilities={CC.capabilities} afterSprint="S08" onOpen={onOpen} onConfirmTier={vi.fn()} />)
    expect(screen.getByText('Refining · for the sprint after S08')).toBeTruthy()
    const row = screen.getByTestId('refining-row')
    expect(row.getAttribute('data-spec')).toBe('0012')
    expect(within(row).getByTestId('refining-gaps').textContent).toContain('## Scope Out: missing')
    expect(row.querySelector('[data-dor]')?.textContent).toBe('NOT READY')
    expect(row.querySelectorAll('[data-person][data-you]')).toHaveLength(1)
    fireEvent.click(within(row).getByRole('button', { name: /refine in place/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ spec: '0012' }))
    const deferred = screen.getByTestId('refining-deferred')
    expect(deferred.textContent).toContain('0013')
    expect(deferred.textContent).toContain(DEFERRED_REASON_RECORDED)
  })

  it('Confirm tier runs the callback with the row and shows the plugin\'s message', async () => {
    const onConfirmTier = vi.fn().mockResolvedValue({ ok: true, changed: false, message: 'risk LOW already confirmed by @arjun-m' })
    render(<Refining rows={BOARD_ROWS} readiness={READINESS} roster={ROSTER.people} actor={CC.actor} capabilities={CC.capabilities} afterSprint="S08" onOpen={vi.fn()} onConfirmTier={onConfirmTier} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm tier' }))
    await waitFor(() => expect(onConfirmTier).toHaveBeenCalledWith(expect.objectContaining({ spec: '0012' })))
    expect((await screen.findByTestId('confirm-tier-result')).textContent).toContain('already confirmed by @arjun-m')
  })

  it('without confirm-tier the column header says so and the button is disabled with that reason; without readiness-all the DoR chip names the capability', () => {
    render(<Refining rows={BOARD_ROWS} readiness={null} roster={ROSTER.people} actor={CC.actor} capabilities={['sprint-status']} afterSprint={null} onOpen={vi.fn()} />)
    expect(screen.getAllByText(TIER_CONFIRMATION_ARRIVES).length).toBeGreaterThan(0)
    const button = screen.getByRole('button', { name: /Confirm tier/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.querySelector('[data-disabled-reason]')?.textContent).toBe(TIER_CONFIRMATION_ARRIVES)
    expect(screen.getByTestId('refining-row').querySelector('[data-dor]')?.textContent).toBe(newerPlugin('readiness-all'))
  })

  it('nothing to refine → the backlog figure and the plugin-shaped sentence', () => {
    render(<Refining rows={[]} readiness={null} roster={null} actor={null} capabilities={[]} afterSprint={null} onOpen={vi.fn()} />)
    expect(screen.getByTestId('refining-empty').textContent).toContain('no candidate for the next sprint')
    expect(document.querySelector('[data-cc-figure="backlog-empty"]')).toBeTruthy()
  })
})
