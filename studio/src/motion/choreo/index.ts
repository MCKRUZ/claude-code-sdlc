// The §4.2 catalogue, one export per row, in row order. A screen imports the row it needs from
// here; `CATALOGUE` lets a test assert every row exists and returns a completed timeline when
// handed a disabled context.
export { timelineFor, contextFrom, fadeDuration, transformsAllowed, placeholderRow } from './_shared'
export { welcomeOpen, type WelcomeOpenRefs } from './welcomeOpen' // #1
export { frameAssemble, type FrameAssembleRefs } from './frameAssemble' // #2
export { screenEnter, type ScreenEnterRefs } from './screenEnter' // #3
export { listStagger, type ListStaggerRefs } from './listStagger' // #4
export { skeletonSwap, type SkeletonSwapRefs } from './skeletonSwap' // #5
export { boardRegroup, type BoardRegroupRefs } from './boardRegroup' // #6
export { segmentedThumb, type SegmentedThumbRefs } from './segmentedThumb' // #7
export { sharedElement, type SharedElementRefs } from './sharedElement' // #8
export { sidebarProgress, type SidebarProgressRefs } from './sidebarProgress' // #9
export { signOffCeremony, CEREMONY_SPINE_LABEL, type SignOffCeremonyRefs } from './signOffCeremony' // #10
export { counters, type CountersRefs } from './counters' // #11
export { toasts, toastRail, type ToastRefs, type ToastRailRefs } from './toasts' // #12
export { chatMessage, typingDots, type ChatMessageRefs, type TypingDotsRefs } from './chatMessage' // #13
export { questionPills, proposalResolve, type QuestionPillsRefs, type ProposalResolveRefs } from './questionPills' // #14
export { dialog, type DialogRefs } from './dialog' // #15
export { openingOverlay, type OpeningOverlayRefs } from './openingOverlay' // #16
export { hoverPlate, HOVER_INTENT_MS, type HoverPlateRefs } from './hoverPlate' // #17
export { constellationSettle, constellationHoverDim, type ConstellationSettleRefs, type HoverDimRefs } from './constellationSettle' // #18
export { spineParallax, PARALLAX_MAX_RAD, type SpineParallaxRefs } from './spineParallax' // #19
export { consoleToggle, consoleRowExpand, CONSOLE_HEIGHT_PX, type ConsoleToggleRefs, type ConsoleRowRefs } from './consoleToggle' // #20
export { findingFocus, type FindingFocusRefs } from './findingFocus' // #21
export { clashResolve, type ClashResolveRefs } from './clashResolve' // #22
export { syncChip, type SyncChipRefs } from './syncChip' // #23
export { resizeHandle } from './resizeHandle' // #24
export { themeChange, THEME_SWITCHING_CLASS, type ThemeChangeRefs } from './themeChange' // #25
// Round 2 rows. The ref types are frozen in `../contract`; the files are P0 placeholders until
// their owners (P2 / P3 / P4 / P4) replace the contents, keeping these names.
export { handoffCeremony, type HandoffCeremonyRefs } from './handoffCeremony' // #26
export { edgeDraw, type EdgeDrawRefs } from './edgeDraw' // #27
export { spineCollapse, type SpineCollapseRefs } from './spineCollapse' // #28
export { sceneCrossfade, type SceneCrossfadeRefs } from './sceneCrossfade' // #29
// Command-center rows (togo-command-center.md §4). P0 placeholders with frozen names, ref shapes
// and gates; P5 (#30, #31) and P4 (#32) replace the bodies.
export { batonPass, batonPassDue, type BatonPassRefs } from './batonPass' // #30
export { verdictSeal, verdictSealDraws, type VerdictSealRefs } from './verdictSeal' // #31
export { stripDraw, stripDrawPlays, type StripDrawRefs } from './stripDraw' // #32

import type { Choreo } from '../contract'
import { welcomeOpen } from './welcomeOpen'
import { frameAssemble } from './frameAssemble'
import { screenEnter } from './screenEnter'
import { listStagger } from './listStagger'
import { skeletonSwap } from './skeletonSwap'
import { boardRegroup } from './boardRegroup'
import { segmentedThumb } from './segmentedThumb'
import { sharedElement } from './sharedElement'
import { sidebarProgress } from './sidebarProgress'
import { signOffCeremony } from './signOffCeremony'
import { counters } from './counters'
import { toasts } from './toasts'
import { chatMessage } from './chatMessage'
import { questionPills } from './questionPills'
import { dialog } from './dialog'
import { openingOverlay } from './openingOverlay'
import { hoverPlate } from './hoverPlate'
import { constellationSettle } from './constellationSettle'
import { spineParallax } from './spineParallax'
import { consoleToggle } from './consoleToggle'
import { findingFocus } from './findingFocus'
import { clashResolve } from './clashResolve'
import { syncChip } from './syncChip'
import { resizeHandle } from './resizeHandle'
import { themeChange } from './themeChange'
import { handoffCeremony } from './handoffCeremony'
import { edgeDraw } from './edgeDraw'
import { spineCollapse } from './spineCollapse'
import { sceneCrossfade } from './sceneCrossfade'
import { batonPass } from './batonPass'
import { verdictSeal } from './verdictSeal'
import { stripDraw } from './stripDraw'

/** The number of rows, asserted once in `test/motion/catalogue.test.ts`: §4.2's 25, the four
 * round-2 rows (#26 hand-off, #27 edge draw, #28 spine collapse, #29 scene crossfade) and the
 * three command-center rows (#30 baton pass, #31 verdict seal, #32 strip draw — the one recorded
 * pin change of togo-command-center.md §8). */
export const CATALOGUE_ROWS = 32

/** Row number → the row's primary choreography, in row order. */
export const CATALOGUE: ReadonlyArray<Choreo<never>> = [
  welcomeOpen, frameAssemble, screenEnter, listStagger, skeletonSwap, boardRegroup, segmentedThumb,
  sharedElement, sidebarProgress, signOffCeremony, counters, toasts, chatMessage, questionPills, dialog,
  openingOverlay, hoverPlate, constellationSettle, spineParallax, consoleToggle, findingFocus,
  clashResolve, syncChip, resizeHandle, themeChange,
  handoffCeremony, edgeDraw, spineCollapse, sceneCrossfade,
  batonPass, verdictSeal, stripDraw,
] as ReadonlyArray<Choreo<never>>
