// @vitest-environment jsdom
/** The spec view after the Observatory pass (studio-observatory.md §7 "SpecStatusView" /
 * "SpecReadinessPanel"). The screen stays read-only by construction: the only live write controls
 * are the readiness panel's Mark ready / risk tier / Hand off, and the four sprint verbs are
 * drawn disabled with their reason until the IPC exists. board.spec's pins hold: "← Back to the
 * board", "Owns it", the selected tier carries `bg-slate-900`, the authoriser field appears only
 * after the plugin's own refusal. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpecStatusView } from '../src/components/SpecStatusView'
import { SLOT_REASON } from '../src/components/SpecFactsRail'
import { NO_ACTOR } from '../shared/reasons'
import type { BoardRow, SpecReadiness, SpecStatus } from '../shared/types'

const ROW: BoardRow = {
  spec: '0008', name: 'claim-export', path: 'specs/0008-claim-export.md', title: 'Claim export', status: 'draft',
  risk: 'MEDIUM', team: 'platform', channel: '', owner: '@sam-k', developer: '', checker: '@priya-n', branch: '',
  sprint: 'S07', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null,
}

const READY: SpecReadiness = {
  ok: true, spec: '0008', risk: 'MEDIUM', status: 'draft', ready: false,
  blocking: [{ check: 'scope-out', passed: false, severity: 'MUST', message: '## Scope Out: missing' }],
  advisory: [{ check: 'vague', passed: false, severity: 'SHOULD', message: 'acceptance check 3 is vague' }],
  passed: [{ check: 'risk', passed: true, severity: 'MUST', message: 'risk tier is valid' }],
}

const STATUS: SpecStatus = {
  spec: '0008', branch: 'spec/0008-claim-export', code_host_available: true,
  pull_request: {
    number: 12, url: 'https://x/12', state: 'OPEN', merged_at: null,
    checks: [
      { name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'grader', status: 'IN_PROGRESS', conclusion: null },
    ] as never,
    grader_ran: true,
    verdicts: [{ check: 'returns 409', covered: 'covered', reason: null }, { check: 'logs the id', covered: 'not-covered', reason: 'no test found' }] as never,
    verdict_error: null,
    security_review: { conclusion: null },
    approvals: [{ by: '@priya-n', at: '2026-10-01T10:00:00Z' }],
    waiting_on: 'waiting for CI',
  },
}

function install(over: Record<string, unknown> = {}) {
  const studio = {
    getSpecStatus: vi.fn().mockResolvedValue({ ok: true, status: STATUS }),
    getSpecReadiness: vi.fn().mockResolvedValue(READY),
    markSpecReady: vi.fn().mockResolvedValue({ ok: true }),
    setSpecRisk: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

async function renderView(row: BoardRow = ROW) {
  // Tests that need a particular answer install their own double first; the rest get the default.
  if (!(window as { studio?: unknown }).studio) install()
  const onBack = vi.fn()
  const onHandOff = vi.fn()
  render(<main><SpecStatusView projectPath="/p" row={row} onBack={onBack} onHandOff={onHandOff} /></main>)
  await screen.findByText(/Owns it/)
  return { onBack, onHandOff }
}

describe('SpecStatusView: where a change got to, read from its pull request', () => {
  it('keeps the back link and the four facts, and the title block carries the shared-element id', async () => {
    const { onBack } = await renderView()
    fireEvent.click(screen.getByRole('button', { name: '← Back to the board' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-flip-id="spec:0008"]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '0008 — Claim export' }).hasAttribute('data-page-heading')).toBe(true)
    expect(screen.getByText('Builds it').closest('div')?.textContent).toContain('nobody')
  })

  it('opens with the area eyebrow "Build · Spec <id>" directly above the heading, the id in mono — and the heading itself is exactly as it was', async () => {
    await renderView()
    const eyebrow = screen.getByTestId('spec-eyebrow')
    expect(eyebrow.textContent).toBe('Build · Spec 0008')
    // The kit's eyebrow voice (caps by CSS, ink-3); the id is an identifier, so it is mono, verbatim.
    expect(eyebrow.className).toContain('uppercase')
    expect(eyebrow.className).toContain('text-ink-3')
    expect(eyebrow.querySelector('.font-mono')?.textContent).toBe('0008')
    // Directly above the h2, inside the title block that Flips; the h2's pins hold.
    const heading = screen.getByRole('heading', { name: '0008 — Claim export' })
    expect(eyebrow.nextElementSibling).toBe(heading)
    expect(heading.tagName).toBe('H2')
    expect(heading.hasAttribute('data-page-heading')).toBe(true)
    expect(heading.getAttribute('tabindex')).toBe('-1')
    expect(heading.closest('[data-flip-id="spec:0008"]')).toBe(eyebrow.closest('[data-flip-id="spec:0008"]'))
    expect(document.querySelectorAll('input')).toHaveLength(0)
  })

  it('draws checks, grader verdicts, security review and approvals in the plugin\'s words, with a dot beside each', async () => {
    await renderView()
    await screen.findByText('Open on the code host')
    expect(screen.getByText('waiting for CI')).toBeTruthy()
    expect(screen.getByText('ci').closest('li')?.textContent).toContain('success')
    expect(screen.getByText('grader').closest('li')?.textContent).toContain('running')
    expect(screen.getByText('grader').closest('li')?.querySelector('[data-status="running"]')).toBeTruthy()
    expect(screen.getByText('no test found')).toBeTruthy()
    expect(screen.getByText('The grader advises. It never blocks a change on its own.')).toBeTruthy()
    expect(screen.getByText('still running')).toBeTruthy()
    const approvals = screen.getByRole('heading', { name: 'Approvals' }).parentElement!
    expect(within(approvals).getByText('@priya-n').textContent).toContain('2026-10-01')
  })

  it('a COMPLETED check with no conclusion reads "unknown" in neutral — never the FAILURE red (code-host-providers.md §8: null is never a false no)', async () => {
    // What ado_map.py emits for a PolicyEvaluationRecord status it does not recognise.
    const checks = [...(STATUS.pull_request!.checks as unknown[]), { name: 'policy', status: 'COMPLETED', conclusion: null }, { name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' }]
    install({ getSpecStatus: vi.fn().mockResolvedValue({ ok: true, status: { ...STATUS, pull_request: { ...STATUS.pull_request, checks } } }) })
    await renderView()
    await screen.findByText('Open on the code host')
    const policy = screen.getByText('policy').closest('li')!
    expect(policy.textContent).toContain('unknown')
    expect(policy.querySelector('[data-status="idle"]')).toBeTruthy()
    expect(policy.querySelector('[data-status="error"]')).toBeNull()
    expect(policy.innerHTML).not.toContain('status-error')
    // A conclusion the host actually wrote, and that is not a pass, still reads as an error.
    const lint = screen.getByText('lint').closest('li')!
    expect(lint.textContent).toContain('failure')
    expect(lint.querySelector('[data-status="error"]')).toBeTruthy()
    expect(lint.innerHTML).toContain('status-error')
  })

  // Re-recorded pin (togo-command-center.md §2.7 / §8 honesty check 1): the reason is now the
  // `reasons.ts` sentence `newerPlugin('sprint-write')` so the reasonsSweep accepts it — the claim
  // ("these verbs need a wired plugin") is unchanged, only its vocabulary. With a host `onVerb` and
  // an actor the slots go live and hand the verb to the dialog.
  it('the four sprint verbs are reserved: drawn, disabled, and each says why', async () => {
    await renderView()
    for (const label of ['Verdict', 'Pass next action', 'Acknowledge']) {
      const button = screen.getByRole('button', { name: new RegExp(`^${label}`) }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(button.textContent).toContain(SLOT_REASON)
    }
    // Two "Mark ready" controls: the live one in the readiness panel, and the reserved sprint verb.
    const marks = screen.getAllByRole('button', { name: /^Mark ready/ }) as HTMLButtonElement[]
    expect(marks.filter((b) => b.disabled).length).toBe(1)
    expect(marks.filter((b) => !b.disabled).length).toBe(1)
  })

  it('an unreachable code host is a claim about us, never "not started"', async () => {
    install({ getSpecStatus: vi.fn().mockResolvedValue({ ok: true, status: { ...STATUS, code_host_available: false, local_status: 'ready', error: 'gh: offline', pull_request: null } }) })
    await renderView()
    const notice = await screen.findByText('Could not reach the code host.')
    expect(notice.closest('[role="status"]')?.textContent).toContain('ready')
    expect(notice.closest('[role="status"]')?.textContent).toContain('gh: offline')
  })

  it('an in-flight spec has no readiness panel at all', async () => {
    install()
    await renderView({ ...ROW, status: 'in-flight' })
    expect(screen.queryByText('Risk tier')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Hand off$/ })).toBeNull()
  })
})

describe('SpecStatusView: the facts rail and the neighbourhood (studio-upgrade-2 S8 / I7 / M9)', () => {
  it('the rail lists the spec\'s own facts, "—" for every empty one, the status as a chip, and no <input>', async () => {
    await renderView()
    const rail = screen.getByRole('region', { name: 'Spec facts' })
    expect(rail.tagName).not.toBe('ASIDE') // a11y.spec pins exactly two asides: sidebar, then chat
    const dl = within(rail)
    expect(dl.getByText('Status').parentElement?.textContent).toContain('draft')
    expect(within(rail).getByTestId('spec-status-chip').textContent).toBe('draft')
    expect(dl.getByText('Team').parentElement?.textContent).toContain('platform')
    expect(dl.getByText('Sprint').parentElement?.textContent).toContain('S07')
    expect(dl.getByText('Path').parentElement?.textContent).toContain('specs/0008-claim-export.md')
    // Empty facts are a dash, never a blank cell.
    for (const term of ['Channel', 'Depends on', 'Next owner', 'Eng review', 'Data review', 'Branch']) {
      expect(dl.getByText(term).parentElement?.textContent).toContain('—')
    }
    expect(rail.querySelectorAll('input')).toHaveLength(0)
    // The four reserved slots live at the rail's foot, disabled, each with its reason.
    for (const label of ['Verdict', 'Pass next action', 'Acknowledge']) {
      const button = within(rail).getByRole('button', { name: new RegExp(`^${label}`) }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(button.textContent).toContain(SLOT_REASON)
    }
  })

  it('with a wired host, sprint-write and an actor the slots go live and hand the verb and the row to the dialog; no actor reads NO_ACTOR', async () => {
    install()
    const onVerb = vi.fn()
    render(<main><SpecStatusView projectPath="/p" row={ROW} onBack={vi.fn()} onHandOff={vi.fn()} capabilities={['sprint-status', 'sprint-write']} actor={{ name: '@sam-k', source: 'roster' }} onVerb={onVerb} /></main>)
    await screen.findByText(/Owns it/)
    const rail = screen.getByRole('region', { name: 'Spec facts' })
    const verdict = within(rail).getByRole('button', { name: 'Verdict' }) as HTMLButtonElement
    expect(verdict.disabled).toBe(false)
    expect(verdict.hasAttribute('data-write')).toBe(true)
    fireEvent.click(verdict)
    expect(onVerb).toHaveBeenCalledWith('verdict', ROW)
    fireEvent.click(within(rail).getByRole('button', { name: 'Pass next action' }))
    expect(onVerb).toHaveBeenLastCalledWith('handoff', ROW)
    cleanup()
    install()
    render(<main><SpecStatusView projectPath="/p" row={ROW} onBack={vi.fn()} onHandOff={vi.fn()} capabilities={['sprint-status', 'sprint-write']} actor={null} onVerb={vi.fn()} /></main>)
    await screen.findByText(/Owns it/)
    const ack = within(screen.getByRole('region', { name: 'Spec facts' })).getByRole('button', { name: /^Acknowledge/ }) as HTMLButtonElement
    expect(ack.disabled).toBe(true)
    expect(ack.getAttribute('title')).toBe(NO_ACTOR)
  })

  it('a dependsOn id is a button only when the Board has fetched that row; otherwise it says why', async () => {
    install()
    const onOpenSpec = vi.fn()
    render(<main><SpecStatusView projectPath="/p" row={{ ...ROW, dependsOn: ['0007', '0042'] }} onBack={vi.fn()} onHandOff={vi.fn()} onOpenSpec={onOpenSpec} /></main>)
    await screen.findByText(/Owns it/)
    const rail = screen.getByRole('region', { name: 'Spec facts' })
    const unknown = within(rail).getByRole('button', { name: /^0042/ }) as HTMLButtonElement
    expect(unknown.disabled).toBe(true)
    expect(unknown.textContent).toContain('Open the Board once')
    expect(screen.getByText(/Open the Board once to see this spec's neighbourhood/)).toBeTruthy()
  })

  it('M9: the hand-off ceremony plays once the refreshed row arrives in-flight with a developer — never on a deep link', async () => {
    const choreo = await import('../src/motion/choreo')
    const play = vi.spyOn(choreo.handoffCeremony, 'play')
    install()
    const { rerender } = render(<main><SpecStatusView projectPath="/p" row={ROW} onBack={vi.fn()} onHandOff={vi.fn()} /></main>)
    await screen.findByText(/Owns it/)
    expect(play).not.toHaveBeenCalled()
    rerender(<main><SpecStatusView projectPath="/p" row={{ ...ROW, status: 'in-flight', developer: '@sam-k', branch: 'spec/0008-claim-export' }} onBack={vi.fn()} onHandOff={vi.fn()} /></main>)
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    const refs = play.mock.calls[0][1]
    expect(refs.buildsCell?.textContent).toBe('@sam-k')
    expect(refs.statusChip?.textContent).toBe('in-flight')
    expect(Array.isArray(refs.prChips)).toBe(true)
    play.mockRestore()
  })
})

describe('SpecReadinessPanel: the checker\'s verdict, grouped', () => {
  it('shows what is still needed in amber, what is worth a look, and the passed checks behind a disclosure', async () => {
    install()
    await renderView()
    await screen.findByText('Still needed')
    expect(screen.getByText('1 thing still needed before this can be handed off.')).toBeTruthy()
    expect(screen.getByText('Still needed').closest('div[class*="amber"]')).toBeTruthy()
    expect(screen.getByText('## Scope Out: missing')).toBeTruthy()
    expect(screen.getByText('acceptance check 3 is vague')).toBeTruthy()
    expect(screen.getByText('1 check already passing').tagName).toBe('SUMMARY')
    expect(screen.queryByRole('button', { name: /^Hand off$/ })).toBeNull()
  })

  it('the tier is a Segmented with aria-pressed; the selected one carries bg-slate-900; raising needs no name', async () => {
    const studio = install()
    await renderView()
    await screen.findByText('Risk tier')
    const medium = screen.getByRole('button', { name: 'MEDIUM' })
    expect(medium.getAttribute('aria-pressed')).toBe('true')
    expect(medium.className).toContain('bg-slate-900')
    expect(medium.className).toContain('text-white')
    fireEvent.click(screen.getByRole('button', { name: 'HIGH' }))
    await waitFor(() => expect(studio.setSpecRisk).toHaveBeenCalledWith('/p', 'specs/0008-claim-export.md', 'HIGH', undefined))
    expect(screen.queryByLabelText(/Who authorised lowering this tier/)).toBeNull()
  })

  it('lowering is refused in the plugin\'s words; the name field appears only because of that refusal', async () => {
    const studio = install({
      setSpecRisk: vi.fn()
        .mockResolvedValueOnce({ ok: false, refusal: { kind: 'lowering_needs_authorisation', message: 'Lowering a tier needs a name.' } })
        .mockResolvedValueOnce({ ok: true }),
    })
    await renderView()
    await screen.findByText('Risk tier')
    fireEvent.click(screen.getByRole('button', { name: 'LOW' }))
    const field = await screen.findByLabelText(/Who authorised lowering this tier/)
    expect(screen.getByText('Lowering a tier needs a name.')).toBeTruthy()
    fireEvent.change(field, { target: { value: 'Matt K' } })
    fireEvent.click(screen.getByRole('button', { name: 'LOW' }))
    await waitFor(() => expect(studio.setSpecRisk).toHaveBeenLastCalledWith('/p', 'specs/0008-claim-export.md', 'LOW', 'Matt K'))
    await waitFor(() => expect(screen.queryByLabelText(/Who authorised lowering this tier/)).toBeNull())
  })

  it('a ready spec offers Hand off (brand primary) and the hand-off goes to the host', async () => {
    install({ getSpecReadiness: vi.fn().mockResolvedValue({ ...READY, ready: true, status: 'ready', blocking: [] }) })
    const { onHandOff } = await renderView()
    const handOff = await screen.findByRole('button', { name: 'Hand off' })
    expect(handOff.className).toContain('bg-brand-600')
    fireEvent.click(handOff)
    expect(onHandOff).toHaveBeenCalledTimes(1)
    expect(within(screen.getByText('Ready to hand off.').closest('div')!).queryByRole('button', { name: /^Mark ready/ })).toBeNull()
  })
})
