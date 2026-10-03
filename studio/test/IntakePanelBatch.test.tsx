// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntakePanel } from '../src/components/IntakePanel'
import type { BatchState, IntakeCatalogue, RegistryResult } from '../shared/types'
import { batchCandidate, batchJob, installBatchApi, removeDraftApi } from './draftFixtures'

afterEach(() => {
  cleanup()
  removeDraftApi()
})

const docs = [
  { id: 'DOC-001', filename: 'alpha-brief.md' },
  { id: 'DOC-002', filename: 'beta-rfp.pdf' },
  { id: 'DOC-003', filename: 'gamma-api.md' },
]

const catalogue = (locked: boolean): IntakeCatalogue => ({
  ok: true,
  documents: docs.map((d, i) => ({ id: d.id, file: d.filename, type: 'md', tokens: 100 * (i + 1), skipped: false, priority: null })),
  locked,
  priorityOrder: [],
  totals: { documents: 3, estimatedTokens: 600, activeDocuments: 3 },
})

const registry = (over: Partial<RegistryResult> = {}): RegistryResult => ({
  ok: true, documents: 3, summarised: 3, missingSummaries: [], indexTokens: 400, indexBudget: 2000,
  indexWithinBudget: true, trimmed: [], registryCreated: true, warnings: [], ...over,
})

async function open(locked = true, over: Record<string, unknown> = {}, initial?: BatchState, actor = '@matt') {
  const api = installBatchApi({ runIntake: vi.fn().mockResolvedValue(catalogue(locked)), ...over }, initial)
  render(<IntakePanel projectPath="/p" actor={actor} />)
  fireEvent.click(screen.getByRole('button', { name: 'Catalogue the documents' }))
  await screen.findAllByTestId('intake-row')
  return api
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const text = () => screen.getByTestId('intake-panel').textContent ?? ''

describe('IntakePanel: the batch actions are gated on locked ids', () => {
  it('says to lock the ids first, and offers none of the three actions, before they are locked', async () => {
    await open(false)
    expect(screen.getByText('Lock the document ids to summarise them.')).toBeTruthy()
    for (const name of ['Summarise the documents', 'Analyse the documents', 'Write the registry and index']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('offers the three actions once locked, and labels the two that use Claude', async () => {
    await open(true)
    expect(screen.queryByText('Lock the document ids to summarise them.')).toBeNull()
    expect(button('Summarise the documents').disabled).toBe(false)
    expect(screen.getAllByText('Uses Claude.')).toHaveLength(2)
  })

  it('calls nothing in main when the screen opens or the catalogue is shown', async () => {
    const { studio } = await open(true)
    for (const name of ['previewBatch', 'startBatch', 'writeRegistry', 'keepBatch', 'discardBatch']) {
      expect(studio[name]).not.toHaveBeenCalled()
    }
  })
})

describe('IntakePanel: confirming a batch', () => {
  it('lists every document and says Claude runs once for each, and starts nothing until Start', async () => {
    const { studio } = await open(true, { previewBatch: vi.fn().mockResolvedValue({ ok: true, kind: 'summarise', documents: docs }) })
    fireEvent.click(button('Summarise the documents'))
    const confirm = await screen.findByTestId('batch-confirm')
    expect(confirm.textContent).toContain('Claude runs once for each of these 3 documents')
    for (const d of docs) expect(confirm.textContent).toContain(`${d.id} · ${d.filename}`)
    expect(studio.previewBatch).toHaveBeenCalledWith('/p', 'summarise')
    expect(studio.startBatch).not.toHaveBeenCalled()

    fireEvent.click(button('Start'))
    await waitFor(() => expect(studio.startBatch).toHaveBeenCalledWith('/p', 'summarise'))
    expect(studio.startBatch).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('batch-confirm')).toBeNull()
  })

  it('calls nothing when the confirmation is cancelled', async () => {
    const { studio } = await open(true, { previewBatch: vi.fn().mockResolvedValue({ ok: true, kind: 'summarise', documents: docs }) })
    fireEvent.click(button('Summarise the documents'))
    await screen.findByTestId('batch-confirm')
    fireEvent.click(within(screen.getByTestId('batch-confirm')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('batch-confirm')).toBeNull()
    expect(studio.startBatch).not.toHaveBeenCalled()
  })

  it('says what the analysis reads and writes', async () => {
    const { studio } = await open(true, { previewBatch: vi.fn().mockResolvedValue({ ok: true, kind: 'analyse', documents: docs }) })
    fireEvent.click(button('Analyse the documents'))
    const confirm = await screen.findByTestId('batch-confirm')
    expect(studio.previewBatch).toHaveBeenCalledWith('/p', 'analyse')
    expect(confirm.textContent).toContain('Claude reads the summaries of these 3 documents and writes the contradiction list and the question list.')
    expect(confirm.textContent).toContain('DOC-003 · gamma-api.md')
  })

  it('shows main\'s refusal as one alert line and no confirmation', async () => {
    await open(true, { previewBatch: vi.fn().mockResolvedValue({ ok: false, error: 'Every document already has a summary' }) })
    fireEvent.click(button('Summarise the documents'))
    expect((await screen.findByRole('alert')).textContent).toBe('Every document already has a summary')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByTestId('batch-confirm')).toBeNull()
  })

  it('shows one alert when Start is refused', async () => {
    await open(true, {
      previewBatch: vi.fn().mockResolvedValue({ ok: true, kind: 'summarise', documents: docs }),
      startBatch: vi.fn().mockResolvedValue({ ok: false, error: 'Another draft is running.' }),
    })
    fireEvent.click(button('Summarise the documents'))
    await screen.findByTestId('batch-confirm')
    fireEvent.click(button('Start'))
    expect((await screen.findByRole('alert')).textContent).toBe('Another draft is running.')
  })
})

describe('IntakePanel: while a batch runs or waits', () => {
  it('turns the model buttons off with a reason while a batch runs', async () => {
    await open(true, {}, { job: batchJob({ phase: 'running', total: 3 }), candidates: [] })
    await screen.findByTestId('batch-running')
    expect(button('Summarise the documents').disabled).toBe(true)
    expect(button('Analyse the documents').disabled).toBe(true)
    expect(screen.getByTestId('batch-busy-reason').textContent).toBe('A batch is running.')
  })

  it('turns the model buttons off with the reason while results wait for a decision', async () => {
    await open(true, {}, { job: batchJob(), candidates: [batchCandidate(1)] })
    await screen.findByTestId('batch-header')
    expect(button('Summarise the documents').disabled).toBe(true)
    expect(button('Analyse the documents').disabled).toBe(true)
    expect(screen.getByTestId('batch-busy-reason').textContent).toBe('Keep or discard the waiting results first')
  })

  it('shows a waiting batch on reopening, before anything is catalogued', async () => {
    installBatchApi({}, { job: batchJob(), candidates: [batchCandidate(1)] })
    render(<IntakePanel projectPath="/p" actor="@matt" />)
    expect(await screen.findByTestId('batch-candidate')).toBeTruthy()
  })

  it('shows no batch from another project', async () => {
    const { pushBatchState } = installBatchApi()
    render(<IntakePanel projectPath="/p" actor="@matt" />)
    await Promise.resolve()
    pushBatchState('/other', { job: batchJob(), candidates: [batchCandidate(1)] })
    await Promise.resolve()
    expect(screen.queryByTestId('batch-view')).toBeNull()
  })

  it('signs Keep with the signed-in person', async () => {
    const { studio } = await open(true, { keepBatch: vi.fn().mockResolvedValue({ ok: true, kept: ['c1'], failed: [], warnings: [] }) },
      { job: batchJob(), candidates: [batchCandidate(1)] }, '@priya-n')
    fireEvent.click(await screen.findByRole('button', { name: 'Keep all' }))
    await waitFor(() => expect(studio.keepBatch).toHaveBeenCalledWith('/p', 'batch-1', '@priya-n'))
  })
})

describe('IntakePanel: the registry', () => {
  it('writes it with no model, and shows the counts, the missing summaries and the budget sentence', async () => {
    const writeRegistry = vi.fn().mockResolvedValue(registry({
      summarised: 1, missingSummaries: ['DOC-002', 'DOC-003'], indexWithinBudget: false, trimmed: ['one-line summaries'],
      warnings: ['The registry already existed.'],
    }))
    const { studio } = await open(true, { writeRegistry })
    fireEvent.click(button('Write the registry and index'))
    const result = await screen.findByTestId('registry-result')
    expect(writeRegistry).toHaveBeenCalledWith('/p')
    expect(studio.previewBatch).not.toHaveBeenCalled()
    expect(studio.startBatch).not.toHaveBeenCalled()
    expect(result.textContent).toContain('3 documents, 1 summarised')
    expect(result.textContent).toContain('Not yet summarised: DOC-002, DOC-003')
    expect(result.textContent).toContain('one-line summaries')
    expect(result.textContent).toContain('The index is over its budget even with ids alone; it was written in full.')
    expect(result.textContent).toContain('The registry already existed.')
  })

  it('leaves out the missing and budget lines when there is nothing to say', async () => {
    await open(true, { writeRegistry: vi.fn().mockResolvedValue(registry()) })
    fireEvent.click(button('Write the registry and index'))
    const result = await screen.findByTestId('registry-result')
    expect(result.textContent).toBe('3 documents, 3 summarised')
  })

  it.each([
    ['ok is false with a reason', () => Promise.resolve(registry({ ok: false, error: 'The script is missing.' }))],
    ['the call rejects', () => Promise.reject(new Error('The script is missing.'))],
  ])('shows one alert line and no counts when %s', async (_name, call) => {
    await open(true, { writeRegistry: vi.fn(call) })
    fireEvent.click(button('Write the registry and index'))
    expect((await screen.findByRole('alert')).textContent).toBe('The script is missing.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByTestId('registry-result')).toBeNull()
    expect(text()).not.toContain('summarised')
  })
})
