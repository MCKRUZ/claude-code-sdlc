// @vitest-environment jsdom
/** The cockpit's geometry without a layout engine (owner's v12 item 1). jsdom lays nothing out,
 * so the pixel truth is Q5's overlap probe (`test/e2e/cc/overlap.spec.ts`, "cockpit rules"); what
 * THIS test holds is (a) the arithmetic — at a 1440×900 window the home is 1352 px wide and Today
 * takes its 300 px rail beside four lanes of ≥ 220 px, the cockpit row ends 24 px above the fold
 * and the band below starts under it; at 1280×800 it is 1192 px and Today becomes the strip above
 * four full-width lanes — and (b) that the literal container-query classes SprintHome and
 * LaneBoard spell are exactly those numbers, so the arithmetic and the CSS cannot drift apart. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COCKPIT_ROW_CLASS, SprintHome, TODAY_RAIL_CLASS, TODAY_SCROLL_MASK_CLASS, TODAY_STRIP_CLASS } from '../src/components/SprintHome'
import { LANE_MAX_HEIGHT_CLASS } from '../src/components/lanes/LaneBoard'
import {
  BELOW_FOLD_GAP_PX, belowFoldTopFor, CHAT_RAIL_PX, COCKPIT_CHROME_PX, COCKPIT_CHROME_WITH_STRIP_PX, COCKPIT_MIN_PX, COCKPIT_TOP_PX, cockpitBottomFor,
  cockpitChromeFor, cockpitRowFor, FILTER_ROW_PX, homeWidthFor, LANE_FLOOR_PX, LANE_MIN_PX, LANES_FOUR_ACROSS_PX, lanesBranch, lanesWidthFor,
  laneWidthFor, MAIN_PADDING_PX, RAIL_THRESHOLD_PX, RAIL_WIDTH_PX, STRIP_GAP_PX, STRIP_MAX_PX, stripLaneHeightFor, todayBranch,
} from '../src/components/lanes/cockpitLayout'
import { CHAT_RAIL_WIDTH } from '../src/stores/chatStore'
import { resetRoomStore } from '../src/stores/roomStore'
import { CC, withCc } from './sprintHomeFixture'

afterEach(() => {
  cleanup()
  resetRoomStore()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

/** A window stub: the only thing the arithmetic reads from the window is its width. */
function windowStub(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  return { width, height, home: homeWidthFor(width) }
}

async function mountHome(doc = CC) {
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = {
    getCommandCenter: vi.fn().mockResolvedValue(doc),
    getReadinessAll: vi.fn().mockResolvedValue({ ok: true, specs: [] }),
    runSprintVerb: vi.fn(), decideDecision: vi.fn(), confirmTier: vi.fn(),
  }
  render(<SprintHome projectPath="/p" onOpenSpec={vi.fn()} onNewSprint={vi.fn()} />)
  await screen.findByTestId('sprint-home')
  return {
    home: screen.getByTestId('sprint-home'),
    grid: document.querySelector('[data-home-grid]') as HTMLElement,
    today: screen.getByTestId('today'),
    lanesGrid: document.querySelector('[data-lanes-grid]') as HTMLElement | null,
    lane: screen.queryByTestId('lane-ready'),
  }
}

describe('the arithmetic', () => {
  it('derives the thresholds from the visual direction\'s numbers: 916 for four across, 1240 for the rail', () => {
    expect(LANES_FOUR_ACROSS_PX).toBe(4 * LANE_MIN_PX + 3 * 12)
    expect(LANES_FOUR_ACROSS_PX).toBe(916)
    expect(RAIL_THRESHOLD_PX).toBe(916 + 24 + RAIL_WIDTH_PX)
    expect(RAIL_THRESHOLD_PX).toBe(1240)
    expect(RAIL_WIDTH_PX).toBe(300)
    expect(CHAT_RAIL_PX).toBe(CHAT_RAIL_WIDTH)
  })

  it('the chrome is the grid\'s top plus what each branch puts between it and the fold: 396 for the rail, 572 under the strip', () => {
    expect(COCKPIT_CHROME_PX).toBe(COCKPIT_TOP_PX + MAIN_PADDING_PX)
    expect(COCKPIT_CHROME_PX).toBe(396)
    expect(STRIP_MAX_PX).toBe(120)
    expect(STRIP_GAP_PX).toBe(16)
    expect(COCKPIT_CHROME_WITH_STRIP_PX).toBe(COCKPIT_TOP_PX + STRIP_MAX_PX + STRIP_GAP_PX + FILTER_ROW_PX + MAIN_PADDING_PX)
    expect(COCKPIT_CHROME_WITH_STRIP_PX).toBe(572)
    expect(cockpitChromeFor(1352)).toBe(COCKPIT_CHROME_PX)
    expect(cockpitChromeFor(1192)).toBe(COCKPIT_CHROME_WITH_STRIP_PX)
    // A wrapped header moves the grid down; the chrome follows it by the same amount.
    expect(cockpitChromeFor(1352, COCKPIT_TOP_PX + 20)).toBe(COCKPIT_CHROME_PX + 20)
  })

  it('1440×900: the home is 1352 wide, Today is the rail, four lanes of 248 px; the cockpit ends 24 px above the fold and the band starts under it', () => {
    const w = windowStub(1440, 900)
    expect(w.home).toBe(1352)
    expect(todayBranch(w.home)).toBe('rail')
    const lanes = lanesWidthFor(w.home)
    expect(lanes).toBe(1028)
    expect(lanesBranch(lanes)).toBe('four-across')
    expect(laneWidthFor(lanes)).toBe(248)
    expect(laneWidthFor(lanes)).toBeGreaterThanOrEqual(LANE_MIN_PX)
    // v13 fixer round: the row is `100dvh − chrome` → 504; wells and rail end at 876 = 900 − 24.
    expect(cockpitRowFor(900)).toBe(504)
    expect(cockpitBottomFor(900)).toBe(900 - MAIN_PADDING_PX)
    expect(belowFoldTopFor(900)).toBe(876 + BELOW_FOLD_GAP_PX)
    expect(belowFoldTopFor(900)).toBeGreaterThanOrEqual(900)
    // 1680×1000: the same promise.
    expect(cockpitBottomFor(1000)).toBe(976)
    expect(belowFoldTopFor(1000)).toBeGreaterThanOrEqual(1000)
    // The floor: a very short window gives up the fold rather than a well with no card in it.
    expect(cockpitRowFor(500)).toBe(COCKPIT_MIN_PX)
  })

  it('1280×800: the home is 1192 wide, Today is the strip above, four full-width lanes of 289 px, wells on screen', () => {
    const w = windowStub(1280, 800)
    expect(w.home).toBe(1192)
    expect(todayBranch(w.home)).toBe('strip')
    const lanes = lanesWidthFor(w.home)
    expect(lanes).toBe(1192)
    expect(lanesBranch(lanes)).toBe('four-across')
    expect(laneWidthFor(lanes)).toBe(289)
    // Why not the owner's 1180: beside a 300 px rail at 1192 the lanes would be 205 px, under the floor.
    expect(laneWidthFor(1192 - 24 - RAIL_WIDTH_PX)).toBeLessThan(LANE_MIN_PX)
    // The wells: 800 − 572 = 228 → the 240 floor → they end at 548 + 240 = 788, on screen (≤ 800).
    expect(stripLaneHeightFor(800)).toBe(LANE_FLOOR_PX)
    expect(COCKPIT_TOP_PX + STRIP_MAX_PX + STRIP_GAP_PX + FILTER_ROW_PX + stripLaneHeightFor(800)).toBeLessThanOrEqual(800)
  })

  it('the rail branch never squeezes a lane under 220 px: at the threshold exactly, each lane is 220', () => {
    expect(laneWidthFor(lanesWidthFor(RAIL_THRESHOLD_PX))).toBe(LANE_MIN_PX)
    expect(todayBranch(RAIL_THRESHOLD_PX - 1)).toBe('strip')
    expect(lanesBranch(LANES_FOUR_ACROSS_PX - 1)).toBe('two-by-two')
  })
})

describe('the classes SprintHome and LaneBoard spell are those numbers', () => {
  it('1440×900 → the rail branch: the grid is the cockpit row, Today and the lanes fill it, the lanes carry the 916 query', async () => {
    windowStub(1440, 900)
    const { home, grid, today, lanesGrid, lane } = await mountHome()
    expect(grid.className).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:grid-cols-[minmax(0,1fr)_${RAIL_WIDTH_PX}px]`)
    expect(today.className).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:order-1`)
    expect(today.className).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:grid-cols-1`)
    expect(lanesGrid!.className).toContain(`@min-[${LANES_FOUR_ACROSS_PX}px]:grid-cols-4`)
    expect(home.className).toContain('@container')
    // The chrome variable sits on the home GRID, a child of the container, never on the
    // `@container` root itself — a container query measures an ancestor container.
    expect(home.className).not.toContain('--cockpit-chrome')
    expect(grid.className).toContain(`[--cockpit-chrome:${COCKPIT_CHROME_PX}px]`)
    // v13 fixer round: the grid's row IS the cockpit — `100dvh − chrome`, floor 280 — so the wells
    // and the rail (both grid items, both `min-h-0` scrollers) end on one line, 24 px above the fold.
    expect(grid.className).toContain(COCKPIT_ROW_CLASS)
    expect(COCKPIT_ROW_CLASS).toBe(`@min-[${RAIL_THRESHOLD_PX}px]:grid-rows-[max(${COCKPIT_MIN_PX}px,calc(100dvh-var(--cockpit-chrome,${COCKPIT_CHROME_PX}px)))]`)
    expect(today.className).toContain(TODAY_RAIL_CLASS)
    expect(TODAY_RAIL_CLASS).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:min-h-0`)
    expect(TODAY_RAIL_CLASS).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:overflow-y-auto`)
    expect(today.className).not.toContain('max-h-[max(')
    // The lanes wrapper hands the row's height down: a flex column whose board takes the rest.
    const wrapper = lanesGrid!.closest('[data-testid="lane-board"]')!.parentElement as HTMLElement
    expect(wrapper.className).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:flex`)
    expect(wrapper.className).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:min-h-0`)
    const board = lanesGrid!.closest('[data-testid="lane-board"]') as HTMLElement
    expect(board.className).toContain('flex-col')
    expect(board.className).toContain(`@min-[${RAIL_THRESHOLD_PX}px]:flex-1`)
    expect(lanesGrid!.className).toContain('flex-1')
    expect(lanesGrid!.className).toContain('min-h-0')
    expect(lane!.className).toContain(LANE_MAX_HEIGHT_CLASS)
    expect(LANE_MAX_HEIGHT_CLASS).toContain(`var(--cockpit-chrome,${COCKPIT_CHROME_WITH_STRIP_PX}px)`)
    expect(LANE_MAX_HEIGHT_CLASS).toContain(`max(${LANE_FLOOR_PX}px,`)
  })

  /** v14 (sprint-home@1280 shot): the strip is sized to WHOLE rows, never to a height — the
   * 120 px cap sliced rows mid-sentence and its fade read as a cut. Under the threshold there is
   * no `max-h`, no scroller and no mask; the fade stays on the RAIL, which does scroll. The
   * nominal 120 is only the chrome's first-paint default — `cockpitChromeFor` takes the measured
   * strip, so a taller strip moves the wells' cap with it. */
  it('1280×800 → the strip branch: Today sits before the lanes in DOM, uncapped and unmasked, and the chrome grows by the strip (nominal, or measured) and the filter row', async () => {
    windowStub(1280, 800)
    const { grid, today } = await mountHome()
    expect(grid.firstElementChild).toBe(today)
    expect(today.className).toContain(TODAY_STRIP_CLASS)
    expect(TODAY_STRIP_CLASS).not.toMatch(/max-h-|overflow-y-auto|overscroll|mask-image/)
    expect(today.className).not.toMatch(/@max-\[\d+px\]:(max-h-|overflow-y-auto|\[mask-image)/)
    expect(today.className).toContain('@min-[1000px]:grid-cols-4')
    // The rail's last 16 px fade (a scroller's "more below") is the rail's alone.
    expect(today.className).toContain(TODAY_SCROLL_MASK_CLASS)
    expect(TODAY_SCROLL_MASK_CLASS).toBe(`@min-[${RAIL_THRESHOLD_PX}px]:[mask-image:linear-gradient(to_bottom,#000_calc(100%-16px),transparent)]`)
    expect(grid.className).toContain(`@max-[${RAIL_THRESHOLD_PX - 1}px]:[--cockpit-chrome:${COCKPIT_CHROME_WITH_STRIP_PX}px]`)
    expect(grid.className).toContain(`@max-[${RAIL_THRESHOLD_PX - 1}px]:gap-4`)
    // The measured strip replaces the nominal in the arithmetic: a 150 px strip at 1280 → 602;
    // the rail branch ignores it; a well under a 150 px strip on a 1000 px window ends at 976.
    expect(cockpitChromeFor(1192, COCKPIT_TOP_PX, 150)).toBe(COCKPIT_TOP_PX + 150 + STRIP_GAP_PX + FILTER_ROW_PX + MAIN_PADDING_PX)
    expect(cockpitChromeFor(1192, COCKPIT_TOP_PX, 150)).toBe(602)
    expect(cockpitChromeFor(1352, COCKPIT_TOP_PX, 150)).toBe(COCKPIT_CHROME_PX)
    expect(stripLaneHeightFor(1000, COCKPIT_TOP_PX, 150)).toBe(1000 - 602)
    expect(cockpitChromeFor(1192)).toBe(COCKPIT_CHROME_WITH_STRIP_PX)
  })

  it('every lane is a scroller under a static header, and the baton overlay follows the same 916 threshold', async () => {
    windowStub(1440, 900)
    await mountHome()
    for (const id of ['ready', 'building', 'checking', 'merged']) {
      const lane = screen.getByTestId(`lane-${id}`)
      expect(lane.querySelector('header')?.className).toContain('shrink-0')
      expect(lane.querySelector('header')?.className).not.toContain('sticky')
      expect(lane.querySelector('[data-lane-scroll]')?.className).toContain('overflow-y-auto')
    }
    expect(document.querySelector('[data-baton-overlay]')?.className).toContain(`@min-[${LANES_FOUR_ACROSS_PX}px]:absolute`)
  })

  it('with no sprint the grid is a plain list well, never a cockpit row', async () => {
    windowStub(1440, 900)
    const { grid } = await mountHome(withCc({ sprint: { ...CC.sprint, data: { ...CC.sprint.data!, sprint: null } } }))
    expect(grid.className).not.toContain('grid-rows-[')
    expect(screen.getByTestId('no-sprint-rows')).toBeTruthy()
  })
})
