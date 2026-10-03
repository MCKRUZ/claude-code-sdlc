import { vi } from 'vitest'
import type { DraftCandidate, DraftJob, DraftState, KeepDraftResult, StartDraftResult } from '../shared/types'

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
