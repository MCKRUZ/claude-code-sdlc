// Calm by day 30 for the lanes (togo-command-center.md §4, visual §7): which first-paint motion
// a familiarity tier keeps. `full` staggers the cards in (`listStagger`, cap 12); `quiet` and
// `settled` paint them at once. The DOM after `progress(1)` is identical across tiers — a tier
// changes how a state is reached, never what it is — which `test/calm.test.tsx` holds.
import type { FamiliarityTier } from '../../motion/contract'
import { LIST_STAGGER_CAP, tierAllows } from '../../motion/presets'

export const REVEAL_SELECTOR = '[data-lane-card][data-reveal]'

/** The elements the first-paint stagger may touch under this tier: none for `quiet`/`settled`,
 * the first twelve cards for `full` (the rest paint at once, as the visual's budget says). */
export function revealTargets(root: ParentNode | null, tier: FamiliarityTier | undefined): HTMLElement[] {
  if (!root || !tierAllows(tier, 'stagger')) return []
  return Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)).slice(0, LIST_STAGGER_CAP)
}

/** The `useListReveal` key for the board: null (no stagger) unless the tier allows it. */
export function revealKeyFor(key: string | null, tier: FamiliarityTier | undefined): string | null {
  return key !== null && tierAllows(tier, 'stagger') ? key : null
}
