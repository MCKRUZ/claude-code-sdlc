// The "In the room" ring style (togo-command-center-visual.md §2 `you-ring`, §4): a person is
// two initials in a 20 px disc. Only the signed-in person wears the `you-ring` — a 2 px ring
// after a 2 px `surface-1` gap — and nobody else; `lit` is the `card-lit` edge a person's chips
// and cards gain while hovered in the room; `dim` fades the others to .55. Presence, never a
// total: the component carries `data-person` and never writes a digit of its own, so the
// honesty sweep's "no `\d` inside `[data-person]`" holds for anything it renders from a name.
//
// The ring colours read the §2 tokens with the accent as fallback, so the style is correct
// before P0 lands the tokens and follows them once it does.
import type { HTMLAttributes } from 'react'
import { PERSON_RING_GAP_PX, PERSON_RING_PX, PERSON_RING_WIDTH_PX } from './ccFigureGeometry'
import { cn } from '../../../ui/cn'

export interface PersonRingProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Up to two letters as the caller took them from the roster NAME — never from a handle with
   * digits; the component strips any digit defensively so the sweep can never find one. */
  initials: string
  /** The accessible name — the roster name or handle, read by assistive tech. */
  name: string
  you?: boolean
  lit?: boolean
  dim?: boolean
  /** In an overlapping row: a 2 px `surface-1` gap around the disc so neighbouring rings never
   * read as one run of letters. A class, not an inline shadow — the `you` and `lit` shadows win. */
  stacked?: boolean
}

export const YOU_RING_SHADOW = `0 0 0 ${PERSON_RING_GAP_PX}px var(--color-surface-1), 0 0 0 ${PERSON_RING_GAP_PX + PERSON_RING_WIDTH_PX}px var(--color-you-ring, var(--color-accent-600))`
export const LIT_RING_SHADOW = `0 0 0 1px var(--color-card-lit, var(--color-accent-500))`

/** Letters only, at most two, upper-cased: "Sam K" → "SK", "@priya-n" → "P". */
export function ringInitials(initials: string): string {
  return initials.replace(/[^\p{L}]/gu, '').slice(0, 2).toUpperCase()
}

export function PersonRing({ initials, name, you = false, lit = false, dim = false, stacked = false, className, style, ...rest }: PersonRingProps) {
  const letters = ringInitials(initials)
  return (
    <span
      role="img"
      aria-label={you ? `${name} (you)` : name}
      data-person=""
      data-you={you ? '' : undefined}
      data-lit={lit ? '' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-ink-2 select-none',
        'text-(length:--text-2xs) leading-none tracking-[0.02em]',
        dim && 'opacity-55',
        stacked && !you && !lit && 'ring-2 ring-surface-1',
        className,
      )}
      style={{
        width: PERSON_RING_PX,
        height: PERSON_RING_PX,
        boxShadow: you ? YOU_RING_SHADOW : lit ? LIT_RING_SHADOW : undefined,
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden="true">{letters}</span>
    </span>
  )
}
