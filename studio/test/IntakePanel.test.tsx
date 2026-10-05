// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntakePanel } from '../src/components/IntakePanel'
import type { IntakeCatalogue, IntakeDocument } from '../shared/types'

const doc = (n: number, over: Partial<IntakeDocument> = {}): IntakeDocument => ({
  id: `DOC-00${n}`, file: `docs/file-${n}.pdf`, type: 'pdf', tokens: 1000 * n, skipped: false, priority: null, ...over,
})

const catalogue = (over: Partial<IntakeCatalogue> = {}): IntakeCatalogue => ({
  ok: true,
  documents: [doc(1), doc(2), doc(3)],
  locked: false,
  priorityOrder: [],
  totals: { documents: 3, estimatedTokens: 6000, activeDocuments: 3 },
  ...over,
})

function install(runIntake: unknown) {
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { runIntake }
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

const catalogueButton = () => screen.getByRole('button', { name: 'Catalogue the documents' })
const rows = () => screen.queryAllByTestId('intake-row')
const rowFor = (id: string) => rows().find((r) => r.textContent?.includes(id)) as HTMLElement
const panelText = () => screen.getByTestId('intake-panel').textContent ?? ''

async function catalogued(result: IntakeCatalogue) {
  const run = vi.fn().mockResolvedValue(result)
  install(run)
  render(<IntakePanel projectPath="/p" />)
  fireEvent.click(catalogueButton())
  await screen.findAllByTestId('intake-row')
  return run
}

describe('IntakePanel: cataloguing', () => {
  it('does not run on mount, because the script writes the catalogue the first time it runs', () => {
    const run = vi.fn()
    install(run)
    render(<IntakePanel projectPath="/p" />)
    expect(run).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(0)
  })

  it('runs with no change when the button is pressed and renders one row per document with totals', async () => {
    const run = await catalogued(catalogue())
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('/p')
    expect(rows()).toHaveLength(3)
    const first = rowFor('DOC-001')
    expect(first.textContent).toContain('docs/file-1.pdf')
    expect(first.textContent).toContain('pdf')
    expect(first.textContent).toContain('1000 tokens')
    expect(screen.getByTestId('intake-totals').textContent).toBe('3 documents, about 6000 tokens, 3 active')
  })

  it('says no reference documents were found and draws no table for an empty catalogue', async () => {
    install(vi.fn().mockResolvedValue(catalogue({ documents: [], totals: { documents: 0, estimatedTokens: 0, activeDocuments: 0 } })))
    render(<IntakePanel projectPath="/p" />)
    fireEvent.click(catalogueButton())
    expect(await screen.findByText('No reference documents found')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows the priority position when one is set', async () => {
    await catalogued(catalogue({
      documents: [doc(1, { priority: 2 }), doc(2, { priority: 1 }), doc(3)], priorityOrder: ['DOC-002', 'DOC-001'],
    }))
    expect(rowFor('DOC-002').textContent).toContain('Priority 1')
    expect(rowFor('DOC-001').textContent).toContain('Priority 2')
    expect(rowFor('DOC-003').textContent).not.toContain('Priority')
  })
})

describe('IntakePanel: skip', () => {
  it('sends only the id being newly skipped, because the script adds to what is already skipped', async () => {
    const run = await catalogued(catalogue({ documents: [doc(1, { skipped: true }), doc(2), doc(3)] }))
    run.mockResolvedValueOnce(catalogue({ documents: [doc(1, { skipped: true }), doc(2), doc(3, { skipped: true })] }))

    fireEvent.click(within(rowFor('DOC-003')).getByRole('checkbox', { name: 'Skip DOC-003' }))

    await vi.waitFor(() => expect((within(rowFor('DOC-003')).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true))
    expect(run).toHaveBeenLastCalledWith('/p', { skip: ['DOC-003'] })
  })

  it('shows an already skipped document as checked and disabled with a note', async () => {
    await catalogued(catalogue({ documents: [doc(1, { skipped: true }), doc(2)] }))
    const box = within(rowFor('DOC-001')).getByRole('checkbox', { name: 'Skip DOC-001' }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
    expect(rowFor('DOC-001').textContent).toContain('Skipped (cannot be undone here)')
    expect((within(rowFor('DOC-002')).getByRole('checkbox') as HTMLInputElement).disabled).toBe(false)
  })
})

describe('IntakePanel: priority', () => {
  it('sends the whole new order, in the order shown', async () => {
    const run = await catalogued(catalogue())
    run.mockResolvedValueOnce(catalogue({ priorityOrder: ['DOC-002', 'DOC-001', 'DOC-003'] }))

    fireEvent.click(within(rowFor('DOC-001')).getByRole('button', { name: 'Move DOC-001 down' }))

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(run).toHaveBeenLastCalledWith('/p', { priority: ['DOC-002', 'DOC-001', 'DOC-003'] })
  })

  it('starts from the saved order, and draws the rows in it', async () => {
    const run = await catalogued(catalogue({
      documents: [doc(1, { priority: 2 }), doc(2, { priority: 1 }), doc(3)], priorityOrder: ['DOC-002', 'DOC-001'],
    }))
    expect(rows().map((r) => r.getAttribute('data-doc-id'))).toEqual(['DOC-002', 'DOC-001', 'DOC-003'])
    run.mockResolvedValueOnce(catalogue())

    fireEvent.click(within(rowFor('DOC-003')).getByRole('button', { name: 'Move DOC-003 up' }))

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(run).toHaveBeenLastCalledWith('/p', { priority: ['DOC-002', 'DOC-003', 'DOC-001'] })
  })

  it('cannot move the first row up or the last row down', async () => {
    await catalogued(catalogue())
    expect((within(rowFor('DOC-001')).getByRole('button', { name: 'Move DOC-001 up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(rowFor('DOC-003')).getByRole('button', { name: 'Move DOC-003 down' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('IntakePanel: lock', () => {
  it('asks first, says the ids become permanent, and only then sends lock', async () => {
    const run = await catalogued(catalogue())
    run.mockResolvedValueOnce(catalogue({ locked: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Lock these ids' }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('intake-lock-confirm').textContent).toContain('permanent')

    fireEvent.click(screen.getByRole('button', { name: 'Yes, lock them' }))

    await screen.findByText('These ids are frozen.')
    expect(run).toHaveBeenLastCalledWith('/p', { lock: true })
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const run = await catalogued(catalogue())
    fireEvent.click(screen.getByRole('button', { name: 'Lock these ids' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('intake-lock-confirm')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lock these ids' })).toBeTruthy()
  })

  it('removes the skip, priority and lock controls once the catalogue is locked', async () => {
    await catalogued(catalogue({
      locked: true, documents: [doc(1, { skipped: true, priority: 1 }), doc(2)], priorityOrder: ['DOC-001'],
    }))
    expect(screen.getByText('These ids are frozen.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock these ids' })).toBeNull()
    expect(rowFor('DOC-001').textContent).toContain('Skipped')
    expect(rowFor('DOC-001').textContent).toContain('Priority 1')
  })
})

describe('IntakePanel: failures show exactly one error line, no table and no count', () => {
  const shapes: Array<[string, () => Promise<IntakeCatalogue>]> = [
    ['the call rejects', () => Promise.reject(new Error('The intake script is missing.'))],
    ['ok is false with a reason', () => Promise.resolve({ ...catalogue(), ok: false, error: 'The script exited with code one.' })],
    ['ok is false with no reason', () => Promise.resolve({ ...catalogue(), ok: false })],
  ]
  it.each(shapes)('when %s', async (_name, call) => {
    install(vi.fn(call))
    render(<IntakePanel projectPath="/p" />)
    fireEvent.click(catalogueButton())

    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByRole('table')).toBeNull()
    expect(rows()).toHaveLength(0)
    expect(panelText()).not.toMatch(/\d/)
  })

  it('drops the table when an action fails, rather than showing a catalogue that may be out of date', async () => {
    const run = await catalogued(catalogue())
    run.mockResolvedValueOnce({ ...catalogue(), ok: false, error: 'That catalogue is locked.' })

    fireEvent.click(within(rowFor('DOC-002')).getByRole('checkbox', { name: 'Skip DOC-002' }))

    expect((await screen.findByRole('alert')).textContent).toBe('That catalogue is locked.')
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('IntakePanel: stale responses', () => {
  it('does not show a catalogue for a project the person already left', async () => {
    let resolve!: (c: IntakeCatalogue) => void
    install(vi.fn().mockReturnValue(new Promise<IntakeCatalogue>((r) => { resolve = r })))
    const { rerender } = render(<IntakePanel projectPath="/a" />)
    fireEvent.click(catalogueButton())

    rerender(<IntakePanel projectPath="/b" />)
    resolve(catalogue())
    await Promise.resolve()
    await Promise.resolve()

    expect(rows()).toHaveLength(0)
  })
})
