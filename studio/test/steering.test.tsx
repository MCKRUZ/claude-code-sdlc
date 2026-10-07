// @vitest-environment jsdom
/** Steering mode (togo-command-center.md §3.5, §7 P6 acceptance): read-only — zero
 * `button[data-write]`, no `<input>`, no forbidden metric word in the DOM; every number names its
 * field; "no data" is words; the Depth lockup is present; Esc leaves; the review page and the
 * narrative companions open read-only; the lazy chunk resolves. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Scorecard } from '../shared/types'
import { FORBIDDEN_METRIC_WORDS } from '../shared/reasons'
import { companionsFor, fieldPieces, PAGE_CLASS, PAGES_CLASS, SteeringMode, TILE_GRID_CLASS } from '../src/components/SteeringMode'

const CARD: Scorecard = {
  accepted_as_is_rate: 0.72, review_wait_median_hours: 5.3, security_review_wait_median_hours: null, rework_revert_rate: null, bounce_back_rate: null,
  escaped_bugs: [], dora: { deploy_count: 3, lead_time_median_hours: null, change_fail_rate: null, time_to_recover_median_hours: null }, totals: { merges: 4, reverts: 0, bounces: 0 },
}
const DOCS = [
  { name: 'build-handoff.md', path: '.sdlc/artifacts/build/build-handoff.md', exists: true, folder: false, shaped: true, findingCount: 0, ready: true },
  { name: 'cadence-plan.md', path: '.sdlc/artifacts/build/cadence-plan.md', exists: true, folder: false, shaped: true, findingCount: 0, ready: true },
  { name: 'adrs', path: '.sdlc/artifacts/build/adrs', exists: true, folder: true, shaped: false, findingCount: 0, ready: true },
]
const COVERAGE = { ok: true, hasData: true, notes: [], withNarrative: 1, total: 2, artifacts: [{ name: 'build-handoff.md', status: 'present' as const, stale: false }, { name: 'cadence-plan.md', status: 'none' as const, stale: null }] }

function install(over: Record<string, unknown> = {}) {
  const studio = {
    getScorecard: vi.fn().mockResolvedValue(CARD),
    getStageReadiness: vi.fn().mockResolvedValue({ ok: true, stageId: 'build', documents: DOCS }),
    getNarrativeCoverage: vi.fn().mockResolvedValue(COVERAGE),
    openReport: vi.fn().mockResolvedValue({ ok: true }),
    openDocument: vi.fn().mockResolvedValue({ ok: true, path: '.sdlc/artifacts/build/build-handoff.narrative.md', shaped: false, warnings: [], sections: [{ kind: 'free_text', key: 'free_text@0', heading: '', start: 0, end: 10, text: '# For the committee\n\nThe loop shipped the export rail.', fields: {} }] }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}
afterEach(() => { cleanup(); delete (window as { studio?: unknown }).studio })

async function renderSteering(sprintId: string | null = 'S08') {
  const onExit = vi.fn()
  render(<SteeringMode projectPath="/p" sprintId={sprintId} onExit={onExit} />)
  await screen.findByTestId('steering-tiles')
  return { onExit }
}

describe('SteeringMode', () => {
  it('is read-only: zero data-write controls, no <input>, no forbidden metric word; the Depth lockup is there', async () => {
    install(); await renderSteering()
    const root = screen.getByTestId('steering-mode')
    expect(root.querySelectorAll('button[data-write]')).toHaveLength(0)
    expect(root.querySelectorAll('input, textarea')).toHaveLength(0)
    expect(root.textContent ?? '').not.toMatch(FORBIDDEN_METRIC_WORDS)
    expect(root.querySelector('[data-steering-lockup]')).toBeTruthy()
    expect(root.querySelector('[data-steering-lockup] svg')).toBeTruthy()
    expect(root.className).toContain('bg-steer-bg')
  })

  it('every number names its field; "no data" is words with no digit; the sprint id is shown', async () => {
    install(); await renderSteering()
    const tiles = screen.getByTestId('steering-tiles')
    expect(tiles.querySelector('[data-steer-tile="accepted"] [data-stat="accepted_as_is_rate"]')?.textContent).toBe('72%')
    expect(tiles.querySelector('[data-steer-tile="review-wait"] [data-stat="review_wait_median_hours"]')?.textContent).toBe('5.3h')
    expect(tiles.querySelector('[data-steer-tile="dora.deploys"] [data-stat="dora.deploy_count"]')?.textContent).toBe('3')
    const security = tiles.querySelector('[data-steer-tile="security-wait"]')!
    expect(security.querySelector('[data-no-data]')?.textContent).toBe('no data')
    expect(security.querySelector('[data-stat]')).toBeNull()
    expect(security.textContent).toContain('security_review_wait_median_hours')
    // v15: the script and verb are said once under the title; every tile still carries its field.
    for (const tile of tiles.querySelectorAll('[data-steer-tile]')) expect(tile.querySelector('[data-field-name]')).toBeTruthy()
    expect(tiles.querySelector('[data-steer-tile="escaped-bugs"]')?.textContent).toContain('none recorded in this window')
    expect(tiles.querySelectorAll('[data-stat]')).toHaveLength(3)
    expect(screen.getByTestId('steering-sprint').textContent).toBe('S08')
    // Two labelled rows: the outcomes, then the DORA four with the escaped bugs; the full source
    // line once under the intro (never inline), every provenance line allowed to wrap, not clip.
    const groups = Array.from(tiles.querySelectorAll('[data-steer-group]')).map((g) => g.getAttribute('data-steer-group'))
    expect(groups).toEqual(['outcomes', 'delivery'])
    expect(tiles.querySelector('[data-steer-group="delivery"] [data-steer-tile="escaped-bugs"]')).not.toBeNull()
    expect(tiles.querySelector('[data-steer-group="delivery"] [data-steer-tile="dora.deploys"]')).not.toBeNull()
    expect(screen.getByTestId('steering-source').textContent).toBe('scorecard.py report --window-days 14 --json')
    for (const src of tiles.querySelectorAll('[aria-label="source"]')) expect(src.className).toContain('[overflow-wrap:anywhere]')
    // A rate names the plugin's own base beneath it, so a measured number is traceable to its count.
    expect(tiles.querySelector('[data-steer-tile="accepted"] [data-denominator="totals.merges"]')?.textContent).toBe('of 4 merged')
    // The room has no Leave button of its own: the shell's band carries the one way out, Esc is announced.
    expect(screen.queryByRole('button', { name: /Leave steering/ })).toBeNull()
  })

  it('Esc leaves; the review page opens by its sprint id through openReport; the companion opens read-only and Esc closes it first', async () => {
    const studio = install()
    const { onExit } = await renderSteering()
    fireEvent.click(screen.getByRole('button', { name: 'Open the review page' }))
    await waitFor(() => expect(studio.openReport).toHaveBeenCalledWith('/p', '.sdlc/reports/sprint-S08-review.html'))
    fireEvent.click(await screen.findByRole('button', { name: 'build-handoff narrative' }))
    const article = await screen.findByTestId('steering-companion')
    expect(studio.openDocument).toHaveBeenCalledWith('/p', '.sdlc/artifacts/build/build-handoff.narrative.md')
    expect(within(article).getByText('The loop shipped the export rail.')).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('steering-companion')).toBeNull())
    expect(onExit).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('no sprint → the review button is disabled with "no data"; an unreadable scorecard is said, not zeroed; companions are the plugin\'s "present" only', async () => {
    install({ getScorecard: vi.fn().mockResolvedValue(null) })
    render(<SteeringMode projectPath="/p" sprintId={null} onExit={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read')
    expect(document.querySelectorAll('[data-stat]')).toHaveLength(0)
    expect(companionsFor(DOCS, COVERAGE)).toEqual([{ name: 'build-handoff.md', path: '.sdlc/artifacts/build/build-handoff.narrative.md' }])
    expect(companionsFor(DOCS, null)).toEqual([])
    cleanup()
    install({ getNarrativeCoverage: vi.fn().mockResolvedValue({ ...COVERAGE, artifacts: [] }) })
    await renderSteering(null)
    const review = screen.getByRole('button', { name: /^Open the review page/ }) as HTMLButtonElement
    expect(review.disabled).toBe(true)
    expect(review.getAttribute('title')).toBe('no data')
    expect(screen.getByTestId('no-companions')).toBeTruthy()
  })

  /** v15 (owner's note): the room is ONE board — Outcomes, Delivery and the actions on the first
   * page, sized to fit 1440×900 — because paging Delivery onto a second screen left room under
   * Outcomes and hid half the standard behind a scroll. The pages container stays the one
   * scroller (`snap-y snap-mandatory`); a companion still opens as its own page. */
  it('one board holds both rows and the actions; a companion opens as a second page', async () => {
    const studio = install(); await renderSteering()
    const root = screen.getByTestId('steering-mode')
    expect(root.className).toContain('h-full')
    expect(root.className).not.toContain('overflow-y-auto')
    const pages = root.querySelector('[data-steer-pages]') as HTMLElement
    expect(pages.className).toBe(PAGES_CLASS)
    expect(PAGES_CLASS).toContain('snap-y')
    expect(PAGES_CLASS).toContain('overflow-y-auto')
    expect(pages.getAttribute('data-testid')).toBe('steering-tiles')
    const pageIds = () => Array.from(pages.querySelectorAll('[data-steer-page]')).map((p) => p.getAttribute('data-steer-page'))
    expect(pageIds()).toEqual(['board'])
    const board = pages.querySelector('[data-steer-page="board"]') as HTMLElement
    expect(board.className).toBe(PAGE_CLASS)
    expect(board.className).toContain('snap-start')
    expect(board.querySelector('[data-steering-lockup]')).toBeTruthy()
    expect(board.querySelector('[data-testid="steering-source"]')).toBeTruthy()
    expect(board.querySelector('[data-steer-group="outcomes"]')).toBeTruthy()
    expect(board.querySelector('[data-steer-group="delivery"]')).toBeTruthy()
    expect(board.querySelector('[data-steer-actions]')).toBeTruthy()
    expect(within(board).getByRole('button', { name: 'Open the review page' })).toBeTruthy()
    // The script and verb are said once under the title; a tile carries its field alone.
    const sources = Array.from(board.querySelectorAll('[aria-label="source"]')).map((n) => n.textContent ?? '')
    expect(sources.length).toBeGreaterThan(0)
    for (const s of sources) expect(s).not.toContain('scorecard.py')
    fireEvent.click(await screen.findByRole('button', { name: 'build-handoff narrative' }))
    await screen.findByTestId('steering-companion')
    expect(studio.openDocument).toHaveBeenCalled()
    expect(pageIds()).toEqual(['board', 'companion'])
  })

  it('the lazy chunk resolves', async () => {
    const mod = await import('../src/components/SteeringMode')
    expect(mod.default).toBe(mod.SteeringMode)
  })

  /** v12 critique #4: a committee view never truncates meaning. The "produces" sentence is set in
   * full, the field name sits on its own mono line breaking at its own seams first, the grid is
   * 3 across from 1280 and 5 from 1440 (so ≥ 1600 is five), and every number is tabular. */
  it('tiles set the description in full, the field on its own breakable mono line, on a 2 / 3 / 5 grid with tabular numbers', async () => {
    install(); await renderSteering()
    const tiles = screen.getByTestId('steering-tiles')
    for (const grid of tiles.querySelectorAll('[data-steer-grid]')) {
      expect(grid.className).toBe(TILE_GRID_CLASS)
      expect(grid.className).toContain('min-[1280px]:grid-cols-3')
      expect(grid.className).toContain('min-[1440px]:grid-cols-5')
      expect(grid.className).not.toContain('auto-fit')
    }
    for (const tile of tiles.querySelectorAll('[data-steer-tile]')) {
      const produces = tile.querySelector('[data-produces]') as HTMLElement
      expect(produces.className).not.toMatch(/line-clamp/)
      expect(produces.className).toContain('text-[17px]') // v15 compact tile: the sentence at 17/24, still in full, never clamped
      expect(produces.textContent!.length).toBeGreaterThan(10)
      // The field name: its own line, the full name as text (the <wbr> seams carry no characters).
      const field = tile.querySelector('[data-field-name]') as HTMLElement
      expect(field.className).toContain('block')
      expect(field.textContent).toBe(field.getAttribute('data-field-name'))
      expect(field.closest('[aria-label="source"]')?.className).toContain('font-mono')
      // The script line and the field line are two lines, not one joined by " · ".
      expect(tile.querySelector('[aria-label="source"]')?.textContent).not.toContain(' · ')
    }
    expect(tiles.querySelector('[data-steer-tile="security-wait"] [data-field-name]')?.querySelectorAll('wbr').length).toBe(4)
    for (const stat of tiles.querySelectorAll('[data-stat]')) expect(stat.className).toContain('tabular-nums')
    // The seams: after each `_` and `.`, the pieces rejoin to the field byte-for-byte.
    expect(fieldPieces('security_review_wait_median_hours')).toEqual(['security_', 'review_', 'wait_', 'median_', 'hours'])
    expect(fieldPieces('dora.deploy_count')).toEqual(['dora.', 'deploy_', 'count'])
    expect(fieldPieces('escaped_bugs[]').join('')).toBe('escaped_bugs[]')
  })
})
