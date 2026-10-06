// #19 Dialog: the palette shell, shortcuts help, restore confirm and appearance sheet. Portals
// into `#overlays` so it is never inside `<main>` or an `<aside>`; `role="dialog" aria-modal`;
// traps focus; closes on Escape; locks body scroll; returns focus to the opener. Round 2 (M5): it
// plays catalogue row #15 through `kitMotion` — scrim 0→1, panel `.98→1 / y 6→0`, every transform
// cleared at the end — and on close keeps the panel mounted for the 120 ms reverse before
// unmounting. With motion off (MODE=test, `off`, reduced without opt-in) the open row is an
// instant end state and the close unmounts synchronously, so the DOM equals a cold reload.
// `scrollBody` makes the body its own scroll box so header and footer stay put.
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { DialogProps, DialogSize } from './contract'
import { dialog as dialogChoreo } from '../motion/choreo/dialog'
import { cn } from './cn'
import { focusableWithin, overlayRoot, trapTab } from './focusTrap'
import { IconButton } from './IconButton'
import { kitChoreoContext, motionEnabled } from './kitMotion'

const SIZE: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

/** The body's scroll box when `scrollBody` is set: tall enough for a list, never past the panel. */
export const DIALOG_SCROLL_BODY_CLASS = 'max-h-[min(60vh,560px)] overflow-y-auto'

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
  'data-testid': testId,
}: DialogProps) {
  const scrim = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const timeline = useRef<ReturnType<typeof dialogChoreo.play> | null>(null)
  // Mounted while open, and for the length of the close row after `open` flips false: the
  // render that sees `open=false, mounted=true` keeps the panel in the DOM for the row to fade.
  const [mounted, setMounted] = useState(open)
  const closing = !open && mounted
  const baseId = useId()
  const titleId = `${baseId}-title`
  const descriptionId = description ? `${baseId}-description` : undefined

  // Focus in on open, back out on close. The opener is read when `open` flips true, before the
  // dialog steals focus, so it is the element the person actually pressed.
  useEffect(() => {
    if (!open) return
    opener.current = (document.activeElement as HTMLElement | null) ?? null
    const target = initialFocus?.current ?? focusableWithin(panel.current!)[0] ?? panel.current
    target?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (panel.current) trapTab(e, panel.current)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      if (returnFocus) opener.current?.focus?.()
    }
  }, [open, onClose, initialFocus, returnFocus])

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

  useEffect(
    () => () => {
      timeline.current?.kill()
    },
    [],
  )

  const root = open || mounted ? overlayRoot() : null
  if (!root) return null

  const onScrim = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return createPortal(
    // `bg-scrim` + `--scrim-filter` (tokens.css): a surface-0 wash with a 2 px blur, not a black
    // one, so the content underneath keeps its colours. backdrop-filter is plain CSS; the CSP's
    // `style-src 'self' 'unsafe-inline'` permits it.
    <div
      ref={scrim}
      className="fixed inset-0 z-40 flex items-center justify-center bg-scrim p-6"
      style={{ backdropFilter: 'var(--scrim-filter)', WebkitBackdropFilter: 'var(--scrim-filter)' }}
      onMouseDown={onScrim}
      data-dialog-scrim=""
      data-closing={closing ? '' : undefined}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={label ? undefined : titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-enter="rise"
        data-testid={testId}
        // `ring-1 ring-line-1` is the 1 px edge: a dialog never floats edge-less over light content.
        className={cn('flex w-full flex-col rounded-[20px] bg-surface-raised text-ink-1 shadow-3 ring-1 ring-line-1', SIZE[size], className)}
      >
        {chrome ? (
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-sm text-ink-3">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton label="Close" icon={X} size="sm" onClick={onClose} />
          </div>
        ) : (
          // Chromeless (the command palette): the title still exists for `aria-labelledby`, but
          // there is no header band or close button — Escape and the scrim close it.
          <h2 id={titleId} className="sr-only">{title}</h2>
        )}
        <div data-dialog-body="" className={cn(chrome && 'px-5 py-4', scrollBody && DIALOG_SCROLL_BODY_CLASS)}>{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 rounded-b-[inherit] border-t border-line-1 bg-surface-2/40 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    root,
  )
}
