import { useEffect, useRef, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'

const KEY_STEP = 24

/** The drag edge on the chat panel's left side. The panel sits against the window's right edge,
 * so its width is simply how far the pointer is from that edge. Dragging previews live
 * (`onResize`); the width is only remembered when the drag ends (`onCommit`). Keyboard users get
 * the same control: left arrow widens, right arrow narrows. Double-click goes back to the default.
 * Hidden where the panels stack vertically, since there is no width to change there. */
export function ChatResizeHandle({
  width, min, max, onResize, onCommit, onReset,
}: {
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onCommit: (width: number) => void
  onReset: () => void
}) {
  const stopDrag = useRef<(() => void) | null>(null)
  // A drag still in flight when the panel goes away must not leave its listeners on the window.
  useEffect(() => () => stopDrag.current?.(), [])

  const startDrag = (event: ReactMouseEvent) => {
    event.preventDefault()
    let last: number | null = null
    const previousSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none' // dragging over text must not select it

    const onMove = (e: MouseEvent) => {
      last = window.innerWidth - e.clientX
      onResize(last)
    }
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = previousSelect
      stopDrag.current = null
    }
    const onUp = () => {
      stop()
      if (last !== null) onCommit(last)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    stopDrag.current = stop
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); onCommit(width + KEY_STEP) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); onCommit(width - KEY_STEP) }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onMouseDown={startDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      // C5: no `focus-visible:outline-none` — the kit's ring (base.css `:focus-visible`) is the
      // one focus treatment, and a handle that hid it was the one control without one.
      className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-brand-100 focus-visible:bg-brand-100 sm:block"
    />
  )
}
