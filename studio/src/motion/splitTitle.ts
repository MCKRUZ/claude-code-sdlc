// Character splitting for the three headings that get it (§4.1 `splitTitle.ts`): the Welcome
// h1, the ceremony title and the overlay title. SplitText is lazy-loaded so a screen without a
// split title never ships the plugin; `aria: 'auto'` keeps the whole string readable by AT
// (the chars are `aria-hidden`, the element gets an `aria-label`); fonts are awaited first so a
// split measured in the fallback font does not re-wrap when Inter arrives. Never applied to
// `MarkdownView`, any `data-testid` text, or a heading a Playwright spec locates (grep first).
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { enabled } from './motion'

export interface SplitTitle {
  /** Empty when motion is disabled or the element was not split. */
  chars: Element[]
  /** Restores the original text node. Idempotent. */
  revert(): void
}

const INERT: SplitTitle = { chars: [], revert() {} }

/** The lazy import, replaceable by a test that wants to prove it was (or was not) called. */
export let loadSplitText = async () => (await import('gsap/SplitText')).SplitText

export function setSplitTextLoaderForTests(loader: typeof loadSplitText | null): void {
  loadSplitText = loader ?? (async () => (await import('gsap/SplitText')).SplitText)
}

export async function splitTitle(el: HTMLElement | null): Promise<SplitTitle> {
  if (!el || !enabled()) return INERT
  // Optional chaining: jsdom has no `document.fonts`.
  await document.fonts?.ready
  // The element may have gone while we waited.
  if (!el.isConnected) return INERT
  const SplitText = await loadSplitText()
  const split = new SplitText(el, { type: 'chars', aria: 'auto' })
  let reverted = false
  return {
    chars: split.chars,
    revert() {
      if (reverted) return
      reverted = true
      split.revert()
    },
  }
}

/** Splits on mount, reverts on unmount, and hands the chars to `onSplit` (the choreography that
 * will stagger them). The callback runs once per `key` change. */
export function useSplitTitle(
  ref: RefObject<HTMLElement | null>,
  onSplit?: (chars: Element[]) => void,
  key?: unknown,
): void {
  useEffect(() => {
    let active = true
    let handle: SplitTitle | null = null
    void splitTitle(ref.current).then((result) => {
      if (!active) {
        result.revert()
        return
      }
      handle = result
      if (result.chars.length > 0) onSplit?.(result.chars)
    })
    return () => {
      active = false
      handle?.revert()
    }
    // `onSplit` is intentionally not a dependency: a new callback identity must not re-split.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, key])
}
