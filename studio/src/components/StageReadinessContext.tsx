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
    const result = await window.studio.getStageReadiness(projectPath, stageId)
    if (current.current !== forKey) return // a stale reply for a stage the person already navigated away from
    setReadiness(result)
    setLoading(false)
  }, [projectPath, stageId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <StageReadinessContext.Provider value={{ readiness, loading, refresh }}>
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
