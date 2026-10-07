// #19 Dialog: the palette shell, shortcuts help, verb dialogs and appearance sheet. Round 3 (Q3):
// `@radix-ui/react-dialog` sits under it — Radix owns the focus scope (Tab containment, first
// tabbable on open), the dismissable layer (Escape answers the topmost layer only, a pointer down
// on the scrim closes), `aria-hidden` on everything outside, and the labelled-by / described-by
// wiring from its Title and Description. The kit keeps what Radix does not do or does later: the
// portal goes to `#overlays` (never inside `<main>` or an `<aside>`), `role="dialog" aria-modal`
// stays literal, the body scroll lock reads as `document.body.style.overflow = 'hidden'`, and
// focus returns to the opener as soon as the panel is gone (Radix restores on a later tick).
// Round 2 (M5) motion is unchanged: catalogue row #15 through `kitMotion` — scrim 0→1, panel
// `.98→1 / y 6→0`, every transform cleared — and on close the panel stays mounted for the 120 ms
// reverse before unmounting; with motion off the close unmounts synchronously, so the DOM equals a
// cold reload. `scrollBody` makes the body its own scroll box so header and footer stay put.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { DialogProps, DialogSize } from './contract'
import { dialog as dialogChoreo } from '../motion/choreo/dialog'
import { cn } from './cn'
import { overlayRoot } from './focusTrap'
import { IconButton } from './IconButton'
import { kitChoreoContext, motionEnabled } from './kitMotion'

const SIZE: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

/** The body's scroll box when `scrollBody` is set: tall enough for a list, never past the panel. */
export const DIALOG_SCROLL_BODY_CLASS = 'max-h-[min(60vh,560px)] overflow-y-auto'

/** The scrim's placement of the panel (`DialogProps.placement`): centred, or anchored 12vh from
 * the top so a content-sized panel keeps its top edge still while it grows or shrinks. */
export const DIALOG_PLACEMENT_CLASS: Record<NonNullable<DialogProps['placement']>, string> = {
  center: 'items-center',
  top: 'items-start pt-[12vh]',
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  initialFocus,
  returnFocus = true,
  footer,
  children,
  label,
  className,
  chrome = true,
  scrollBody = false,
  placement = 'center',
  'data-testid': testId,
}: DialogProps) {
  const scrim = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef(returnFocus)
  returnFocusRef.current = returnFocus
  const timeline = useRef<ReturnType<typeof dialogChoreo.play> | null>(null)
  // Mounted while open, and for the length of the close row after `open` flips false: the
  // render that sees `open=false, mounted=true` keeps the panel in the DOM for the row to fade.
  const [mounted, setMounted] = useState(open)
  const closing = !open && mounted

  // The opener is read when `open` flips true, before Radix moves focus, so it is the element the
  // person actually pressed. The inline overflow lock is the kit's own (Radix's RemoveScroll works
  // through a <style> rule, which a reader of `body.style.overflow` never sees).
  useEffect(() => {
    if (!open) return
    opener.current = (document.activeElement as HTMLElement | null) ?? null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Focus returns to the opener the moment the panel has left the DOM — after the close row with
  // motion on, in the same commit with it off — and on an unmount while still open (a host that
  // conditionally renders the dialog). Radix's own restore is declined (`onCloseAutoFocus`) so the
  // kit's promise has one owner.
  const restoreFocus = () => {
    const target = opener.current
    opener.current = null
    if (returnFocusRef.current && target && typeof target.focus === 'function' && target.isConnected) target.focus()
  }
  useEffect(() => {
    if (!mounted) restoreFocus()
    // `opener` is a ref; the effect answers to the panel leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])
  useEffect(
    () => () => {
      timeline.current?.kill()
      restoreFocus()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Row #15. Open plays after the portal has rendered; close only when something is still mounted
  // to fade, and only when motion is on — otherwise the unmount is immediate (`closing` stays
  // false). The timeline is killed on the next transition and on unmount.
  useLayoutEffect(() => {
    timeline.current?.kill()
    timeline.current = null
    if (open) {
      setMounted(true)
      if (!panel.current) return
      timeline.current = dialogChoreo.play(kitChoreoContext(scrim.current ?? panel.current), {
        scrim: scrim.current,
        panel: panel.current,
        direction: 'open',
      })
      return
    }
    if (!mounted) return
    if (!motionEnabled() || !panel.current) {
      setMounted(false)
      return
    }
    const tl = dialogChoreo.play(kitChoreoContext(scrim.current ?? panel.current), {
      scrim: scrim.current,
      panel: panel.current,
      direction: 'close',
    })
    timeline.current = tl
    let cancelled = false
    void tl.then(() => {
      if (!cancelled) setMounted(false)
    })
    return () => {
      cancelled = true
    }
    // `mounted` is read, not a trigger: the effect answers to `open` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const root = open || mounted ? overlayRoot() : null
  if (!root) return null

  return (
    // Radix is told "open" for as long as the kit keeps the panel mounted; its only way to say
    // "close" is the host's `onClose`, so Escape and a scrim press both go through the one door.
    <RadixDialog.Root open onOpenChange={(next) => { if (!next) onClose() }}>
      <RadixDialog.Portal container={root}>
        {/* `bg-scrim` + `--scrim-filter` (tokens.css): a surface-0 wash with a 2 px blur, not a
            black one, so the content underneath keeps its colours. backdrop-filter is plain CSS;
            the CSP's `style-src 'self' 'unsafe-inline'` permits it. */}
        <RadixDialog.Overlay
          ref={scrim}
          className={cn('fixed inset-0 z-40 flex justify-center bg-scrim p-6', DIALOG_PLACEMENT_CLASS[placement])}
          style={{ backdropFilter: 'var(--scrim-filter)', WebkitBackdropFilter: 'var(--scrim-filter)' }}
          data-dialog-scrim=""
          data-placement={placement}
          data-closing={closing ? '' : undefined}
        >
          <RadixDialog.Content
            ref={panel}
            aria-modal="true"
            aria-label={label}
            data-enter="rise"
            data-testid={testId}
            onOpenAutoFocus={(e) => {
              if (!initialFocus?.current) return
              e.preventDefault()
              initialFocus.current.focus()
            }}
            onCloseAutoFocus={(e) => e.preventDefault()}
            // `ring-1 ring-line-1` is the 1 px edge: a dialog never floats edge-less over light content.
            className={cn('flex w-full flex-col rounded-[20px] bg-surface-raised text-ink-1 shadow-3 ring-1 ring-line-1', SIZE[size], className)}
          >
            {chrome ? (
              <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div className="min-w-0">
                  <RadixDialog.Title className="text-lg">{title}</RadixDialog.Title>
                  {description ? <RadixDialog.Description className="text-sm text-ink-3">{description}</RadixDialog.Description> : null}
                </div>
                <IconButton label="Close" icon={X} size="sm" onClick={onClose} />
              </div>
            ) : (
              // Chromeless (the command palette): the title still exists for `aria-labelledby`, but
              // there is no header band or close button — Escape and the scrim close it.
              <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
            )}
            <div data-dialog-body="" className={cn(chrome && 'px-5 py-4', scrollBody && DIALOG_SCROLL_BODY_CLASS)}>{children}</div>
            {footer ? (
              <div className="flex items-center justify-end gap-2 rounded-b-[inherit] border-t border-line-1 bg-surface-2/40 px-5 py-3">{footer}</div>
            ) : null}
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
