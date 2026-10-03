import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DraftCandidate, DraftJob, DraftKind, DraftProgressEvent, DraftRequest, DraftState, StartDraftResult,
} from '../../shared/types'
import { messageOf } from './activityPanelBits'

/** The one model job Studio runs at a time (spec 0027), as a screen sees it. One instance serves every
 * panel that can start a job, so a second panel learns a job is already going. Each non-idle state
 * carries the `scope` (kind and stage) it belongs to, so a panel shows only its own job's progress and
 * result, while every panel disables its start buttons for the same `busyLabel`. */

export interface DraftScope { kind: DraftKind; stageId: string }

export type DraftUiState =
  | { phase: 'idle'; scope: DraftScope | null; notice: string | null }
  | { phase: 'running'; scope: DraftScope; label: string; jobId: string | null; activity: string | null; startedAt: number; elapsedMs: number }
  | { phase: 'candidate'; scope: DraftScope; label: string; candidate: DraftCandidate; acting: boolean; actionError: string | null }
  | { phase: 'saved'; scope: DraftScope; written: string; findingsRecorded?: boolean; warning?: string }
  | { phase: 'error'; scope: DraftScope; message: string }

export interface DraftJobApi {
  state: DraftUiState
  /** The job that is running or waiting for Keep / Discard, or null. Every start button is disabled
   * with "Already drafting <busyLabel>" while this is set. */
  busyLabel: string | null
  /** Goes up on each successful Keep, so a panel can read what Keep changed again. */
  keptCount: number
  start: (request: DraftRequest) => Promise<void>
  retry: () => Promise<void>
  cancel: () => Promise<void>
  keep: (actor: string) => Promise<void>
  discard: (actor: string) => Promise<void>
}

const IDLE: DraftUiState = { phase: 'idle', scope: null, notice: null }
const START_FAILED = 'The draft could not be made.'
const baseName = (path: string) => path.split('/').pop() ?? path
const scopeOf = (job: { kind: DraftKind; stageId: string }): DraftScope => ({ kind: job.kind, stageId: job.stageId })

/** What the finished summary will be called, until main reports the real job. */
function provisionalLabel(request: DraftRequest): string {
  if (request.kind === 'review') return 'review-report.md'
  return `${baseName(request.document ?? 'document').replace(/\.md$/, '')}.narrative.md`
}

/** The state a panel for this kind and stage may draw, or null when it belongs to another panel. */
export function draftStateFor(state: DraftUiState, kind: DraftKind, stageId: string): DraftUiState | null {
  if (state.scope === null) return null
  return state.scope.kind === kind && state.scope.stageId === stageId ? state : null
}

function labelOf(state: DraftUiState): string | null {
  return state.phase === 'running' || state.phase === 'candidate' ? state.label : null
}

export function useDraftJob(projectPath: string): DraftJobApi {
  const [core, setCore] = useState<DraftUiState>(IDLE)
  const [keptCount, setKeptCount] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const coreRef = useRef<DraftUiState>(IDLE)
  const live = useRef<string | null>(null)
  const lastRequest = useRef<DraftRequest | null>(null)
  const run = useRef({ id: 0, owned: false })

  const put = useCallback((next: DraftUiState) => { coreRef.current = next; setCore(next) }, [])
  const isLive = (path: string) => live.current === path

  const adopt = useCallback((main: DraftState) => {
    const current = coreRef.current
    if (main.running) {
      const job: DraftJob = main.running
      const same = current.phase === 'running' && (current.jobId === null || current.jobId === job.id)
      if (same || !run.current.owned) {
        put({ phase: 'running', scope: scopeOf(job), label: job.label, jobId: job.id, activity: current.phase === 'running' ? current.activity : null, startedAt: job.startedAt, elapsedMs: 0 })
      }
      return
    }
    if (run.current.owned) return
    if (main.candidate && current.phase !== 'candidate') {
      const candidate = main.candidate
      put({ phase: 'candidate', scope: scopeOf(candidate), label: baseName(candidate.target), candidate, acting: false, actionError: null })
    } else if (!main.candidate && current.phase === 'running') {
      put(IDLE)
    }
  }, [put])

  const sync = useCallback(async (path: string) => {
    try {
      const main = await window.studio.getDraftState()
      if (isLive(path)) adopt(main)
    } catch {
      // Main could not say; the screen stays as it is and the next progress event or poll tries again.
    }
  }, [adopt])

  useEffect(() => {
    live.current = projectPath
    run.current = { id: run.current.id + 1, owned: false }
    put(IDLE)
    void sync(projectPath)
    let unsubscribe = () => {}
    try {
      unsubscribe = window.studio.onDraftProgress((event) => onProgress(event))
    } catch {
      // Without the channel the person loses live activity text; the local timer still runs.
    }
    return () => { live.current = null; unsubscribe() }
    // `onProgress` only reads refs; the project decides when to resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath])

  function onProgress(event: DraftProgressEvent) {
    const current = coreRef.current
    if (current.phase === 'running' && (current.jobId === null || current.jobId === event.jobId)) {
      put({ ...current, jobId: event.jobId, activity: event.activity, startedAt: Date.now() - event.elapsedMs })
      if (current.jobId === null) void sync(live.current ?? projectPath)
    } else if (live.current) {
      void sync(live.current)
    }
  }

  // The local clock: elapsed seconds tick without waiting for an event, and a job this screen did not
  // start (recovered after a reopen) is polled so its candidate shows up when it ends.
  const running = core.phase === 'running'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (!run.current.owned && live.current) void sync(live.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [running, sync])

  const start = useCallback(async (request: DraftRequest) => {
    const path = projectPath
    if (labelOf(coreRef.current) !== null) return
    lastRequest.current = request
    const id = run.current.id + 1
    run.current = { id, owned: true }
    const scope: DraftScope = { kind: request.kind, stageId: request.stageId }
    put({ phase: 'running', scope, label: provisionalLabel(request), jobId: null, activity: null, startedAt: Date.now(), elapsedMs: 0 })
    setNow(Date.now())
    let result: StartDraftResult
    try {
      const pending = window.studio.startDraft(path, request)
      void sync(path)
      result = await pending
    } catch (err) {
      result = { ok: false, error: messageOf(err, START_FAILED) }
    }
    if (!isLive(path) || run.current.id !== id) return
    run.current = { id, owned: false }
    put(afterStart(result, scope))
  }, [projectPath, put, sync])

  const retry = useCallback(async () => {
    if (lastRequest.current) await start(lastRequest.current)
  }, [start])

  const cancel = useCallback(async () => {
    const path = projectPath
    const scope = coreRef.current.scope
    try {
      const result = await window.studio.cancelDraft()
      if (!isLive(path)) return
      if (!result.ok) { await sync(path); return }
      run.current = { id: run.current.id + 1, owned: false }
      put({ phase: 'idle', scope, notice: 'Cancelled' })
    } catch (err) {
      if (scope && isLive(path)) put({ phase: 'error', scope, message: messageOf(err, 'The job could not be cancelled.') })
    }
  }, [projectPath, put, sync])

  const keep = useCallback(async (actor: string) => {
    const current = coreRef.current
    if (current.phase !== 'candidate' || current.acting) return
    const path = projectPath
    put({ ...current, acting: true, actionError: null })
    try {
      const result = await window.studio.keepDraft(path, current.candidate.jobId, actor)
      if (!isLive(path)) return
      if (!result.ok) { put({ ...current, acting: false, actionError: result.error || 'The draft could not be kept.' }); return }
      put({ phase: 'saved', scope: current.scope, written: result.written ?? current.candidate.target, findingsRecorded: result.findingsRecorded, warning: result.warning })
      setKeptCount((n) => n + 1)
    } catch (err) {
      if (isLive(path)) put({ ...current, acting: false, actionError: messageOf(err, 'The draft could not be kept.') })
    }
  }, [projectPath, put])

  const discard = useCallback(async (actor: string) => {
    const current = coreRef.current
    if (current.phase !== 'candidate' || current.acting) return
    const path = projectPath
    put({ ...current, acting: true, actionError: null })
    try {
      const result = await window.studio.discardDraft(path, current.candidate.jobId, actor)
      if (!isLive(path)) return
      if (!result.ok) { put({ ...current, acting: false, actionError: result.error || 'The draft could not be discarded.' }); return }
      put({ phase: 'idle', scope: current.scope, notice: result.warning ? `Discarded. ${result.warning}` : 'Discarded.' })
    } catch (err) {
      if (isLive(path)) put({ ...current, acting: false, actionError: messageOf(err, 'The draft could not be discarded.') })
    }
  }, [projectPath, put])

  const state: DraftUiState = core.phase === 'running' ? { ...core, elapsedMs: Math.max(0, now - core.startedAt) } : core
  return { state, busyLabel: labelOf(core), keptCount, start, retry, cancel, keep, discard }
}

function afterStart(result: StartDraftResult, scope: DraftScope): DraftUiState {
  if (result.ok) {
    const { candidate } = result
    return { phase: 'candidate', scope, label: baseName(candidate.target), candidate, acting: false, actionError: null }
  }
  if (result.cancelled) return { phase: 'idle', scope, notice: 'Cancelled' }
  return { phase: 'error', scope, message: result.error || START_FAILED }
}
