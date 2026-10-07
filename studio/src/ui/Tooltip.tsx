// #21 Tooltip: a short label (optionally with a key chord) after a 500 ms hover or on focus.
// Round 3 (Q3): `@radix-ui/react-tooltip` sits under it — Radix puts `role="tooltip"` and the id
// on the plate, `aria-describedby` on the trigger wrapper while open, closes every other tooltip
// when one opens, portals to `#overlays` and places the plate with its popper (flipping when the
// band edge is near), and its dismissable layer owns Escape. The kit keeps the timing: the
// 500 ms intent delay and the M7 leave (the plate is a `HoverPlate`, so it arrives and leaves
// exactly as a hover card does; Escape closes at once). Controlled, so a pointer, a focus and a
// test's `mouseEnter` share one timer.
import type { KeyboardEvent } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { TooltipProps } from './contract'
import { overlayRoot } from './focusTrap'
import { HoverPlate, PLACEMENT, PLATE_OFFSET, useDelayedOpen } from './HoverCard'
import { Kbd } from './Kbd'

export const TOOLTIP_DELAY = 500

export function Tooltip({ label, kbd, children, placement = 'top' }: TooltipProps) {
  const { open, leaving, show, hide, close } = useDelayedOpen(TOOLTIP_DELAY, 0)
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape' && open) close()
  }
  return (
    // One provider per tooltip: the kit's delay is the only delay (Radix's is zero), and the
    // provider's shared-group skip never shortens the 500 ms a tooltip owes a wandering pointer.
    <RadixTooltip.Provider delayDuration={0} skipDelayDuration={0} disableHoverableContent>
      <RadixTooltip.Root open={open} onOpenChange={(next) => (next ? show() : hide())}>
        <RadixTooltip.Trigger asChild>
          <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onKeyDown={onKeyDown}>
            {children}
          </span>
        </RadixTooltip.Trigger>
        {open ? (
          <RadixTooltip.Portal container={overlayRoot() ?? undefined}>
            <RadixTooltip.Content
              asChild
              side={PLACEMENT[placement]}
              sideOffset={PLATE_OFFSET}
              collisionPadding={8}
              onEscapeKeyDown={(e) => {
                e.preventDefault()
                close()
              }}
            >
              <HoverPlate leaving={leaving} className="inline-flex max-w-none items-center gap-1.5 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                {label}
                {kbd && kbd.length > 0 ? <Kbd keys={kbd} className="border-white/20 bg-white/10 text-white" /> : null}
              </HoverPlate>
            </RadixTooltip.Content>
          </RadixTooltip.Portal>
        ) : null}
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
