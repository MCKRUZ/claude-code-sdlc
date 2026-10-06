// @vitest-environment jsdom
/** §8 honesty check 1 (togo-command-center.md): "Disabled means a reason." Every command-center
 * screen is rendered against the EMPTY fixture — no sprint, no roster, no host, no decision-log,
 * no actor, the bare `sprint-status` capability — and every disabled control must carry a reason
 * that is either a `reasons.ts` sentence (`isReason`) or a sentence the plugin itself gave in the
 * fixture (a block's `error`, the sprint's `note`). The reason rides on `title` (the pointer's
 * tooltip) and, through the kit, on `aria-describedby`. Nothing here is a design assertion: the
 * sweep only reads what the screens render. Check 2 rides along: no bare `0` inside `[data-stat]`,
 * no digit inside `[data-person]`, and the forbidden metric words nowhere in the DOM. */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandCenter } from '../shared/types'
import { FORBIDDEN_METRIC_WORDS, isReason } from '../shared/reasons'
import { SprintHome } from '../src/components/SprintHome'
import { Planning } from '../src/components/planning/Planning'
import { SprintClose } from '../src/components/SprintClose'
import { SteeringMode } from '../src/components/SteeringMode'
import { EMPTY_CC } from './sprintHomeFixture'

/** Every string the plugin "said" in the fixture: a block's `error`, the sprint view's `note`. */
function pluginSentences(cc: CommandCenter): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { if (v.trim()) out.add(v.trim()) }
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk)
  }
  walk(cc)
  return out
}

const EMPTY_SCORECARD = {
  accepted_as_is_rate: null, review_wait_median_hours: null, security_review_wait_median_hours: null, rework_revert_rate: null, bounce_back_rate: null,
  escaped_bugs: [], dora: { deploy_count: 0, lead_time_median_hours: null, change_fail_rate: null, time_to_recover_median_hours: null }, totals: { merges: 0, reverts: 0, bounces: 0 },
}

function install(cc: CommandCenter = EMPTY_CC) {
  const studio = {
    getCommandCenter: vi.fn().mockResolvedValue(cc),
    getReadinessAll: vi.fn().mockResolvedValue({ ok: true, specs: [] }),
    getSlateProposal: vi.fn().mockResolvedValue(null),
    getSprintStatus: vi.fn().mockResolvedValue({ ok: false }),
    getScorecard: vi.fn().mockResolvedValue(EMPTY_SCORECARD),
    getStageReadiness: vi.fn().mockResolvedValue({ ok: true, stageId: 'build', documents: [] }),
    getNarrativeCoverage: vi.fn().mockResolvedValue(null),
    runSprintVerb: vi.fn(), decideDecision: vi.fn(), confirmTier: vi.fn(), assignRoles: vi.fn(), renderSprintReport: vi.fn(), openReport: vi.fn(), openDocument: vi.fn(),
  }
  // @ts-expect-error - partial test double
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

/** The sweep itself, over whatever is rendered. */
function sweep(container: HTMLElement, screenName: string, allowed: Set<string>) {
  const disabled = Array.from(container.querySelectorAll<HTMLElement>('button[disabled], select[disabled], input[disabled], textarea[disabled]'))
  for (const el of disabled) {
    const reason = el.getAttribute('title')?.trim() ?? ''
    const describedBy = el.getAttribute('aria-describedby')
    const described = describedBy ? describedBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ') : ''
    const text = reason || described
    expect(text, `${screenName}: disabled "${el.textContent?.trim() || el.getAttribute('aria-label')}" carries no reason`).not.toBe('')
    expect(isReason(text) || allowed.has(text), `${screenName}: "${text}" is neither a reasons.ts sentence nor a plugin message`).toBe(true)
  }
  for (const stat of Array.from(container.querySelectorAll('[data-stat]'))) {
    expect(stat.textContent ?? '', `${screenName}: a stat reads a bare 0`).not.toMatch(/\b0\b/)
  }
  for (const person of Array.from(container.querySelectorAll('[data-person]'))) {
    expect(person.textContent ?? '', `${screenName}: a digit inside a person chip`).not.toMatch(/\d/)
  }
  expect(container.textContent ?? '', `${screenName}: a forbidden metric word`).not.toMatch(FORBIDDEN_METRIC_WORDS)
  return disabled.length
}

describe('reasons sweep — every disabled control on the empty fixture carries a sanctioned reason (§8 check 1)', () => {
  const allowed = pluginSentences(EMPTY_CC)

  it('the sprint home', async () => {
    install()
    const { container } = render(<main><SprintHome projectPath="/p" onOpenSpec={vi.fn()} onNewSprint={vi.fn()} /></main>)
    await waitFor(() => expect(screen.getByTestId('sprint-home').getAttribute('aria-busy')).toBeNull())
    // The empty home has at least the disabled "New sprint" (no actor) and "Standup notes".
    expect(sweep(container, 'sprint home', allowed)).toBeGreaterThan(0)
  })

  it('planning', async () => {
    install()
    const { container } = render(<main><Planning projectPath="/p" onOpenSpec={vi.fn()} /></main>)
    await screen.findByTestId('planning')
    sweep(container, 'planning', allowed)
  })

  it('the close screen', async () => {
    install()
    const { container } = render(<main><SprintClose projectPath="/p" /></main>)
    await screen.findByTestId('sprint-close')
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    sweep(container, 'close', allowed)
  })

  it('steering mode has no disabled write and no fabricated number', async () => {
    install()
    const { container } = render(<main><SteeringMode projectPath="/p" sprintId={null} onExit={vi.fn()} /></main>)
    await screen.findByTestId('steering-tiles')
    expect(sweep(container, 'steering', allowed)).toBeGreaterThanOrEqual(0)
    expect(container.querySelectorAll('button[data-write]')).toHaveLength(0)
    expect(container.textContent).toContain('no data')
  })
})
