// How familiar this person is with the Welcome screen, read through the round-2 motion contract
// (M3, `FamiliarityApi`). P2 owns `motion.ts` and adds the three methods there; this module only
// READS them through the contract's type, and treats a `motion` object that does not carry them
// yet as "first opens" — so the entry screens compile and behave before and after P2 lands.
//
// Welcome has no project, so it counts under its own key. The tier changes the Ambient field's
// arrival (a 900 ms fade with the sizes settling on the first opens; a plain 320 ms fade from the
// fourth) and the Welcome open's title treatment. A count, never a date (contract §M3).
import type { FamiliarityApi, FamiliarityTier } from '../../motion/contract'
import { motion } from '../../motion/motion'

export const WELCOME_FAMILIARITY_KEY = 'welcome'

/** Duck-typed read: `motion` is typed as `MotionApi` until P2 widens it. */
function api(): Partial<FamiliarityApi> {
  return motion as unknown as Partial<FamiliarityApi>
}

/** The tier is read once per key per session and held: the Welcome hero reads it at mount and
 * the field (a lazy chunk, mounted a beat later) must see the SAME answer, not the one after
 * `recordFamiliarityOpen` has counted this open. The next launch sees the new count. */
const held = new Map<string, FamiliarityTier>()

export function readFamiliarity(key: string = WELCOME_FAMILIARITY_KEY): FamiliarityTier {
  const kept = held.get(key)
  if (kept) return kept
  const read = api().familiarity
  let tier: FamiliarityTier = 'full'
  if (typeof read === 'function') {
    try {
      tier = read.call(motion, key)
    } catch {
      tier = 'full'
    }
  }
  held.set(key, tier)
  return tier
}

/** Test seam. */
export function resetFamiliarityCache(): void {
  held.clear()
}

/** One open per Welcome mount. A no-op until P2's `recordOpen` exists. */
export function recordFamiliarityOpen(key: string = WELCOME_FAMILIARITY_KEY): void {
  const record = api().recordOpen
  if (typeof record !== 'function') return
  try {
    record.call(motion, key)
  } catch {
    /* a counter, never a failure */
  }
}
