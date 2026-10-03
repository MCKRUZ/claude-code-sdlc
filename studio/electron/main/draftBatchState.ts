// Where a batch (spec 0029) lives while it runs and while its candidates wait: module state, one entry
// per project, and the live updates pushed to the window. A candidate holds text made from THAT project's
// documents, so every read and every decision goes through the project the entry belongs to.

import { resolve } from 'node:path'
import type { AgentLaunch } from './agentRun'
import type { BatchCandidate, BatchJob, BatchState } from '../../shared/types'

export const BATCH_CHANNEL = 'studio:batchState'
const THROTTLE_MS = 100

export interface BatchDeps {
  /** The person's configured path to `claude`; the bare name when unset. */
  claudePath?: string
  /** Pushes a live update to the window. */
  send: (channel: string, payload: unknown) => void
  /** A test seam: run a stand-in program instead of the real CLI. Absent in production. */
  launch?: AgentLaunch
}

export interface BatchEntry {
  /** The project exactly as the caller named it: updates are pushed under this spelling. */
  path: string
  /** The same project resolved (see `sameProject`). */
  key: string
  job: BatchJob
  candidates: readonly BatchCandidate[]
  controller: AbortController
  /** True from the start until the last run has ended, including after a cancel while the run dies. */
  active: boolean
  /** True while Keep or Discard is working through the candidates. */
  deciding: boolean
  send: BatchDeps['send']
  lastPushAt: number
  timer: ReturnType<typeof setTimeout> | null
}

const batches = new Map<string, BatchEntry>()

/** Two spellings of one folder ("/p" and "/p/.") are the same project; two folders are not. */
export const projectKey = (projectPath: string) => resolve(projectPath)
export const sameProject = (a: string, b: string) => projectKey(a) === projectKey(b)

const EMPTY: BatchState = { job: null, candidates: [] }

export const entryFor = (projectPath: string): BatchEntry | undefined => batches.get(projectKey(projectPath))
export const findByJob = (jobId: unknown): BatchEntry | undefined => [...batches.values()].find((e) => e.job.id === jobId)
export const activeBatch = (): BatchEntry | undefined => [...batches.values()].find((e) => e.active)

export function register(entry: BatchEntry): void {
  batches.set(entry.key, entry)
}

/** What this project has in a batch. Another project's job and candidates are not shown: after a project
 * switch its screen must not adopt them, or Keep would write them into the wrong project. */
export function getBatchState(projectPath: string): BatchState {
  const entry = typeof projectPath === 'string' ? entryFor(projectPath) : undefined
  return entry ? { job: entry.job, candidates: [...entry.candidates] } : EMPTY
}

const stateOf = (entry: BatchEntry): BatchState => ({ job: entry.job, candidates: [...entry.candidates] })

function emit(entry: BatchEntry, state: BatchState): void {
  entry.lastPushAt = Date.now()
  entry.send(BATCH_CHANNEL, { projectPath: entry.path, state })
}

/** Pushes the entry's state to the window. A quick sequence of changes is coalesced into one trailing
 * push rather than a flood; `immediate` (start, finish, cancel, keep, discard) always goes out now. */
export function notify(entry: BatchEntry, immediate = false): void {
  if (entry.timer && !immediate) return
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  const wait = THROTTLE_MS - (Date.now() - entry.lastPushAt)
  if (immediate || wait <= 0) {
    emit(entry, stateOf(entry))
    return
  }
  entry.timer = setTimeout(() => {
    entry.timer = null
    emit(entry, stateOf(entry))
  }, wait)
}

/** Replaces the job and/or candidates (never mutating the old ones) and tells the window. */
export function change(entry: BatchEntry, next: { job?: BatchJob; candidates?: readonly BatchCandidate[] }, immediate = false): void {
  if (next.job) entry.job = next.job
  if (next.candidates) entry.candidates = next.candidates
  notify(entry, immediate)
}

/** The batch is over and nothing is waiting: forget it, and tell the window there is nothing left. */
export function clearEntry(entry: BatchEntry): void {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  batches.delete(entry.key)
  emit(entry, EMPTY)
}

/** Test-only: stop any running batch and forget every one. */
export function resetBatchStateForTests(): void {
  for (const entry of batches.values()) {
    if (entry.timer) clearTimeout(entry.timer)
    entry.controller.abort()
  }
  batches.clear()
}
