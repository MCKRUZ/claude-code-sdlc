// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateView } from '../src/components/CandidateView'
import type { DraftScope, DraftUiState } from '../src/components/useDraftJob'
import { draftCandidate } from './draftFixtures'

afterEach(cleanup)

const scope: DraftScope = { kind: 'enhance', stageId: '1' }
const reviewScope: DraftScope = { kind: 'review', stageId: '2' }

const running = (over: Partial<Extract<DraftUiState, { phase: 'running' }>> = {}): DraftUiState => ({
  phase: 'running', scope, label: 'requirements.narrative.md', jobId: 'job-1', activity: null, startedAt: 0, elapsedMs: 0, ...over,
})
const candidateState = (
  over: Partial<Extract<DraftUiState, { phase: 'candidate' }>> = {}, candidate = draftCandidate(),
): DraftUiState => ({
  phase: 'candidate', scope, label: 'requirements.narrative.md', candidate, acting: false, actionError: null, ...over,
})

function draw(state: DraftUiState, over: { signedIn?: boolean } = {}) {
  const handlers = { onCancel: vi.fn(), onKeep: vi.fn(), onDiscard: vi.fn(), onRetry: vi.fn() }
  render(<CandidateView state={state} signedIn={over.signedIn ?? true} {...handlers} />)
  return handlers
}

const text = () => screen.getByTestId('candidate-view').textContent ?? ''

describe('CandidateView: while it works', () => {
  it('shows what Claude is doing, the elapsed seconds, and a Cancel that cancels', () => {
    const { onCancel } = draw(running({ activity: 'Reading requirements.md', elapsedMs: 4200 }))
    const box = screen.getByTestId('draft-running')
    expect(within(box).getByText('Reading requirements.md')).toBeTruthy()
    expect(within(box).getByText('Working for 4 s')).toBeTruthy()
    fireEvent.click(screen.getByTestId('draft-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('says Starting while Claude has not reported anything yet', () => {
    draw(running())
    expect(within(screen.getByTestId('draft-running')).getByText('Starting…')).toBeTruthy()
  })

  it('shows no candidate and no Keep while it is running', () => {
    draw(running())
    expect(screen.queryByTestId('draft-keep')).toBeNull()
    expect(screen.queryByTestId('candidate-text')).toBeNull()
  })
})

describe('CandidateView: the candidate', () => {
  it('draws the text as formatted text, labelled as drafted by Claude', () => {
    draw(candidateState())
    expect(screen.getByText('Drafted by Claude')).toBeTruthy()
    const body = screen.getByTestId('candidate-text')
    expect(within(body).getByRole('heading', { name: 'What this covers' })).toBeTruthy()
    expect(body.textContent).not.toContain('##')
  })

  it.each([
    [0.12, 'Cost: $0.12'],
    [1.5, 'Cost: $1.50'],
    [0.01, 'Cost: $0.01'],
    [0.004, 'Cost: less than $0.01'],
  ])('shows a cost of %s as "%s"', (costUsd, line) => {
    draw(candidateState({}, draftCandidate({ costUsd })))
    expect(screen.getByTestId('candidate-cost').textContent).toBe(line)
  })

  it.each([[null], [0]])('leaves the cost line out entirely for %s, never $0.00', (costUsd) => {
    draw(candidateState({}, draftCandidate({ costUsd })))
    expect(screen.queryByTestId('candidate-cost')).toBeNull()
    expect(text()).not.toContain('$0.00')
    expect(text()).not.toContain('Cost')
  })

  it('warns that Keep will replace the existing file, naming a summary or a report', () => {
    draw(candidateState({}, draftCandidate({ replacesExisting: true })))
    expect(screen.getByText('This will replace the existing summary.')).toBeTruthy()
  })

  it('names a report when the candidate is a review', () => {
    draw(candidateState({ scope: reviewScope }, draftCandidate({ kind: 'review', stageId: '2', replacesExisting: true })))
    expect(screen.getByText('This will replace the existing report.')).toBeTruthy()
  })

  it('says nothing about replacing when nothing is replaced', () => {
    draw(candidateState())
    expect(text()).not.toContain('replace')
  })

  it('Keep and Discard call their handlers', () => {
    const { onKeep, onDiscard } = draw(candidateState())
    fireEvent.click(screen.getByTestId('draft-keep'))
    fireEvent.click(screen.getByTestId('draft-discard'))
    expect(onKeep).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('disables both with the reason when nobody is signed in', () => {
    const { onKeep } = draw(candidateState(), { signedIn: false })
    expect((screen.getByTestId('draft-keep') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('draft-discard') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Sign in to keep or discard.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('draft-keep'))
    expect(onKeep).not.toHaveBeenCalled()
  })

  it('disables both while a Keep or Discard is in flight', () => {
    draw(candidateState({ acting: true }))
    expect((screen.getByTestId('draft-keep') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('draft-discard') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a failed Keep as one alert and leaves the candidate and both buttons', () => {
    draw(candidateState({ actionError: 'That file is not on the allowlist.' }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('That file is not on the allowlist.')
    expect(screen.getByTestId('candidate-text')).toBeTruthy()
    expect((screen.getByTestId('draft-keep') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('CandidateView: after Keep', () => {
  const saved = (over: Partial<Extract<DraftUiState, { phase: 'saved' }>> = {}): DraftUiState => ({
    phase: 'saved', scope, written: '.sdlc/artifacts/01-requirements/requirements.narrative.md', ...over,
  })

  it('says what was saved by file name and offers nothing more to do', () => {
    draw(saved())
    expect(screen.getByTestId('draft-saved').textContent).toBe('Saved requirements.narrative.md.')
    expect(screen.queryByTestId('draft-keep')).toBeNull()
  })

  it('a review says its findings were recorded', () => {
    draw(saved({ scope: reviewScope, written: '.sdlc/artifacts/02-design/review-report.md', findingsRecorded: true }))
    expect(screen.getByTestId('draft-saved').textContent).toBe('Saved review-report.md. Findings recorded.')
  })

  it('a review with no findings table says so rather than staying quiet', () => {
    draw(saved({ scope: reviewScope, written: 'review-report.md', findingsRecorded: false }))
    expect(screen.getByTestId('draft-saved').textContent)
      .toBe('Saved review-report.md. No findings table was found, so no findings were recorded.')
  })

  it('a summary mentions no findings at all', () => {
    draw(saved())
    expect(screen.getByTestId('draft-saved').textContent).not.toContain('indings')
  })

  it('shows a warning as a muted extra line, not an alert', () => {
    draw(saved({ warning: 'The draft ledger line could not be written.' }))
    expect(screen.getByTestId('draft-warning').textContent).toBe('The draft ledger line could not be written.')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('CandidateView: when it did not work', () => {
  it('shows exactly one alert and Try again, with no candidate and no digit', () => {
    const { onRetry } = draw({ phase: 'error', scope, message: 'Claude stopped before it finished.' })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByTestId('draft-error').textContent).toBe('Claude stopped before it finished.')
    expect(screen.queryByTestId('candidate-text')).toBeNull()
    expect(screen.queryByTestId('draft-keep')).toBeNull()
    expect(screen.getByTestId('candidate-view').textContent).not.toMatch(/\d/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows a brief notice after a cancel and nothing else', () => {
    draw({ phase: 'idle', scope, notice: 'Cancelled' })
    expect(screen.getByTestId('candidate-view').textContent).toBe('Cancelled')
  })

  it('draws nothing at all when idle with no notice', () => {
    const { container } = render(
      <CandidateView state={{ phase: 'idle', scope: null, notice: null }} signedIn onCancel={vi.fn()} onKeep={vi.fn()} onDiscard={vi.fn()} onRetry={vi.fn()} />,
    )
    expect(container.textContent).toBe('')
  })
})
