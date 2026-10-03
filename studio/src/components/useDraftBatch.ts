import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BatchCandidate, BatchKind, BatchState, KeepBatchResult, PreviewBatchResult, StartBatchResult,
} from '../../shared/types'
import { messageOf } from './activityPanelBits'

/** The multi-result model job (spec 0029) as a screen sees it: the job and its candidates for ONE
 * project, kept in step with main through `onBatchState`. What the person has decided so far
 * (`outcome`) is kept here too, so "Saved 2 files" survives the list emptying. */

export interface BatchOutcome {
  /** Files written by Keep in this batch, or null when none were. */
  saved: Array<{ label: string; target: string }> | null
  /** Candidates the latest Keep could not write; they stay in the list. */
  failed: KeepBatchResult['failed']
  /** How many results the person discarded, or null when they have not. */
  discarded: number | null
  warnings: string[]
}

export interface DraftBatchApi {
  state: BatchState
  /** Whole milliseconds the running job has been going, from a local clock; 0 when nothing runs. */
  elapsedMs: number
  /** True while a Keep or Discard is waiting on main. */
  acting: boolean
  /** One line when the last Keep, Discard or Cancel as a whole failed. */
  actionError: string | null
  outcome: BatchOutcome | null
  preview: (kind: BatchKind) => Promise<PreviewBatchResult>
  start: (kind: BatchKind) => Promise<StartBatchResult>
  cancel: () => Promise<void>
  /** `ids` omitted keeps every candidate main considers ready. */
  keep: (actor: string, ids?: string[]) => Promise<void>
  /** `ids` omitted discards every candidate. */
  discard: (actor: string, ids?: string[]) => Promise<void>
}

const EMPTY: BatchState = { job: null, candidates: [] }
const noop = () => {}

const without = (candidates: BatchCandidate[], ids: string[] | undefined): BatchCandidate[] =>
  ids === undefined ? [] : candidates.filter((c) => !ids.includes(c.id))

export function useDraftBatch(projectPath: string): DraftBatchApi {
  const [state, setState] = useState<BatchState>(EMPTY)
  const [outcome, setOutcome] = useState<BatchOutcome | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const stateRef = useRef<BatchState>(EMPTY)
  const live = useRef<string | null>(null)
  const actingRef = useRef(false)
  // Bumped by every push from main, so an older answer to getBatchState cannot overwrite it.
  const seq = useRef(0)

  const put = useCallback((next: BatchState) => { stateRef.current = next; setState(next) }, [])

  const sync = useCallback(async (path: string) => {
    const mine = seq.current
    try {
      const main = await window.studio.getBatchState(path)
      if (live.current === path && seq.current === mine) put(main)
    } catch {
      // Main could not say; the next push from main shows the state.
    }
  }, [put])

  useEffect(() => {
    live.current = projectPath
    seq.current += 1
    put(EMPTY)
    setOutcome(null)
    setActionError(null)
    actingRef.current = false
    setActing(false)
    void sync(projectPath)
    let unsubscribe = noop
    try {
      const off = window.studio.onBatchState((update) => {
        if (update.projectPath !== live.current) return
        seq.current += 1
        put(update.state)
      })
      if (typeof off === 'function') unsubscribe = off
    } catch {
      // Without the channel the list updates only when the screen is reopened.
    }
    return () => { live.current = null; unsubscribe() }
  }, [projectPath, put, sync])

  const running = state.job?.phase === 'running'
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])

  const preview = useCallback(async (kind: BatchKind): Promise<PreviewBatchResult> => {
    try {
      return await window.studio.previewBatch(projectPath, kind)
    } catch (err) {
      return { ok: false, error: messageOf(err, 'The documents could not be listed.') }
    }
  }, [projectPath])

  const start = useCallback(async (kind: BatchKind): Promise<StartBatchResult> => {
    const path = projectPath
    setOutcome(null)
    setActionError(null)
    let result: StartBatchResult
    try {
      result = await window.studio.startBatch(path, kind)
    } catch (err) {
      result = { ok: false, error: messageOf(err, 'The batch could not be started.') }
    }
    // Main may already have pushed newer progress for this job; only fill in a job we have not seen.
    if (result.ok && live.current === path && stateRef.current.job?.id !== result.job.id) {
      put({ job: result.job, candidates: [] })
    }
    return result
  }, [projectPath, put])

  const cancel = useCallback(async () => {
    const path = projectPath
    try {
      await window.studio.cancelBatch()
    } catch (err) {
      if (live.current === path) setActionError(messageOf(err, 'The batch could not be cancelled.'))
    }
  }, [projectPath])

  // Keep and Discard share the guard against double presses and the stale-project check.
  const act = useCallback(async (fallback: string, run: (path: string, jobId: string) => Promise<void>) => {
    const path = projectPath
    const job = stateRef.current.job
    if (!job || actingRef.current) return
    actingRef.current = true
    setActing(true)
    setActionError(null)
    try {
      await run(path, job.id)
    } catch (err) {
      if (live.current === path) setActionError(messageOf(err, fallback))
    } finally {
      if (live.current === path) { actingRef.current = false; setActing(false) }
    }
  }, [projectPath])

  const keep = useCallback((actor: string, ids?: string[]) => act('The results could not be kept.', async (path, jobId) => {
    const snapshot = stateRef.current.candidates
    const result = ids === undefined
      ? await window.studio.keepBatch(path, jobId, actor)
      : await window.studio.keepBatch(path, jobId, actor, ids)
    if (live.current !== path) return
    const saved = result.kept.flatMap((id) => snapshot.find((c) => c.id === id) ?? [])
      .map((c) => ({ label: c.label, target: c.target }))
    if (!result.ok && result.error) setActionError(result.error)
    put({ ...stateRef.current, candidates: stateRef.current.candidates.filter((c) => !result.kept.includes(c.id)) })
    if (result.kept.length === 0 && result.failed.length === 0) return
    setOutcome((prev) => {
      const savedAll = [...(prev?.saved ?? []), ...saved]
      return {
        saved: savedAll.length > 0 ? savedAll : null,
        failed: result.failed,
        discarded: prev?.discarded ?? null,
        warnings: [...(prev?.warnings ?? []), ...result.warnings],
      }
    })
  }), [act, put])

  const discard = useCallback((actor: string, ids?: string[]) => act('The results could not be discarded.', async (path, jobId) => {
    const waiting = stateRef.current.candidates
    const result = ids === undefined
      ? await window.studio.discardBatch(path, jobId, actor)
      : await window.studio.discardBatch(path, jobId, actor, ids)
    if (live.current !== path) return
    if (!result.ok) { setActionError(result.error || 'The results could not be discarded.'); return }
    const count = ids === undefined ? waiting.length : ids.length
    setOutcome((prev) => ({
      saved: prev?.saved ?? null,
      failed: [],
      discarded: (prev?.discarded ?? 0) + count,
      warnings: [...(prev?.warnings ?? []), ...result.warnings],
    }))
    put({ ...stateRef.current, candidates: without(stateRef.current.candidates, ids) })
  }), [act, put])

  const elapsedMs = running && state.job ? Math.max(0, now - state.job.startedAt) : 0
  return { state, elapsedMs, acting, actionError, outcome, preview, start, cancel, keep, discard }
}
