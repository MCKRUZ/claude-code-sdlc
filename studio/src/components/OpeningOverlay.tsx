import { useEffect, useState } from 'react'
import { formatElapsed } from '../../shared/elapsed'

/** Shown while a project is being opened — or any other action that reads or writes through the
 * plugin and can take several seconds, where nothing on screen otherwise looks like it did
 * anything, so people click again. Title and subtitle default to the original opening-a-project
 * wording, so that call site is unchanged; a caller doing something else (signing off a phase)
 * passes its own.
 *
 * It covers the whole window and takes the keyboard as well as the pointer, so nothing behind it
 * can be operated until the action finishes or fails. It shows a running clock, because "still
 * working" is only believable if something visibly moves. */
export function OpeningOverlay({
  projectName,
  startedAt,
  title,
  subtitle,
}: {
  projectName: string
  startedAt: number
  title?: string
  subtitle?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [])

  // The pointer is blocked by the overlay itself; this blocks the keyboard, so Tab and Enter
  // cannot reach a control underneath.
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') e.preventDefault()
    }
    window.addEventListener('keydown', block, true)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    return () => window.removeEventListener('keydown', block, true)
  }, [])

  return (
    <div
      data-testid="opening-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={title ?? `Opening ${projectName}`}
      className="fixed inset-0 z-50 flex cursor-progress items-center justify-center bg-slate-900/40 backdrop-blur-[1px]"
    >
      <div className="w-80 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700"
        />
        <p className="mt-4 text-sm font-medium text-slate-900">{title ?? `Opening ${projectName}…`}</p>
        <p className="mt-1 text-xs text-slate-500">{subtitle ?? 'Reading the project through the plugin.'}</p>
        <p className="mt-3 font-mono text-lg tabular-nums text-slate-700">{formatElapsed(now - startedAt)}</p>
      </div>
    </div>
  )
}
