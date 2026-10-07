// The sprint home's geometry, in one place (owner's v12 item 1; visual §4 "Sprint home"). The
// numbers are the visual direction's — lanes ≥ 220 px, 12 px between lanes, 24 px before the
// Today rail — plus the owner's 300 px rail; the thresholds below are DERIVED from them, so the
// four lanes can never be squeezed under 220 px while Today sits beside them. Tailwind needs the
// container-query classes as literals (they are spelled in SprintHome / LaneBoard); these
// constants exist so `cockpitGeometry.test` can hold the literals to the arithmetic.
//
// v13 fixer round: the cockpit is a ROW of the home grid whose height is `100dvh − chrome`, so the
// four wells and the Today rail end on ONE line, flush with the fold minus `<main>`'s padding —
// no void under short lanes (the v13 probe measured the wells ending at 690 and the rail at 840
// on a 900 px window), and the band below starts a full 48 px under the fold, never sliced on it.
// `chrome` is measured live by `useCockpitChrome` (the grid's own top in the window); the
// constants here are the first-paint defaults and the arithmetic the test holds the CSS to.

/** A lane's floor (visual §4). */
export const LANE_MIN_PX = 220
/** Between lanes (visual §4). */
export const LANE_GAP_PX = 12
/** Before the Today rail (visual §4). */
export const RAIL_GAP_PX = 24
/** The Today rail (owner's v12: "Today as a 300 px right rail"). */
export const RAIL_WIDTH_PX = 300
/** The collapsed chat's rail (chatStore). */
export const CHAT_RAIL_PX = 40
/** `<main>`'s padding, each side (visual §4 "`<main>` padding 24"). */
export const MAIN_PADDING_PX = 24

/** The board's own width at which four lanes of ≥ 220 px fit in one row: 4 × 220 + 3 × 12. */
export const LANES_FOUR_ACROSS_PX = LANE_MIN_PX * 4 + LANE_GAP_PX * 3

/** The home's own width at which Today may take its rail beside four full lanes:
 * 916 + 24 + 300 = 1240. Under it, Today is a strip ABOVE the lanes and the lanes take the
 * whole width. (The owner wrote "under 1180"; 1180 would leave the lanes 205 px each beside a
 * 300 px rail, so the threshold is the arithmetic, recorded here.) */
export const RAIL_THRESHOLD_PX = LANES_FOUR_ACROSS_PX + RAIL_GAP_PX + RAIL_WIDTH_PX

/** Where the home grid's top sits in the window at first paint — band 48 + strip 64 + Build views
 * 32 + main padding 24 + the header block ≈ 150 + In the room 32 + gaps ≈ 22 — probe-measured at
 * 372 on both 1440×900 and 1280×800 (the header does not wrap there). The hook replaces it with
 * the live measurement; this is the default the CSS classes carry. */
export const COCKPIT_TOP_PX = 372
/** The lane board's own row above the wells: the Mine / Team / All filter (28) + its 12 px gap. */
export const FILTER_ROW_PX = 40
/** The cockpit's height floor — a well shorter than this holds less than one card under its
 * 40 px header, so the fold yields instead (and `<main>` scrolls). */
export const COCKPIT_MIN_PX = 280
/** The lane well's own floor under the strip branch's `max-h` cap (header 40 + two cards). */
export const LANE_FLOOR_PX = 240

/** RAIL branch: everything above the grid plus `<main>`'s bottom padding, so the cockpit row
 * `100dvh − chrome` ends exactly at the fold minus 24 (900 → 876; 1000 → 976). */
export const COCKPIT_CHROME_PX = COCKPIT_TOP_PX + MAIN_PADDING_PX
/** Under the rail threshold the grid's gap tightens from 24 to 16. */
export const STRIP_GAP_PX = 16
/** The Today strip's NOMINAL height ABOVE the lanes at first paint: an eyebrow row and two whole
 * 44 px rows with their 8 px gaps (the owner allowed "a compact strip"). Not a cap — v14 at
 * 1280×800 a 120 px `max-h` sliced rows mid-sentence and its fade read as a cut, so the strip is
 * now sized to whole rows (needs-you shows `TodayColumn`'s `STRIP_ROWS` and folds the rest behind
 * "N more"; the other groups fold every row) and `useCockpitChrome` measures the real strip into the arithmetic
 * (`cockpitChromeFor`'s `stripHeight`). 1280×800 budget with the nominal: 372 + 120 + 16 + the
 * filter row 40 = 548 → the wells get 800 − 572 = 228 → the 240 floor wins → they end at 788. */
export const STRIP_MAX_PX = 120
/** STRIP branch: the strip, its gap and the filter row join the chrome, so a well's `max-h`
 * (`100dvh − chrome`, floor `LANE_FLOOR_PX`) ends at the fold minus 24 when the floor allows. */
export const COCKPIT_CHROME_WITH_STRIP_PX = COCKPIT_TOP_PX + STRIP_MAX_PX + STRIP_GAP_PX + FILTER_ROW_PX + MAIN_PADDING_PX
/** The band below the cockpit (Refining · How it is going) starts this far under it: the home's
 * column gap 24 + the band's own `mt-6` 24. */
export const BELOW_FOLD_GAP_PX = 48

export type TodayBranch = 'rail' | 'strip'
export type LanesBranch = 'four-across' | 'two-by-two'

/** The home's content width for a window: minus the collapsed chat's rail and main's padding. */
export function homeWidthFor(windowWidth: number, chatWidth = CHAT_RAIL_PX): number {
  return windowWidth - chatWidth - MAIN_PADDING_PX * 2
}

export function todayBranch(homeWidth: number): TodayBranch {
  return homeWidth >= RAIL_THRESHOLD_PX ? 'rail' : 'strip'
}

/** The lane board's width under each branch: beside the rail, or the whole home. */
export function lanesWidthFor(homeWidth: number): number {
  return todayBranch(homeWidth) === 'rail' ? homeWidth - RAIL_GAP_PX - RAIL_WIDTH_PX : homeWidth
}

export function lanesBranch(lanesWidth: number): LanesBranch {
  return lanesWidth >= LANES_FOUR_ACROSS_PX ? 'four-across' : 'two-by-two'
}

/** Each lane's width when four sit across. */
export function laneWidthFor(lanesWidth: number): number {
  return (lanesWidth - LANE_GAP_PX * 3) / 4
}

/** The chrome for a home of `homeWidth` whose grid top sits at `gridTop` in the window — the one
 * number the CSS subtracts from `100dvh`. The branch decides what else sits between the grid's
 * top and the wells (the strip — its measured height when the caller has one, the nominal
 * otherwise — and the filter row), and `<main>`'s bottom padding always counts. */
export function cockpitChromeFor(homeWidth: number, gridTop: number = COCKPIT_TOP_PX, stripHeight: number = STRIP_MAX_PX): number {
  return todayBranch(homeWidth) === 'rail'
    ? gridTop + MAIN_PADDING_PX
    : gridTop + stripHeight + STRIP_GAP_PX + FILTER_ROW_PX + MAIN_PADDING_PX
}

/** RAIL branch: the cockpit row's height on a window `viewportHeight` tall — what the lanes and
 * the rail both measure, so they end on one line. */
export function cockpitRowFor(viewportHeight: number, gridTop: number = COCKPIT_TOP_PX): number {
  return Math.max(COCKPIT_MIN_PX, viewportHeight - (gridTop + MAIN_PADDING_PX))
}

/** RAIL branch: where the cockpit ends — the fold minus `<main>`'s padding while the floor allows. */
export function cockpitBottomFor(viewportHeight: number, gridTop: number = COCKPIT_TOP_PX): number {
  return gridTop + cockpitRowFor(viewportHeight, gridTop)
}

/** RAIL branch: the first line of the band below the cockpit — always under the fold. */
export function belowFoldTopFor(viewportHeight: number, gridTop: number = COCKPIT_TOP_PX): number {
  return cockpitBottomFor(viewportHeight, gridTop) + BELOW_FOLD_GAP_PX
}

/** STRIP branch: a well's height under its cap — `100dvh − chrome`, never under the floor. */
export function stripLaneHeightFor(viewportHeight: number, gridTop: number = COCKPIT_TOP_PX, stripHeight: number = STRIP_MAX_PX): number {
  return Math.max(LANE_FLOOR_PX, viewportHeight - cockpitChromeFor(RAIL_THRESHOLD_PX - 1, gridTop, stripHeight))
}
