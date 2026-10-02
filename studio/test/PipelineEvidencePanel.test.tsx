// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PipelineEvidencePanel } from '../src/components/PipelineEvidencePanel'
import type { PipelineEvidenceResult } from '../shared/types'

function result(over: Partial<PipelineEvidenceResult> = {}): PipelineEvidenceResult {
  return {
    ok: true, repo: 'acme/app', gatheredAt: '2026-10-02 18:41 UTC',
    rails: [
      { rail: 'ci', status: 'PROVEN', reason: 'Went red on 12 pull request run(s).', runs: 100, red: 44, evidence: [{ label: 'PR #54', url: 'https://x/54' }] },
      { rail: 'grader', status: 'BROKEN', reason: 'Errored on 7 of 100 run(s).', runs: 100, red: 7, evidence: [] },
      { rail: 'deploy-promote', status: 'NEVER_FIRED', reason: 'No run of this workflow exists.', runs: 0, red: 0, evidence: [] },
      { rail: 'eval-suite', status: 'RAN_UNPROVEN', reason: 'Every run was green.', runs: 15, red: 0, evidence: [] },
      { rail: 'Stop gate', status: 'NO_DATA', reason: 'A local hook.', runs: null, red: null, evidence: [] },
    ],
    proofsNeeded: [{ rail: 'grader', proof: 'A planted mismatch.', touches: 'a spec' }],
    protection: { state: 'enforcing', detail: 'Enforcing 11 required checks.' },
    unapprovedMerges: 19,
    wrote: '.sdlc/artifacts/03-foundation/pipeline-proof.md',
    ...over,
  }
}

function install(gather: () => Promise<PipelineEvidenceResult>) {
  const studio = { gatherPipelineEvidence: vi.fn(gather) }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  vi.useRealTimers()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('PipelineEvidencePanel', () => {
  it('starts idle: says what it does, that it only reads, and does nothing until asked', () => {
    const studio = install(async () => result())
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Gather pipeline evidence' })).toBeTruthy()
    expect(screen.getByText(/nothing is opened, merged or changed/i)).toBeTruthy()
    expect(studio.gatherPipelineEvidence).not.toHaveBeenCalled()
  })

  it('while it works: the button is disabled and a running clock shows it has not hung', async () => {
    let finish: (r: PipelineEvidenceResult) => void = () => {}
    install(() => new Promise((resolve) => { finish = resolve }))
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    expect(screen.getByRole('button', { name: /gathering/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('pipeline-evidence-running').textContent).toMatch(/Reading GitHub… 0s/)
    act(() => { vi.advanceTimersByTime(7000) })
    expect(screen.getByTestId('pipeline-evidence-running').textContent).toMatch(/Reading GitHub… 7s/)
    await act(async () => { finish(result()) })
    expect(screen.queryByTestId('pipeline-evidence-running')).toBeNull()
  })

  it('shows every rail with its status in plain words — not a verdict for a rail with no data', async () => {
    install(async () => result())
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByText('ci')).toBeTruthy())
    const rails = () => within(screen.getByTestId('pipeline-rails'))
    const row = (name: string) => rails().getByText(name).closest('li')!
    expect(row('ci').textContent).toMatch(/Proven/)
    expect(row('grader').textContent).toMatch(/Broken/)
    expect(row('deploy-promote').textContent).toMatch(/Never fired/)
    expect(row('eval-suite').textContent).toMatch(/Ran, never caught anything/)
    expect(row('Stop gate').textContent).toMatch(/No data/)
    expect(row('Stop gate').textContent).not.toMatch(/0 run/) // no data is not a zero
  })

  it('tells the reader whether GitHub is actually enforcing, and flags unapproved merges', async () => {
    install(async () => result())
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByText(/Enforcing 11 required checks/)).toBeTruthy())
    expect(screen.getByText(/19 merges since enforcement had no approval/)).toBeTruthy()
  })

  it('does not mention unapproved merges when there are none', async () => {
    install(async () => result({ unapprovedMerges: 0 }))
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByText('ci')).toBeTruthy())
    expect(screen.queryByText(/had no approval/)).toBeNull()
  })

  it('lists the forced failures still needed, and says it does not run them', async () => {
    install(async () => result())
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByText(/Not yet proven/)).toBeTruthy())
    expect(screen.getByText(/A planted mismatch\./)).toBeTruthy()
    expect(screen.getByText(/each opens a real pull request/i)).toBeTruthy()
  })

  it('opens the written document from the result', async () => {
    const onOpen = vi.fn()
    install(async () => result())
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open pipeline-proof.md' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Open pipeline-proof.md' }))
    expect(onOpen).toHaveBeenCalledWith('.sdlc/artifacts/03-foundation/pipeline-proof.md')
  })

  it('on failure, says why in the script\'s own words and what is needed, and offers another try', async () => {
    install(async () => ({ ok: false, error: 'The `gh` CLI is not installed or not on PATH.', rails: [], proofsNeeded: [] }))
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not installed or not on PATH/))
    expect(screen.getByRole('alert').textContent).toMatch(/GitHub CLI/)
    expect(screen.getByRole('button', { name: 'Gather pipeline evidence' })).toBeTruthy()
  })

  it('a rejected call is an error shown, not a stuck spinner', async () => {
    install(() => Promise.reject(new Error('IPC went away')))
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/IPC went away/))
    expect(screen.queryByTestId('pipeline-evidence-running')).toBeNull()
  })

  it('gathering again replaces the previous result', async () => {
    const studio = install(async () => result())
    render(<PipelineEvidencePanel projectPath="/p" onOpenDocument={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gather pipeline evidence' }))
    await waitFor(() => expect(screen.getByText('ci')).toBeTruthy())
    studio.gatherPipelineEvidence.mockResolvedValueOnce(result({ rails: [{ rail: 'only-one', status: 'PROVEN', reason: 'r', runs: 1, red: 1, evidence: [] }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Gather again' }))
    await waitFor(() => expect(screen.getByText('only-one')).toBeTruthy())
    expect(within(screen.getByTestId('pipeline-rails')).queryByText('grader')).toBeNull()
  })
})
