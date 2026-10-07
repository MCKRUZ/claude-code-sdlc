// @vitest-environment jsdom
/** The Hand off foot (togo-command-center.md §3.3, §7 P6 acceptance): disabled reason === the
 * plugin's `refusal.message`; enabled when the dry run says ok (the `would` facts shown); enabled
 * without `handoff-check` so the live refusal lands in the plugin's words; the caption is fixed. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandOffCheck, SourcedBlock } from '../shared/types'
import { CAPABILITIES, newerPlugin, ONE_SPEC_ONE_BRANCH } from '../shared/reasons'
import { DOR_BLOCKS, FOOT_STICK_CLASS, HandoffFoot, handOffDisabledReason, LIVE_DECIDES } from '../src/components/SpecCard/HandoffFoot'

const block = (data: HandOffCheck | null, error: string | null = null): SourcedBlock<HandOffCheck> => ({ source: 'handoff.py --check --json', fetchedAt: 'now', ok: data !== null, data, error })
const REFUSED = block({ ok: false, refusal: { kind: 'not_ready', message: 'Spec 0008 is not ready: ## Scope Out: missing' } })
const OK = block({ ok: true, would: { branch: 'spec/0008-claim-export', developer: '@lee-w', checker: '@priya-n', team: 'platform', inFlightAfter: 2 }, alreadyInFlight: false, host: 'github' })

afterEach(cleanup)
const button = () => screen.getByRole('button', { name: /^Hand off/ }) as HTMLButtonElement

describe('HandoffFoot', () => {
  it('a refusal disables the button with the plugin\'s sentence, verbatim', () => {
    render(<HandoffFoot check={REFUSED} status="ready" onHandOff={vi.fn()} />)
    expect(button().disabled).toBe(true)
    expect(button().getAttribute('title')).toBe('Spec 0008 is not ready: ## Scope Out: missing')
    expect(handOffDisabledReason(REFUSED, true)).toBe('Spec 0008 is not ready: ## Scope Out: missing')
    expect(screen.getByText(ONE_SPEC_ONE_BRANCH)).toBeTruthy()
    expect(button().hasAttribute('data-write')).toBe(true)
  })

  it('ok enables it and shows what the plugin would do; the click goes to the host', () => {
    const onHandOff = vi.fn()
    render(<HandoffFoot check={OK} status="ready" onHandOff={onHandOff} />)
    expect(button().disabled).toBe(false)
    expect(screen.getByTestId('handoff-would').textContent).toContain('spec/0008-claim-export · @lee-w · checker @priya-n · platform · in flight after: 2')
    fireEvent.click(button())
    expect(onHandOff).toHaveBeenCalledTimes(1)
  })

  it('without handoff-check, or with no developer named, and NOTHING blocking, the button is enabled — the live refusal decides, and the foot says so visibly', () => {
    render(<HandoffFoot check={REFUSED} hasCheckCapability={false} status="ready" onHandOff={vi.fn()} />)
    expect(button().disabled).toBe(false)
    expect(screen.getByTestId('handoff-grounds').textContent).toContain(newerPlugin(CAPABILITIES.handoffCheck))
    expect(screen.getByTestId('handoff-grounds').textContent).toContain(LIVE_DECIDES)
    expect(screen.getByTestId('handoff-grounds').className).not.toContain('sr-only')
    cleanup()
    render(<HandoffFoot check={null} status="draft" onHandOff={vi.fn()} />)
    expect(button().disabled).toBe(false)
    expect(handOffDisabledReason(block(null, 'spawn failed'), true)).toBeNull()
  })

  it('no dry run (no developer named yet) but the checker still blocks → disabled with the checker\'s first MUST line, verbatim, grounded in its source', () => {
    const lines = ['Scope > In scope is empty — a spec needs at least one In-scope item', 'Unfilled template placeholder present: <!-- REQUIRED -->']
    render(<HandoffFoot check={null} blocking={lines} readinessSource="spec_readiness.py --spec --json" status="draft" onHandOff={vi.fn()} />)
    expect(button().disabled).toBe(true)
    expect(button().getAttribute('title')).toBe(lines[0])
    const describedBy = button().getAttribute('aria-describedby')!
    expect(document.getElementById(describedBy)?.textContent).toBe(lines[0])
    expect(screen.getByTestId('handoff-grounds').textContent).toContain(DOR_BLOCKS)
    expect(screen.getByTestId('handoff-grounds').textContent).toContain('spec_readiness.py --spec --json')
    expect(handOffDisabledReason(null, true, lines)).toBe(lines[0])
    // The dry run's own answer wins over the checker's line when both exist.
    expect(handOffDisabledReason(OK, true, lines)).toBeNull()
    expect(handOffDisabledReason(REFUSED, true, lines)).toBe('Spec 0008 is not ready: ## Scope Out: missing')
  })

  /** v12 critique #3: a sliver of the spec body showed under the foot. Chromium pins a sticky box
   * to the scroll container's CONTENT edge, and `<main>` has 24 px of padding (visual §4), so the
   * foot must stick at `bottom: -24px` to sit flush with the visible edge (measured in this
   * Electron: `bottom:0` → 24 px short; `bottom:-24px` → flush). The foot is opaque `surface-1`. */
  it('sticks flush with the scrollport — offset by the main padding it would otherwise float above — and is opaque', () => {
    render(<HandoffFoot check={REFUSED} status="ready" onHandOff={vi.fn()} />)
    const foot = screen.getByTestId('handoff-foot')
    expect(FOOT_STICK_CLASS).toBe('-bottom-6')
    expect(foot.className).toContain('sticky')
    expect(foot.className).toContain(FOOT_STICK_CLASS)
    expect(foot.className).not.toMatch(/\bbottom-0\b/)
    expect(foot.className).toContain('bg-surface-1')
    expect(foot.className).toContain('h-16')
  })

  it('an in-flight or merged spec states it instead of offering a hand-off', () => {
    render(<HandoffFoot check={null} status="in-flight" onHandOff={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^Hand off/ })).toBeNull()
    expect(screen.getByText(/already in-flight/)).toBeTruthy()
  })
})
