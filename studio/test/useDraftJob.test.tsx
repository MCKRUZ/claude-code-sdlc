// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDraftJob } from '../src/components/useDraftJob'
import type { DraftProgressEvent, DraftRequest, StartDraftResult } from '../shared/types'
import { deferred, draftCandidate, draftJob, installDraftApi, removeDraftApi } from './draftFixtures'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  removeDraftApi()
})

const ENHANCE: DraftRequest = {
  kind: 'enhance', stageId: '1', document: '.sdlc/artifacts/01-requirements/requirements.md',
}

function setup(over: Record<string, unknown> = {}, project = '/p') {
  const studio = installDraftApi(over)
  const hook = renderHook(({ path }) => useDraftJob(path), { initialProps: { path: project } })
  return { studio, ...hook }
}

describe('useDraftJob: recovery and subscription', () => {
  it('asks main about the project it is showing, and again about the new one after a switch', async () => {
    const { studio, rerender } = setup({}, '/a')
    await waitFor(() => expect(studio.getDraftState).toHaveBeenCalledWith('/a'))
    rerender({ path: '/b' })
    await waitFor(() => expect(studio.getDraftState).toHaveBeenCalledWith('/b'))
  })

  it('starts idle, asks main what is going on, and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    const { studio, result, unmount } = setup({ onDraftProgress: vi.fn().mockReturnValue(unsubscribe) })
    await waitFor(() => expect(studio.getDraftState).toHaveBeenCalled())
    expect(result.current.state.phase).toBe('idle')
    expect(result.current.busyLabel).toBeNull()
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('recovers a job that was running when the screen was closed', async () => {
    const job = draftJob({ startedAt: Date.now() - 5000 })
    const { result } = setup({ getDraftState: vi.fn().mockResolvedValue({ running: job, candidate: null }) })
    await waitFor(() => expect(result.current.state.phase).toBe('running'))
    expect(result.current.busyLabel).toBe('requirements.narrative.md')
    const state = result.current.state
    if (state.phase !== 'running') throw new Error('unreachable')
    expect(state.scope).toEqual({ kind: 'enhance', stageId: '1' })
  })

  it('recovers a candidate that was waiting', async () => {
    const candidate = draftCandidate()
    const { result } = setup({ getDraftState: vi.fn().mockResolvedValue({ running: null, candidate }) })
    await waitFor(() => expect(result.current.state.phase).toBe('candidate'))
    expect(result.current.busyLabel).toBe('requirements.narrative.md')
  })

  it('picks up the candidate when a recovered job finishes while nobody was watching', async () => {
    vi.useFakeTimers()
    const getDraftState = vi.fn()
      .mockResolvedValueOnce({ running: draftJob(), candidate: null })
      .mockResolvedValue({ running: null, candidate: draftCandidate() })
    const { result } = setup({ getDraftState })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(result.current.state.phase).toBe('running')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(result.current.state.phase).toBe('candidate')
  })

  it('does not break when the progress channel cannot be subscribed to', async () => {
    const { result } = setup({ onDraftProgress: vi.fn(() => { throw new Error('no channel') }) })
    await act(async () => { await result.current.start(ENHANCE) })
    expect(result.current.state.phase).toBe('candidate')
  })
})

describe('useDraftJob: start', () => {
  it('asks main to start exactly what it was given and shows the candidate', async () => {
    const { studio, result } = setup()
    await act(async () => { await result.current.start(ENHANCE) })
    expect(studio.startDraft).toHaveBeenCalledWith('/p', ENHANCE)
    expect(result.current.state.phase).toBe('candidate')
  })

  it('shows running at once, under the label the summary will have', async () => {
    const run = deferred<StartDraftResult>()
    const { result } = setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    act(() => { void result.current.start(ENHANCE) })
    expect(result.current.state.phase).toBe('running')
    expect(result.current.busyLabel).toBe('requirements.narrative.md')
    await act(async () => { run.resolve({ ok: true, candidate: draftCandidate() }) })
  })

  it('treats a cancelled run as idle with a brief Cancelled notice and keeps nothing', async () => {
    const { studio, result } = setup({ startDraft: vi.fn().mockResolvedValue({ ok: false, error: 'Cancelled.', cancelled: true }) })
    await act(async () => { await result.current.start(ENHANCE) })
    expect(result.current.state).toMatchObject({ phase: 'idle', notice: 'Cancelled' })
    expect(studio.keepDraft).not.toHaveBeenCalled()
  })

  it('names the running job when a second start is refused', async () => {
    const running = draftJob({ label: 'design.narrative.md' })
    const { result } = setup({
      startDraft: vi.fn().mockResolvedValue({ ok: false, error: 'Already drafting design.narrative.md', running }),
    })
    await act(async () => { await result.current.start(ENHANCE) })
    expect(result.current.state).toMatchObject({ phase: 'error', message: 'Already drafting design.narrative.md' })
  })

  it.each([
    ['ok false with a reason', () => Promise.resolve({ ok: false, error: 'Claude is not installed.' }), 'Claude is not installed.'],
    ['ok false with no reason', () => Promise.resolve({ ok: false, error: '' }), 'The draft could not be made.'],
    ['a rejected call', () => Promise.reject(new Error('The window was closed.')), 'The window was closed.'],
  ])('shows one error line when start gives %s', async (_name, call, message) => {
    const { result } = setup({ startDraft: vi.fn(call) })
    await act(async () => { await result.current.start(ENHANCE) })
    expect(result.current.state).toMatchObject({ phase: 'error', message })
    expect(result.current.busyLabel).toBeNull()
  })

  it('retry runs the same request again', async () => {
    const startDraft = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'It stopped.' })
      .mockResolvedValueOnce({ ok: true, candidate: draftCandidate() })
    const { result } = setup({ startDraft })
    await act(async () => { await result.current.start(ENHANCE) })
    await act(async () => { await result.current.retry() })
    expect(startDraft).toHaveBeenNthCalledWith(2, '/p', ENHANCE)
    expect(result.current.state.phase).toBe('candidate')
  })

  it('does not start a second job while one is running', async () => {
    const run = deferred<StartDraftResult>()
    const { studio, result } = setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    act(() => { void result.current.start(ENHANCE) })
    await act(async () => { await result.current.start({ ...ENHANCE, document: 'x.md' }) })
    expect(studio.startDraft).toHaveBeenCalledTimes(1)
    await act(async () => { run.resolve({ ok: true, candidate: draftCandidate() }) })
  })

  it('drops a result for a project the person already left', async () => {
    const run = deferred<StartDraftResult>()
    const { result, rerender } = setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    act(() => { void result.current.start(ENHANCE) })
    rerender({ path: '/other' })
    await act(async () => { run.resolve({ ok: true, candidate: draftCandidate() }) })
    expect(result.current.state.phase).toBe('idle')
  })
})

describe('useDraftJob: progress and cancel', () => {
  it('shows what Claude is doing now from progress events', async () => {
    let emit!: (e: DraftProgressEvent) => void
    const run = deferred<StartDraftResult>()
    const { result } = setup({
      startDraft: vi.fn().mockReturnValue(run.promise),
      getDraftState: vi.fn().mockResolvedValue({ running: draftJob(), candidate: null }),
      onDraftProgress: vi.fn((cb: (e: DraftProgressEvent) => void) => { emit = cb; return () => {} }),
    })
    act(() => { void result.current.start(ENHANCE) })
    await act(async () => { emit({ jobId: 'job-1', activity: 'Reading requirements.md', elapsedMs: 2000 }) })
    expect(result.current.state).toMatchObject({ phase: 'running', activity: 'Reading requirements.md', jobId: 'job-1' })
    await act(async () => { run.resolve({ ok: true, candidate: draftCandidate() }) })
  })

  it('counts elapsed seconds locally every second, not only when an event arrives', async () => {
    vi.useFakeTimers()
    const run = deferred<StartDraftResult>()
    const { result } = setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    act(() => { void result.current.start(ENHANCE) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3100) })
    const state = result.current.state
    if (state.phase !== 'running') throw new Error('expected running')
    expect(Math.floor(state.elapsedMs / 1000)).toBe(3)
    await act(async () => { run.resolve({ ok: true, candidate: draftCandidate() }) })
  })

  it('stops its timer once the job is over', async () => {
    vi.useFakeTimers()
    const { result } = setup()
    await act(async () => { await result.current.start(ENHANCE) })
    // The clearInterval runs in the effect cleanup of the commit that moves phase off 'running';
    // under load (the CI runners) that commit lands a few microtasks after the act above, and
    // React's scheduler may hold a zero-delay timer of its own — so advance the fake clock by 0
    // (zero-delay timers and microtasks run, our 1 s interval would not) until the count is
    // clear or twenty cycles have passed. The assertion is the same.
    await act(async () => { await vi.waitFor(() => expect(vi.getTimerCount()).toBe(0)) })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancel stops the job, shows Cancelled, and ignores the run\'s late result', async () => {
    const run = deferred<StartDraftResult>()
    const { studio, result } = setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    act(() => { void result.current.start(ENHANCE) })
    await act(async () => { await result.current.cancel() })
    expect(studio.cancelDraft).toHaveBeenCalledTimes(1)
    expect(result.current.state).toMatchObject({ phase: 'idle', notice: 'Cancelled' })
    await act(async () => { run.resolve({ ok: true, candidate: draftCandidate() }) })
    expect(result.current.state.phase).toBe('idle')
  })
})

describe('useDraftJob: keep and discard', () => {
  async function withCandidate(over: Record<string, unknown> = {}) {
    const ctx = setup(over)
    await act(async () => { await ctx.result.current.start(ENHANCE) })
    return ctx
  }

  it('keep passes the project, the job and the person, then reports what was saved', async () => {
    const { studio, result } = await withCandidate({
      keepDraft: vi.fn().mockResolvedValue({ ok: true, written: 'a/requirements.narrative.md', warning: 'The ledger line was not written.' }),
    })
    await act(async () => { await result.current.keep('Matt K') })
    expect(studio.keepDraft).toHaveBeenCalledWith('/p', 'job-1', 'Matt K')
    expect(result.current.state).toMatchObject({
      phase: 'saved', written: 'a/requirements.narrative.md', warning: 'The ledger line was not written.',
    })
    expect(result.current.keptCount).toBe(1)
    expect(result.current.busyLabel).toBeNull()
  })

  it('a failed keep leaves the candidate so the person can try again', async () => {
    const { result } = await withCandidate({
      keepDraft: vi.fn().mockResolvedValue({ ok: false, error: 'That file is not on the allowlist.' }),
    })
    await act(async () => { await result.current.keep('Matt K') })
    expect(result.current.state).toMatchObject({
      phase: 'candidate', acting: false, actionError: 'That file is not on the allowlist.',
    })
    expect(result.current.keptCount).toBe(0)
    expect(result.current.busyLabel).not.toBeNull()
  })

  it('a keep that throws is also one line with the candidate kept', async () => {
    const { result } = await withCandidate({ keepDraft: vi.fn().mockRejectedValue(new Error('IPC closed.')) })
    await act(async () => { await result.current.keep('Matt K') })
    expect(result.current.state).toMatchObject({ phase: 'candidate', actionError: 'IPC closed.' })
  })

  it('discard passes the person and clears the candidate', async () => {
    const { studio, result } = await withCandidate()
    await act(async () => { await result.current.discard('Matt K') })
    expect(studio.discardDraft).toHaveBeenCalledWith('/p', 'job-1', 'Matt K')
    expect(result.current.state).toMatchObject({ phase: 'idle', notice: 'Discarded.' })
    expect(result.current.busyLabel).toBeNull()
  })

  it('a failed discard leaves the candidate', async () => {
    const { result } = await withCandidate({ discardDraft: vi.fn().mockResolvedValue({ ok: false, error: 'Could not record it.' }) })
    await act(async () => { await result.current.discard('Matt K') })
    expect(result.current.state).toMatchObject({ phase: 'candidate', actionError: 'Could not record it.' })
  })
})
