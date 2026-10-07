// #20 HoverCard / Popover: read-only cards that open on hover AND `focus-visible`, close on
// Escape, and never contain a write control (the content is `pointer-events: none`, so nothing
// in it can be clicked — the rule is enforced by construction). Text-only content is a tooltip
// to assistive tech; richer content is a described region. Round 3 (Q3): `@radix-ui/react-hover-card`
// sits under it — the card portals to `#overlays` and is placed by Radix's popper (it flips and
// shifts to stay on screen, so a card on a row deep inside a scrolling lane is never clipped),
// and Radix's dismissable layer owns Escape. The kit keeps the intent timing (`useDelayedOpen`:
// 350 ms in, 120 ms grace, the M7 80 ms leave fade with role and `pointer-events: none` kept)
// and drives Radix as a controlled card, so a pointer, a focus and a test's `mouseEnter` all
// reach the same timer.
import { useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type Ref, type RefObject } from 'react'
import * as RadixHoverCard from '@radix-ui/react-hover-card'
import type { HoverCardProps, Placement } from './contract'
import { hoverPlate } from '../motion/choreo/hoverPlate'
import { cn } from './cn'
import { overlayRoot } from './focusTrap'
import { kitChoreoContext, motionEnabled } from './kitMotion'

/** The kit's four placements as Radix popper sides (the popper flips when the side lacks room). */
export const PLACEMENT: Record<Placement, 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
}

export const HOVER_OPEN_DELAY = 350
export const HOVER_CLOSE_DELAY = 120
/** How long the leave fade holds the node (M7), in ms. */
export const HOVER_LEAVE_MS = 80
/** Gap between trigger and plate, in px (the 8 px rhythm's half step). */
export const PLATE_OFFSET = 6

export interface DelayedOpen {
  /** Mounted: visible, or leaving (fading out). */
  open: boolean
  /** True only while the leave fade plays. */
  leaving: boolean
  show(): void
  hide(): void
  /** Synchronous close (Escape): no delay, no fade. */
  close(): void
}

/** Shared open/close timing. `openDelay` keeps a card from flashing as the pointer crosses a row;
 * `closeDelay` lets it survive the gap between trigger and card; the leave fade follows the delay
 * only while motion is on, so with motion off the node leaves at once. */
export function useDelayedOpen(openDelay: number, closeDelay: number): DelayedOpen {
  const [phase, setPhase] = useState<'closed' | 'open' | 'leaving'>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useLayoutEffect(() => clear, [])
  return {
    open: phase !== 'closed',
    leaving: phase === 'leaving',
    show: () => {
      clear()
      timer.current = setTimeout(() => setPhase('open'), openDelay)
    },
    hide: () => {
      clear()
      timer.current = setTimeout(() => {
        if (!motionEnabled()) {
          setPhase('closed')
          return
        }
        setPhase('leaving')
        timer.current = setTimeout(() => setPhase('closed'), HOVER_LEAVE_MS)
      }, closeDelay)
    },
    close: () => {
      clear()
      setPhase('closed')
    },
  }
}

/** Plays row #17 on the plate: in on mount, out when `leaving` flips true. */
export function useHoverPlate(ref: RefObject<HTMLElement | null>, leaving: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const tl = hoverPlate.play(kitChoreoContext(el), { el, direction: leaving ? 'out' : 'in' })
    return () => {
      tl.kill()
    }
  }, [ref, leaving])
}

export function HoverCard({ trigger, content, placement = 'bottom', openDelay = HOVER_OPEN_DELAY, closeDelay = HOVER_CLOSE_DELAY, className }: HoverCardProps) {
  const id = useId()
  const { open, leaving, show, hide, close } = useDelayedOpen(openDelay, closeDelay)
  const textOnly = typeof content === 'string' || typeof content === 'number'
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      close()
    }
  }
  return (
    // Controlled: Radix's own pointer/focus intents and the span's mouse events all land in the
    // kit's timer, so Radix's delays are zero and the kit's are the only ones.
    <RadixHoverCard.Root open={open} onOpenChange={(next) => (next ? show() : hide())} openDelay={0} closeDelay={0}>
      <RadixHoverCard.Trigger asChild>
        <span
          className={cn('relative inline-flex', className)}
          onMouseEnter={show}
          onMouseLeave={hide}
          onKeyDown={onKeyDown}
          {...(textOnly ? { 'aria-describedby': open && !leaving ? id : undefined } : {})}
        >
          {trigger}
        </span>
      </RadixHoverCard.Trigger>
      {open ? (
        <RadixHoverCard.Portal container={overlayRoot() ?? undefined}>
          <RadixHoverCard.Content
            asChild
            side={PLACEMENT[placement]}
            sideOffset={PLATE_OFFSET}
            collisionPadding={8}
            onEscapeKeyDown={(e) => {
              e.preventDefault()
              close()
            }}
          >
            <HoverPlate id={id} role={textOnly ? 'tooltip' : undefined} leaving={leaving}>{content}</HoverPlate>
          </RadixHoverCard.Content>
        </RadixHoverCard.Portal>
      ) : null}
    </RadixHoverCard.Root>
  )
}

interface HoverPlateProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children' | 'role'> {
  role?: 'tooltip'
  leaving: boolean
  children: HoverCardProps['content']
  ref?: Ref<HTMLSpanElement>
}

/** The plate itself — one element for HoverCard and Tooltip, so both arrive and leave alike.
 * Radix's popper wrapper positions it; the plate carries no placement of its own. Extra props
 * (Radix's `role`, `id`, `data-state`, popper CSS variables) spread onto the span. */
export function HoverPlate({ leaving, className, children, ref, ...rest }: HoverPlateProps) {
  const inner = useRef<HTMLSpanElement | null>(null)
  useHoverPlate(inner, leaving)
  return (
    <span
      {...rest}
      ref={(el) => {
        inner.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      data-hover-card=""
      data-leaving={leaving ? '' : undefined}
      className={cn(
        'pointer-events-none z-30 w-max max-w-xs rounded-[10px] bg-surface-raised px-3 py-2 text-xs text-ink-1 shadow-2',
        className,
      )}
    >
      {children}
    </span>
  )
}

export const Popover = HoverCard
