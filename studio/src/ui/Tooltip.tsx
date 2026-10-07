// #21 Tooltip: a short label (optionally with a key chord) after a 500 ms hover or on focus.
// Round 3 (Q3): `@radix-ui/react-tooltip` sits under it — Radix puts `role="tooltip"` and the id
// on the plate, `aria-describedby` on the trigger wrapper while open, closes every other tooltip
// when one opens, portals to `#overlays` and places the plate with its popper (flipping when the
// band edge is near), and its dismissable layer owns Escape. The kit keeps the timing: the
// 500 ms intent delay and the M7 leave (the plate is a `HoverPlate`, so it arrives and leaves
// exactly as a hover card does; Escape closes at once). Controlled, so a pointer, a focus and a
// test's `mouseEnter` share one timer.
import { useRef, type KeyboardEvent } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { TooltipProps } from './contract'
import { overlayRoot } from './focusTrap'
import { HoverPlate, PLACEMENT, PLATE_OFFSET, useDelayedOpen } from './HoverCard'
import { Kbd, KBD_ON_PLATE_CLASS } from './Kbd'

export const TOOLTIP_DELAY = 500

export function Tooltip({ label, kbd, children, placement = 'top' }: TooltipProps) {
  const { open, leaving, show, hide, close } = useDelayedOpen(TOOLTIP_DELAY, 0)
  // A press on the trigger ends the tooltip's business until the pointer LEAVES it (v14: the band's
  // Settings button was clicked inside the 500 ms intent window — Radix's pointerdown close only
  // closes an OPEN plate, the kit's pending timer still fired, and the plate then sat over the
  // strip with nothing to dismiss it, since the click's focus moved to the new screen's heading).
  // `close()` is synchronous (timer cleared, no fade), and while suppressed neither the wrapper's
  // own enter nor Radix's focus / pointer-move open (`onOpenChange(true)`) re-arms it, and Radix's
  // own close on that same pointerdown (`onOpenChange(false)`, after ours) does not start the
  // 80 ms leave fade on a plate already gone. A keyboard user never presses the pointer, so
  // Tab → 500 ms → plate is unchanged.
  const suppressed = useRef(false)
  const intend = () => {
    if (!suppressed.current) show()
  }
  const press = () => {
    suppressed.current = true
    close()
  }
  const leave = () => {
    suppressed.current = false
    hide()
  }
  const onOpenChange = (next: boolean) => {
    if (next) intend()
    else if (!suppressed.current) hide()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape' && open) close()
  }
  return (
    // One provider per tooltip: the kit's delay is the only delay (Radix's is zero), and the
    // provider's shared-group skip never shortens the 500 ms a tooltip owes a wandering pointer.
    <RadixTooltip.Provider delayDuration={0} skipDelayDuration={0} disableHoverableContent>
      <RadixTooltip.Root open={open} onOpenChange={onOpenChange}>
        <RadixTooltip.Trigger asChild>
          <span className="relative inline-flex" onMouseEnter={intend} onMouseLeave={leave} onPointerDown={press} onClick={press} onKeyDown={onKeyDown}>
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
                {kbd && kbd.length > 0 ? <Kbd keys={kbd} className={KBD_ON_PLATE_CLASS} /> : null}
              </HoverPlate>
            </RadixTooltip.Content>
          </RadixTooltip.Portal>
        ) : null}
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
