// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhaseReportPanel } from '../src/components/PhaseReportPanel'
import type { PhaseReportEntry, PhaseReportResult } from '../shared/types'

const entry = (over: Partial<PhaseReportEntry> = {}): PhaseReportEntry => ({
  phase: '1', phaseName: 'requirements', output: '/p/.sdlc/reports/phase-1.html',
  found: 3, missing: 2, total: 5, missingNames: ['constitution.md', 'problem-statement.md'], ...over,
})

const REFUSAL = "That file is not inside this project's reports folder."

function install(overrides: Record<string, unknown> = {}) {
  const studio = { exportPhaseReport: vi.fn(), openReport: vi.fn().mockResolvedValue({ ok: true }), ...overrides }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

const panelText = () => screen.getByTestId('phase-report-panel').textContent ?? ''
const exportOne = () => screen.getByRole('button', { name: "Export this stage's report" })

describe('PhaseReportPanel', () => {
  it('writes nothing on mount and says reports stay on this computer', () => {
    const studio = install()
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)
    expect(studio.exportPhaseReport).not.toHaveBeenCalled()
    expect(panelText()).toContain('Reports stay on this computer; they are not shared with the team.')
  })

  it("exports this stage's report and reads the plugin's numbers, listing each missing document", async () => {
    const result: PhaseReportResult = { ok: true, reports: [entry()] }
    const studio = install({ exportPhaseReport: vi.fn().mockResolvedValue(result) })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)

    fireEvent.click(exportOne())

    expect(await screen.findByText('Report written: 3 of 5 documents present')).toBeTruthy()
    expect(studio.exportPhaseReport).toHaveBeenCalledWith('/p', '1', false)
    expect(screen.getByText('Missing: constitution.md, problem-statement.md')).toBeTruthy()
    expect(panelText()).not.toMatch(/complete|all present/i)
  })

  it('shows no Missing line when nothing is missing', async () => {
    const result: PhaseReportResult = { ok: true, reports: [entry({ found: 5, missing: 0, missingNames: [] })] }
    install({ exportPhaseReport: vi.fn().mockResolvedValue(result) })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)

    fireEvent.click(exportOne())

    expect(await screen.findByText('Report written: 5 of 5 documents present')).toBeTruthy()
    expect(screen.queryByText(/^Missing:/)).toBeNull()
  })

  it('exports every stage and counts the reports the plugin wrote', async () => {
    const reports = Array.from({ length: 9 }, (_, i) => entry({ phase: String(i), output: `/p/.sdlc/reports/phase-${i}.html` }))
    const studio = install({ exportPhaseReport: vi.fn().mockResolvedValue({ ok: true, reports, index: '/p/.sdlc/reports/index.html' }) })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Export all stages' }))

    expect(await screen.findByText('9 reports written')).toBeTruthy()
    expect(studio.exportPhaseReport).toHaveBeenCalledWith('/p', '1', true)
  })

  it('opens the entry output for one stage, and the index for all stages', async () => {
    const studio = install({
      exportPhaseReport: vi.fn()
        .mockResolvedValueOnce({ ok: true, reports: [entry()] })
        .mockResolvedValueOnce({ ok: true, reports: [entry(), entry({ phase: '2' })], index: '/p/.sdlc/reports/index.html' }),
    })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)

    fireEvent.click(exportOne())
    fireEvent.click(await screen.findByRole('button', { name: 'Open report' }))
    expect(studio.openReport).toHaveBeenLastCalledWith('/p', '/p/.sdlc/reports/phase-1.html')

    fireEvent.click(screen.getByRole('button', { name: 'Export all stages' }))
    await screen.findByText('2 reports written')
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(studio.openReport).toHaveBeenLastCalledWith('/p', '/p/.sdlc/reports/index.html')
  })

  it('offers no Open report for all stages when the plugin wrote no index', async () => {
    install({ exportPhaseReport: vi.fn().mockResolvedValue({ ok: true, reports: [entry(), entry({ phase: '2' })] }) })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Export all stages' }))
    await screen.findByText('2 reports written')
    expect(screen.queryByRole('button', { name: 'Open report' })).toBeNull()
  })

  it('shows a refused open as exactly one error line and keeps the result', async () => {
    install({
      exportPhaseReport: vi.fn().mockResolvedValue({ ok: true, reports: [entry()] }),
      openReport: vi.fn().mockResolvedValue({ ok: false, error: REFUSAL }),
    })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)
    fireEvent.click(exportOne())
    fireEvent.click(await screen.findByRole('button', { name: 'Open report' }))

    expect((await screen.findByRole('alert')).textContent).toBe(REFUSAL)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Report written: 3 of 5 documents present')).toBeTruthy()
  })

  it("does not show the previous stage's result after the stage changes mid-call", async () => {
    let resolve!: (r: PhaseReportResult) => void
    install({ exportPhaseReport: vi.fn().mockReturnValue(new Promise<PhaseReportResult>((r) => { resolve = r })) })
    const { rerender } = render(<PhaseReportPanel projectPath="/p" stageId="1" />)
    fireEvent.click(exportOne())

    rerender(<PhaseReportPanel projectPath="/p" stageId="2" />)
    resolve({ ok: true, reports: [entry()] })

    await waitFor(() => expect(exportOne().hasAttribute('disabled')).toBe(false))
    expect(screen.queryByText(/Report written/)).toBeNull()
  })
})

describe('PhaseReportPanel: failures show exactly one error line and no count', () => {
  const shapes: Array<[string, () => Promise<PhaseReportResult>]> = [
    ['the call rejects', () => Promise.reject(new Error('The report script is missing.'))],
    ['ok is false with a reason', () => Promise.resolve({ ok: false, error: 'The report script exited with code one.', reports: [] })],
    ['ok is false with no reason', () => Promise.resolve({ ok: false, reports: [] })],
    ['ok is true but nothing was written', () => Promise.resolve({ ok: true, reports: [] })],
  ]
  it.each(shapes)('when %s', async (_name, call) => {
    install({ exportPhaseReport: vi.fn(call) })
    render(<PhaseReportPanel projectPath="/p" stageId="1" />)
    fireEvent.click(exportOne())

    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(panelText()).not.toMatch(/\d/)
    expect(screen.queryByTestId('phase-report-result')).toBeNull()
  })
})
