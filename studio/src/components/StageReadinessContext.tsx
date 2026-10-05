import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { StageReadiness } from '../../shared/types'
import { stageHomeKey } from '../stageHomeKey'

/** What a consumer of the shared stage readiness reads: the data itself, whether a fetch is in
 * flight, and the SAME `refresh()` every consumer must call after a write — calling it from one
 * consumer updates every other consumer's view too, since they all read the one fetch this
 * holds rather than running their own (spec 0019). */
export interface StageReadinessContextValue {
  readiness: StageReadiness | null
  loading: boolean
  /** Set when the fetch itself rejected outright (a real IPC failure, not an `{ok:false}` read)
   * — distinct from `readiness.ok === false`, which is a successful call reporting a known
   * problem. Cleared at the start of every refresh, so a stale failure never survives a
   * subsequent success. A consumer actively watching this stage (ChatPanel's connecting
   * checklist) should show it; one that is merely decorative (the sidebar's doc-count line) can
   * choose to just fall back quietly — both are reading the same one fetch, not separate ones. */
  error: string | null
  refresh: () => Promise<void>
}

const StageReadinessContext = createContext<StageReadinessContextValue | null>(null)

/** Owns the ONE `getStageReadiness` call for the stage on screen. Frame.tsx wraps its whole row
 * — Sidebar, the stage's own screen, and the chat panel — in this, so every descendant that
 * needs the current stage's readiness reads the SAME fetch instead of each running its own.
 *
 * Before spec 0019, Frame's sidebar doc-count line (`useCurrentStageDocs`) and StageHome's own
 * `readiness`/`loading`/`refresh` state each called `getStageReadiness()` independently for the
 * same stage — up to several redundant `stage_readiness.py` subprocesses for one screen. This
 * replaces both with one fetch, keyed on `[projectPath, stageId]` exactly as StageHome's own
 * effect already was, so moving the state up here changes WHERE it lives, not when it re-fires. */
export function StageReadinessProvider({
  projectPath, stageId, children,
}: {
  projectPath: string
  /** The resolved stage to read readiness for — `viewedStageId ?? the project's current stage`,
   * computed once by Frame so every consumer reads the same stage rather than each re-deriving
   * it. Undefined defers to the plugin's own default (the project's current stage), matching
   * what passing no stage to `getStageReadiness` already meant. */
  stageId: string | undefined
  children: ReactNode
}) {
  const [readiness, setReadiness] = useState<StageReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // What stage/project is actually on screen right now, readable from inside refresh()'s async
  // continuation — the same idiom ChatPanel.tsx uses for its own handlers (`currentStageId`): a
  // plain closure variable would only ever hold the stage refresh() was CALLED for, which is
  // exactly the bug this guards against. Two independent `getStageReadiness` subprocess calls
  // have no ordering guarantee — clicking stage A then stage B before A resolves can have A's
  // reply land AFTER B's — so without this, `setReadiness(resultForA)` would silently overwrite
  // the correct `resultForB` for every consumer reading this context.
  const current = useRef(stageHomeKey(projectPath, stageId))
  useEffect(() => { current.current = stageHomeKey(projectPath, stageId) }, [projectPath, stageId])

  const refresh = useCallback(async () => {
    const forKey = stageHomeKey(projectPath, stageId)
    setLoading(true)
    setError(null)
    try {
      const result = await window.studio.getStageReadiness(projectPath, stageId)
      if (current.current !== forKey) return // a stale reply for a stage the person already navigated away from
      setReadiness(result)
    } catch (err) {
      // A real IPC round trip, and it CAN reject outright (confirmed reachable: the TOCTOU gap
      // in electron/main/documents.ts's openDocumentUncached — ChatPanel.tsx's own comment on
      // its former independent readiness call named the exact failure). Now that ChatPanel
      // (spec 0018) gates its own "ready" state on this context's `loading`, an unhandled
      // rejection here would leave every consumer's loading state stuck true forever — the same
      // class of bug PR #76 finding #2 fixed for ChatPanel's old call, now fixed at its new,
      // single, shared source instead. Keep whatever `readiness` already held (a stale-but-real
      // view beats a blank one), stop loading, and record WHY — a consumer actively watching
      // this stage needs to be able to show it, not just silently recover.
      if (current.current !== forKey) return
      setError(err instanceof Error ? err.message : 'Could not read this stage.')
    } finally {
      if (current.current === forKey) setLoading(false)
    }
  }, [projectPath, stageId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <StageReadinessContext.Provider value={{ readiness, loading, error, refresh }}>
      {children}
    </StageReadinessContext.Provider>
  )
}

/** Reads the shared stage readiness Frame.tsx owns. Every screen that needs it is rendered
 * inside Frame (StageHome as its `children`, the chat panel as its sibling — see
 * `studio/src/App.tsx`), so a missing provider is a wiring bug, not a reachable state — this
 * throws rather than silently returning an empty value a caller could mistake for "not loaded
 * yet". */
export function useStageReadiness(): StageReadinessContextValue {
  const ctx = useContext(StageReadinessContext)
  if (!ctx) throw new Error('useStageReadiness must be used within a StageReadinessProvider')
  return ctx
}
