// Row #8 — Shared element row → detail (and Back → row). The detail's title block takes the
// state the row stashed under the same `data-flip-id` and Flips from it; `toggleClass` lets the
// CSS lift it above siblings while in flight. Nothing stashed → the detail simply appears, which
// is also the reduced / off end state.
//
// Round 2 (M4) adds the way BACK: the detail's Back handler calls `stashBack(id, title)`, which
// records the title's state under `BACK_ID` and remembers the id; the list screen plays
// `sharedElementBack` once its rows are on screen — the row with that id Flips from where the
// title was (360 ms `power3.inOut`, `absolute`, no scale), its siblings fade in over `dur-1`,
// and FOCUS moves to that row whatever the motion setting, because the opener is where the
// keyboard was. `flipStore`'s TTL means a stale stash from a visit minutes ago never replays.
import { Flip } from 'gsap/Flip'
import { gsap } from 'gsap'
import type { Choreo } from '../contract'
import { flipStore } from '../flipStore'
import { FLIP_SHARED } from '../presets'
import { timelineFor } from './_shared'

export interface SharedElementRefs {
  id: string
  target: Element | null
  /** Receives the element that opened this detail (the Board row, the slate link), so the detail
   * can hand it back on the way out. Called even when motion is off — the stash is consumed. */
  onOpener?: (opener: HTMLElement | null) => void
}

export const sharedElement: Choreo<SharedElementRefs> = {
  name: 'sharedElement',
  play(ctx, refs) {
    // Always consume the stash, even when disabled, so it cannot replay on a later visit.
    const stashed = flipStore.take(refs.id)
    refs.onOpener?.(stashed?.opener ?? null)
    if (!ctx.enabled || ctx.reduced || !stashed || !refs.target) return timelineFor(ctx)
    const tl = Flip.from(stashed.state, {
      targets: refs.target,
      ...FLIP_SHARED,
      toggleClass: 'is-flipping',
    })
    if (ctx.parent) ctx.parent.add(tl, ctx.parentLabel)
    return tl
  },
}

// --- the way back (M4) --------------------------------------------------------------------------

/** The one stash key for "a detail is on its way back to its row". */
export const BACK_ID = 'spec:back'

/** The id the pending Back belongs to; the state itself lives in `flipStore` under `BACK_ID`
 * (and expires with it). Module-level because the two screens never mount together. */
let pendingBackId: string | null = null

/** Called by the detail's Back handler BEFORE it navigates: records where the title is now so
 * the row it returns to can Flip from there. `title` null (nothing to measure) still records the
 * id, so focus returns to the row even when nothing moves. */
export function stashBack(id: string, title: Element | null, now: number = Date.now()): void {
  pendingBackId = id
  if (title) flipStore.stash(BACK_ID, Flip.getState(title), null, now)
}

/** What a test needs: is a Back pending, and for which id. */
export function pendingBack(): string | null {
  return pendingBackId
}

export function clearBack(): void {
  pendingBackId = null
  flipStore.take(BACK_ID)
}

export interface SharedElementBackRefs {
  /** The list container; the row is `[data-flip-id="spec:<id>"]` inside it. */
  container: Element | null
  /** Rows that fade in around the returning one. Default: every `[data-flip-id^="spec:"]`. */
  siblingSelector?: string
  now?: number
}

export const sharedElementBack: Choreo<SharedElementBackRefs> = {
  name: 'sharedElementBack',
  play(ctx, refs) {
    const id = pendingBackId
    pendingBackId = null
    // Consumed once, TTL applied: a Back recorded long ago describes a layout no longer on screen.
    const stashed = flipStore.take(BACK_ID, refs.now)
    const tl = timelineFor(ctx)
    if (!id || !refs.container) return tl
    const row = refs.container.querySelector<HTMLElement>(`[data-flip-id="${CSS.escape(`spec:${id}`)}"]`)
    if (!row) return tl
    // Focus restore is accessibility, not decoration: it happens whatever the motion setting.
    row.focus({ preventScroll: false })
    if (!ctx.enabled || ctx.reduced || !stashed) return tl
    const siblings = Array.from(refs.container.querySelectorAll<HTMLElement>(refs.siblingSelector ?? '[data-flip-id^="spec:"]')).filter((el) => el !== row)
    const flip = Flip.from(stashed.state, {
      targets: row,
      ...FLIP_SHARED,
      toggleClass: 'is-flipping',
    })
    tl.add(flip, 0)
    if (siblings.length > 0) {
      tl.add(gsap.fromTo(siblings, { opacity: 0 }, { opacity: 1, duration: ctx.durations['dur-1'], ease: ctx.eases['dur-1'] }), 0)
    }
    return tl
  },
}
