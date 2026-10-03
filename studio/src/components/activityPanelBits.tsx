import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** Pieces the four activity panels (spec 0026) share, so each reports a failure and guards against
 * a stale answer the same way. */

export const PANEL_BUTTON =
  'rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60'
export const PANEL_SECONDARY_BUTTON =
  'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 disabled:opacity-60'

export function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

export function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/** The one line a failed call shows: no count, no partial result beside it. */
export function PanelError({ message }: { message: string }) {
  return <p role="alert" data-testid="panel-error" className="mt-2 text-xs text-[var(--color-command-error)]">{message}</p>
}

/** State that belongs to one place (a project, or a project and stage). When `scope` changes the
 * state goes back to `initial`, and `isCurrent` turns a reply for the place the person already left
 * into a no-op — so an old stage's answer can never land on the one they are looking at.
 * `initial` must be a stable value (a module constant). */
export function useScopedState<T>(scope: string, initial: T): [T, Dispatch<SetStateAction<T>>, (forScope: string) => boolean] {
  const [value, setValue] = useState<T>(initial)
  const live = useRef<string | null>(null)
  useEffect(() => {
    live.current = scope
    setValue(initial)
    return () => { live.current = null }
  }, [scope, initial])
  return [value, setValue, (forScope) => live.current === forScope]
}

export type Loaded<T> = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; value: T }

/** Loads once when the panel appears and again when `scope` changes, for the read-only panels. A
 * reply for a scope the person already left is dropped. */
export function useLoaded<T extends { ok: boolean; error?: string }>(
  scope: string, load: () => Promise<T>, fallback: string,
): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ kind: 'loading' })
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    Promise.resolve().then(load).then(
      (value) => { if (!cancelled) setState(value.ok ? { kind: 'ready', value } : { kind: 'failed', message: value.error || fallback }) },
      (err) => { if (!cancelled) setState({ kind: 'failed', message: messageOf(err, fallback) }) },
    )
    return () => { cancelled = true }
    // `load` is rebuilt every render; the scope is what decides when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  return state
}
