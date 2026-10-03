// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchCandidateList } from '../src/components/BatchCandidateList'
import { useDraftBatch } from '../src/components/useDraftBatch'
import type { BatchState } from '../shared/types'
import { batchCandidate, batchJob, installBatchApi, keptResult, removeDraftApi } from './draftFixtures'

afterEach(() => {
  cleanup()
  removeDraftApi()
})

function Harness({ actor = '@matt' }: { actor?: string }) {
  const batch = useDraftBatch('/p')
  return <BatchCandidateList batch={batch} actor={actor} />
}

async function shown(state: BatchState, over: Record<string, unknown> = {}, actor?: string) {
  const api = installBatchApi(over, state)
  render(<Harness actor={actor} />)
  await waitFor(() => expect(screen.getByTestId('batch-view')).toBeTruthy())
  return api
}

const rows = () => screen.queryAllByTestId('batch-candidate')
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const view = () => screen.getByTestId('batch-view').textContent ?? ''
const three = [batchCandidate(1), batchCandidate(2), batchCandidate(3)]

describe('BatchCandidateList: progress while running', () => {
  const running = (over = {}) => ({ job: batchJob({ phase: 'running', total: 8, done: 2, currentLabel: 'DOC-003 · gamma-api.md', ...over }), candidates: [] })

  it('reads "Summarising 3 of 8" with the current document, the elapsed time and a Cancel that says what is kept', async () => {
    await shown(running())
    expect(view()).toContain('Summarising 3 of 8')
    expect(screen.getByTestId('batch-current').textContent).toBe('DOC-003 · gamma-api.md')
    expect(view()).toMatch(/Working for \d+ s/)
    expect(view()).toContain('Finished results are kept.')
  })

  it('reads "Analysing the documents" for the analysis, which is one run', async () => {
    await shown(running({ kind: 'analyse', total: 1, done: 0 }))
    expect(view()).toContain('Analysing the documents')
    expect(view()).not.toContain(' of ')
  })

  it.each([
    [0.3, 'Cost so far: $0.30'],
    [0.004, 'Cost so far: less than $0.01'],
    [0.01, 'Cost so far: $0.01'],
  ])('shows a cost of %s as "%s"', async (costUsd, line) => {
    await shown(running({ costUsd }))
    expect(screen.getByTestId('batch-cost').textContent).toBe(line)
  })

  it.each([[null], [0]])('leaves the cost out, and never shows $0.00, when it is %s', async (costUsd) => {
    await shown(running({ costUsd }))
    expect(screen.queryByTestId('batch-cost')).toBeNull()
    expect(view()).not.toContain('$0.00')
    expect(view()).not.toContain('Cost')
  })

  it('asks main to cancel, and offers no Keep while the batch runs', async () => {
    const { studio } = await shown({ ...running(), candidates: [batchCandidate(1)] })
    fireEvent.click(button('Cancel'))
    expect(studio.cancelBatch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Keep all' })).toBeNull()
  })
})

describe('BatchCandidateList: the finished list', () => {
  const finished = (candidates = three, job = {}) => ({ job: batchJob(job), candidates })

  it('says what a cancelled batch kept', async () => {
    await shown(finished([batchCandidate(1), batchCandidate(2)], { phase: 'cancelled' }))
    expect(view()).toContain('Cancelled — 2 finished results kept.')
  })

  it('shows each ready candidate ticked, with its label, its target and a preview that opens', async () => {
    await shown(finished())
    expect(rows()).toHaveLength(3)
    const first = rows()[0]
    const box = within(first).getByRole('checkbox', { name: 'Keep DOC-001 · file-1.md' }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(first.textContent).toContain('.sdlc/context/intake/DOC-001-file-1.md')
    expect(screen.queryByTestId('batch-preview')).toBeNull()
    fireEvent.click(within(first).getByRole('button', { name: /Show preview/ }))
    expect(within(screen.getByTestId('batch-preview')).getByText('Summary 1')).toBeTruthy()
  })

  it('says when keeping would replace a file, and only then', async () => {
    await shown(finished([batchCandidate(1, { replacesExisting: true }), batchCandidate(2)]))
    expect(screen.getAllByTestId('batch-replace-note')).toHaveLength(1)
    expect(rows()[0].textContent).toContain('replaces the existing file')
  })

  it('lists a failed candidate with its one line and no way to keep it', async () => {
    await shown(finished([batchCandidate(1), batchCandidate(2, { status: 'failed', text: '', error: 'The summary was empty.' })]))
    const failed = rows()[1]
    expect(failed.textContent).toContain('failed')
    expect(failed.textContent).toContain('The summary was empty.')
    expect(within(failed).queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps all with no id list, and says what was written', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({ kept: ['c1', 'c2', 'c3'] }))
    await shown(finished(), { keepBatch })
    fireEvent.click(button('Keep all'))
    expect(await screen.findByText('Saved 3 files.')).toBeTruthy()
    expect(keepBatch).toHaveBeenCalledWith('/p', 'batch-1', '@matt')
    expect(view()).toContain('Written: .sdlc/context/intake/DOC-002-file-2.md')
    expect(rows()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Keep all' })).toBeNull()
  })

  it('keeps only the ticked ones, and is off when none is ticked', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({ kept: ['c1', 'c3'] }))
    await shown(finished(), { keepBatch })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep DOC-002 · file-2.md' }))
    fireEvent.click(button('Keep selected'))
    await screen.findByText('Saved 2 files.')
    expect(keepBatch).toHaveBeenCalledWith('/p', 'batch-1', '@matt', ['c1', 'c3'])
  })

  it('turns Keep selected off when every box is unticked', async () => {
    await shown(finished([batchCandidate(1)]))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(button('Keep selected').disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(button('Keep selected').disabled).toBe(false)
  })

  it('offers Discard the rest only after a partial keep, and discards exactly the ready ones left', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({ kept: ['c1'] }))
    const { studio } = await shown(finished(), { keepBatch })
    expect(screen.queryByRole('button', { name: 'Discard the rest' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep DOC-002 · file-2.md' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep DOC-003 · file-3.md' }))
    fireEvent.click(button('Keep selected'))
    await screen.findByText('Saved 1 file.')
    fireEvent.click(button('Discard the rest'))
    await screen.findByText('Discarded 2 results.')
    expect(studio.discardBatch).toHaveBeenCalledWith('/p', 'batch-1', '@matt', ['c2', 'c3'])
    expect(view()).toContain('Saved 1 file.')
    expect(rows()).toHaveLength(0)
  })

  it('discards everything with no id list and writes nothing', async () => {
    const { studio } = await shown(finished())
    fireEvent.click(button('Discard all'))
    await screen.findByText('Discarded 3 results.')
    expect(studio.discardBatch).toHaveBeenCalledWith('/p', 'batch-1', '@matt')
    expect(studio.keepBatch).not.toHaveBeenCalled()
  })

  it('names the file written and the file not written when only one of the pair was kept', async () => {
    const pair = [batchCandidate(1, { id: 'a', label: 'contradiction-list.md', target: '.sdlc/artifacts/00-discovery/contradiction-list.md' }),
      batchCandidate(2, { id: 'b', label: 'question-list.md', target: '.sdlc/artifacts/00-discovery/question-list.md' })]
    const keepBatch = vi.fn().mockResolvedValue(keptResult({
      ok: false, kept: ['a'], failed: [{ id: 'b', label: 'question-list.md', error: 'The file is read-only.' }],
    }))
    await shown(finished(pair, { kind: 'analyse' }), { keepBatch })
    fireEvent.click(button('Keep all'))
    await screen.findByText('Saved 1 file.')
    expect(view()).toContain('Written: .sdlc/artifacts/00-discovery/contradiction-list.md')
    expect(screen.getByTestId('batch-keep-failed').textContent).toBe('question-list.md: The file is read-only.')
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('question-list.md')])
  })

  it('shows warnings as plain lines, not alerts', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({ kept: ['c1'], warnings: ['The draft ledger could not be written.'] }))
    await shown(finished([batchCandidate(1)]), { keepBatch })
    fireEvent.click(button('Keep all'))
    await screen.findByText('The draft ledger could not be written.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows one alert when a Keep fails as a whole, and keeps the list', async () => {
    const keepBatch = vi.fn().mockResolvedValue(keptResult({ ok: false, error: 'That batch is gone.' }))
    await shown(finished(), { keepBatch })
    fireEvent.click(button('Keep all'))
    expect((await screen.findByRole('alert')).textContent).toBe('That batch is gone.')
    expect(rows()).toHaveLength(3)
  })

  it('disables Keep and Discard with a visible reason when nobody is signed in', async () => {
    await shown(finished(), {}, '')
    for (const name of ['Keep all', 'Keep selected', 'Discard all']) expect(button(name).disabled).toBe(true)
    expect(screen.getByTestId('batch-sign-in-reason').textContent).toBe('Sign in to keep or discard.')
  })

  it('draws nothing for a project with no batch', async () => {
    installBatchApi()
    render(<Harness />)
    await Promise.resolve()
    expect(screen.queryByTestId('batch-view')).toBeNull()
  })
})
