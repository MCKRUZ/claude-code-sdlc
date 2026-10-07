// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDraftBatch } from '../src/components/useDraftBatch'
import type { BatchState } from '../shared/types'
import { batchCandidate, batchJob, installBatchApi, keptResult, removeDraftApi } from './draftFixtures'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  removeDraftApi()
})

const waiting: BatchState = {
  job: batchJob(),
  candidates: [batchCandidate(1), batchCandidate(2), batchCandidate(3)],
}

function setup(over: Record<string, unknown> = {}, initial?: BatchState, project = '/p') {
  const api = installBatchApi(over, initial)
  const hook = renderHook(({ path }) => useDraftBatch(path), { initialProps: { path: project } })
  return { ...api, ...hook }
}

describe('useDraftBatch: recovery and subscription', () => {
  it('asks main about the project it shows, and again about the new one after a switch', async () => {
    const { studio, rerender } = setup({}, undefined, '/a')
    await waitFor(() => expect(studio.getBatchState).toHaveBeenCalledWith('/a'))
    rerender({ path: '/b' })
    await waitFor(() => expect(studio.getBatchState).toHaveBeenCalledWith('/b'))
  })

  it('shows a batch that was waiting for Keep or Discard when the screen was reopened', async () => {
    const { result } = setup({}, waiting)
    await waitFor(() => expect(result.current.state.candidates).toHaveLength(3))
    expect(result.current.state.job?.id).toBe('batch-1')
  })

  it('shows a batch that was still running when the screen was reopened', async () => {
    const { result } = setup({}, { job: batchJob({ phase: 'running', done: 2 }), candidates: [batchCandidate(1)] })
    await waitFor(() => expect(result.current.state.job?.phase).toBe('running'))
  })

  it('follows what main pushes for its own project and unsubscribes on unmount', async () => {
    const { result, pushBatchState, unsubscribe, unmount } = setup()
    await waitFor(() => expect(result.current.state.job).toBeNull())
    act(() => pushBatchState('/p', waiting))
    expect(result.current.state.candidates).toHaveLength(3)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('ignores an update that belongs to another project', async () => {
    const { result, pushBatchState } = setup()
    await waitFor(() => expect(result.current.state.job).toBeNull())
    act(() => pushBatchState('/other', waiting))
    expect(result.current.state).toEqual({ job: null, candidates: [] })
  })

  it('drops the old project\'s batch when the project changes, and ignores its late answer', async () => {
    let answerA!: (s: BatchState) => void
    const getBatchState = vi.fn()
      .mockReturnValueOnce(new Promise<BatchState>((r) => { answerA = r }))
      .mockResolvedValue({ job: null, candidates: [] })
    const { result, rerender } = setup({ getBatchState }, undefined, '/a')
    rerender({ path: '/b' })
    await waitFor(() => expect(getBatchState).toHaveBeenCalledWith('/b'))
    await act(async () => { answerA(waiting) })
    expect(result.current.state.candidates).toHaveLength(0)
  })

  it('does not let an older answer overwrite a newer push', async () => {
    let answer!: (s: BatchState) => void
    const getBatchState = vi.fn().mockReturnValue(new Promise<BatchState>((r) => { answer = r }))
    const { result, pushBatchState } = setup({ getBatchState })
    act(() => pushBatchState('/p', waiting))
    await act(async () => { answer({ job: null, candidates: [] }) })
    expect(result.current.state.candidates).toHaveLength(3)
  })

  it('does not break when main has no batch channel', async () => {
    const { result } = setup({ onBatchState: vi.fn(() => { throw new Error('no channel') }), getBatchState: vi.fn().mockRejectedValue(new Error('no')) })
    await act(async () => { await Promise.resolve() })
    expect(result.current.state.job).toBeNull()
  })
})

describe('useDraftBatch: calls', () => {
  it('previews and starts for the project it shows, and returns the answer to the caller', async () => {
    const preview = { ok: false, error: 'Lock the document ids first' }
    const { studio, result } = setup({ previewBatch: vi.fn().mockResolvedValue(preview) })
    let got: unknown
    await act(async () => { got = await result.current.preview('summarise') })
    expect(got).toEqual(preview)
    expect(studio.previewBatch).toHaveBeenCalledWith('/p', 'summarise')
    await act(async () => { await result.current.start('analyse') })
    expect(studio.startBatch).toHaveBeenCalledWith('/p', 'analyse')
    expect(result.current.state.job?.phase).toBe('running')
  })

  it('turns a rejected call into a refusal rather than an exception', async () => {
    const { result } = setup({ previewBatch: vi.fn().mockRejectedValue(new Error('boom')), startBatch: vi.fn().mockRejectedValue(new Error('bang')) })
    await act(async () => {
      expect(await result.current.preview('analyse')).toEqual({ ok: false, error: 'boom' })
      expect(await result.current.start('analyse')).toEqual({ ok: false, error: 'bang' })
    })
  })

  it('cancels through main', async () => {
    const { studio, result } = setup()
    await act(async () => { await result.current.cancel() })
    expect(studio.cancelBatch).toHaveBeenCalledTimes(1)
  })

  it('keeps everything with no id list, and records which files were written', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({ kept: ['c1', 'c2', 'c3'] }))
    const { result } = setup({ keepBatch }, waiting)
    await waitFor(() => expect(result.current.state.candidates).toHaveLength(3))
    await act(async () => { await result.current.keep('@matt') })
    expect(keepBatch).toHaveBeenCalledWith('/p', 'batch-1', '@matt')
    expect(result.current.state.candidates).toHaveLength(0)
    expect(result.current.outcome?.saved?.map((s) => s.target)).toEqual(waiting.candidates.map((c) => c.target))
  })

  it('keeps the ones that failed to write in the list and names them', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({
      ok: false, kept: ['c1'], failed: [{ id: 'c2', label: 'question-list.md', error: 'The disk is full.' }],
    }))
    const { result } = setup({ keepBatch }, waiting)
    await waitFor(() => expect(result.current.state.candidates).toHaveLength(3))
    await act(async () => { await result.current.keep('@matt', ['c1', 'c2']) })
    expect(keepBatch).toHaveBeenCalledWith('/p', 'batch-1', '@matt', ['c1', 'c2'])
    expect(result.current.state.candidates.map((c) => c.id)).toEqual(['c2', 'c3'])
    expect(result.current.outcome?.failed).toEqual([{ id: 'c2', label: 'question-list.md', error: 'The disk is full.' }])
  })

  it('shows the main process\'s line when a Keep fails as a whole, and clears it on the next try', async () => {
    const keepBatch = vi.fn()
      .mockResolvedValueOnce(keptResult({ ok: false, error: 'That batch is gone.' }))
      .mockResolvedValue(keptResult({ kept: ['c1'] }))
    const { result } = setup({ keepBatch }, waiting)
    await waitFor(() => expect(result.current.state.candidates).toHaveLength(3))
    await act(async () => { await result.current.keep('@matt') })
    expect(result.current.actionError).toBe('That batch is gone.')
    await act(async () => { await result.current.keep('@matt') })
    expect(result.current.actionError).toBeNull()
  })

  it('discards with and without an id list, and counts what was discarded', async () => {
    const { studio, result } = setup({}, waiting)
    await waitFor(() => expect(result.current.state.candidates).toHaveLength(3))
    await act(async () => { await result.current.discard('@matt', ['c1']) })
    expect(studio.discardBatch).toHaveBeenLastCalledWith('/p', 'batch-1', '@matt', ['c1'])
    expect(result.current.state.candidates.map((c) => c.id)).toEqual(['c2', 'c3'])
    await act(async () => { await result.current.discard('@matt') })
    expect(studio.discardBatch).toHaveBeenLastCalledWith('/p', 'batch-1', '@matt')
    expect(result.current.state.candidates).toHaveLength(0)
    expect(result.current.outcome?.discarded).toBe(3)
  })

  it('refuses a second Keep while the first is still with main', async () => {
    let finish!: (r: ReturnType<typeof keptResult>) => void
    const keepBatch = vi.fn().mockReturnValue(new Promise((r) => { finish = r }))
    const { result } = setup({ keepBatch }, waiting)
    await waitFor(() => expect(result.current.state.candidates).toHaveLength(3))
    act(() => { void result.current.keep('@matt') })
    await act(async () => { await result.current.keep('@matt') })
    expect(keepBatch).toHaveBeenCalledTimes(1)
    expect(result.current.acting).toBe(true)
    await act(async () => { finish(keptResult({ kept: ['c1'] })) })
    expect(result.current.acting).toBe(false)
  })
})

describe('useDraftBatch: elapsed time', () => {
  it('ticks while the job runs and stops when it ends, and clears its timer', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const { result, pushBatchState, unmount } = setup({}, { job: batchJob({ phase: 'running', startedAt }), candidates: [] })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(result.current.elapsedMs).toBeLessThan(1000)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(5000)
    act(() => pushBatchState('/p', { job: batchJob({ phase: 'finished', startedAt }), candidates: [] }))
    // The interval is cleared in an effect cleanup of the commit above; under load (the Windows
    // runner) that cleanup lands a few microtasks later — flush until it has, same assertion.
    for (let i = 0; i < 20 && vi.getTimerCount() > 0; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.elapsedMs).toBe(0)
    unmount()
    // React's scheduler may still hold a zero-delay timer of its own (the ubuntu runner read 1
    // here with every assertion above green): advance by 0 to run those; an interval of ours
    // would survive this and still fail the count.
    for (let i = 0; i < 20 && vi.getTimerCount() > 0; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(vi.getTimerCount()).toBe(0)
  })
})
