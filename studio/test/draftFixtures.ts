import { vi } from 'vitest'
import type {
  BatchCandidate, BatchJob, BatchState, DraftCandidate, DraftJob, DraftState, KeepBatchResult, KeepDraftResult, StartDraftResult,
} from '../shared/types'

export function draftJob(over: Partial<DraftJob> = {}): DraftJob {
  return {
    id: 'job-1', kind: 'enhance', stageId: '1',
    target: '.sdlc/artifacts/01-requirements/requirements.narrative.md',
    label: 'requirements.narrative.md', startedAt: Date.now(), ...over,
  }
}

export function draftCandidate(over: Partial<DraftCandidate> = {}): DraftCandidate {
  return {
    jobId: 'job-1', kind: 'enhance', stageId: '1',
    target: '.sdlc/artifacts/01-requirements/requirements.narrative.md',
    text: '## What this covers\n\nA plain summary.', costUsd: 0.12, replacesExisting: false, ...over,
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

type Api = Record<string, ReturnType<typeof vi.fn>>

/** A window.studio double with every draft call; each can be overridden. */
export function installDraftApi(over: Record<string, unknown> = {}): Api {
  const idle: DraftState = { running: null, candidate: null }
  const studio: Api = {
    getDraftState: vi.fn().mockResolvedValue(idle),
    startDraft: vi.fn().mockResolvedValue({ ok: true, candidate: draftCandidate() } satisfies StartDraftResult),
    cancelDraft: vi.fn().mockResolvedValue({ ok: true }),
    keepDraft: vi.fn().mockResolvedValue({ ok: true, written: draftCandidate().target } satisfies KeepDraftResult),
    discardDraft: vi.fn().mockResolvedValue({ ok: true }),
    onDraftProgress: vi.fn().mockReturnValue(() => {}),
    getNarrativeCoverage: vi.fn().mockResolvedValue({ ok: true, hasData: false, notes: [], withNarrative: 0, total: 0, artifacts: [] }),
    getReviewStanding: vi.fn().mockResolvedValue({ ok: true, tracked: 0, openDebt: 0, fixedClaimMismatches: 0 }),
    ...over,
  } as Api
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

export function removeDraftApi() {
  // @ts-expect-error - cleaning up the test double
  delete window.studio
}

export function batchJob(over: Partial<BatchJob> = {}): BatchJob {
  return {
    id: 'batch-1', kind: 'summarise', startedAt: Date.now(), total: 3, done: 0,
    currentLabel: null, costUsd: null, phase: 'finished', ...over,
  }
}

export function batchCandidate(n: number, over: Partial<BatchCandidate> = {}): BatchCandidate {
  return {
    id: `c${n}`, target: `.sdlc/context/intake/DOC-00${n}-file-${n}.md`, label: `DOC-00${n} · file-${n}.md`,
    status: 'ready', text: `## Summary ${n}

What document ${n} says.`, replacesExisting: false, ...over,
  }
}

export function keptResult(over: Partial<KeepBatchResult> = {}): KeepBatchResult {
  return { ok: true, kept: [], failed: [], warnings: [], ...over }
}

/** A window.studio double with every batch call (and the catalogue call a panel needs); each can be
 * overridden. `pushBatchState` delivers a main-process update to whoever subscribed. */
export function installBatchApi(over: Record<string, unknown> = {}, initial: BatchState = { job: null, candidates: [] }) {
  let listener: ((update: { projectPath: string; state: BatchState }) => void) | null = null
  const unsubscribe = vi.fn(() => { listener = null })
  const studio: Api = {
    getBatchState: vi.fn().mockResolvedValue(initial),
    previewBatch: vi.fn().mockResolvedValue({ ok: true, kind: 'summarise', documents: [] }),
    startBatch: vi.fn().mockResolvedValue({ ok: true, job: batchJob({ phase: 'running' }) }),
    cancelBatch: vi.fn().mockResolvedValue({ ok: true }),
    keepBatch: vi.fn().mockResolvedValue(keptResult()),
    discardBatch: vi.fn().mockResolvedValue({ ok: true, warnings: [] }),
    writeRegistry: vi.fn(),
    onBatchState: vi.fn((cb: typeof listener) => { listener = cb; return unsubscribe }),
    ...over,
  } as Api
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  const pushBatchState = (projectPath: string, state: BatchState) => listener?.({ projectPath, state })
  return { studio, unsubscribe, pushBatchState }
}
