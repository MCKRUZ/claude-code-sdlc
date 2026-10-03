// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActivitiesPanel } from '../src/components/ActivitiesPanel'
import { ReviewStandingPanel } from '../src/components/ReviewStandingPanel'
import { useDraftJob } from '../src/components/useDraftJob'
import type { StartDraftResult } from '../shared/types'
import { activity, readinessWith } from './activityFixtures'
import { deferred, draftCandidate, draftJob, installDraftApi, removeDraftApi } from './draftFixtures'

afterEach(() => {
  cleanup()
  removeDraftApi()
})

const REVIEW_TARGET = '.sdlc/artifacts/02-design/review-report.md'
const reviewCandidate = (over = {}) => draftCandidate({
  jobId: 'job-r', kind: 'review', stageId: '2', target: REVIEW_TARGET, text: '## Gate Results\n\nSome findings.', ...over,
})

function Harness({ actor = 'Matt K' }: { actor?: string }) {
  const draft = useDraftJob('/p')
  return <ReviewStandingPanel projectPath="/p" stageId="2" draft={draft} actor={actor} />
}

async function drawn(actor?: string) {
  render(<Harness actor={actor} />)
  await screen.findByText('No review findings recorded yet')
}

const run = () => screen.getByRole('button', { name: 'Run the review' }) as HTMLButtonElement

describe('ReviewStandingPanel: choosing how to review', () => {
  it('offers the four modes with the command\'s own when-to-use, Council first and chosen', async () => {
    installDraftApi()
    await drawn()
    const group = screen.getByRole('radiogroup', { name: 'Review mode' })
    const labels = within(group).getAllByRole('radio').map((r) => r.closest('label')?.textContent ?? '')
    expect(labels).toHaveLength(4)
    expect(labels[0]).toContain('Council')
    expect(labels[0]).toContain('Seven viewpoints')
    expect(labels[1]).toContain('Adversarial')
    expect(labels[1]).toContain('challenges every assumption')
    expect(labels[2]).toContain('Edge cases')
    expect(labels[2]).toContain('unhandled conditions')
    expect(labels[3]).toContain('All')
    expect((within(group).getByRole('radio', { name: /Council/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('sends the default mode and nothing but the kind, the stage and the mode', async () => {
    const studio = installDraftApi()
    await drawn()
    fireEvent.click(run())
    await screen.findByTestId('candidate-view')
    expect(studio.startDraft).toHaveBeenCalledWith('/p', { kind: 'review', stageId: '2', mode: 'council' })
  })

  it.each([
    ['Adversarial', 'adversarial'],
    ['Edge cases', 'edge-cases'],
    ['All', 'all'],
  ])('sends %s as the mode', async (name, mode) => {
    const studio = installDraftApi()
    await drawn()
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${name}`) }))
    fireEvent.click(run())
    await screen.findByTestId('candidate-view')
    expect(studio.startDraft).toHaveBeenCalledWith('/p', { kind: 'review', stageId: '2', mode })
  })

  it('says it uses Claude, and keeps the strict check alongside', async () => {
    installDraftApi()
    await drawn()
    expect(screen.getByText('Uses Claude.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Strict check' })).toBeTruthy()
  })

  it('shows no review controls when it was not given the job', async () => {
    installDraftApi()
    render(<ReviewStandingPanel projectPath="/p" />)
    await screen.findByText('No review findings recorded yet')
    expect(screen.queryByRole('button', { name: 'Run the review' })).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })
})

describe('ReviewStandingPanel: the run', () => {
  it('shows progress with Cancel, and a cancelled run keeps nothing', async () => {
    const pending = deferred<StartDraftResult>()
    const studio = installDraftApi({ startDraft: vi.fn().mockReturnValue(pending.promise) })
    await drawn()
    fireEvent.click(run())
    expect(await screen.findByTestId('draft-running')).toBeTruthy()
    expect(run().disabled).toBe(true)
    fireEvent.click(screen.getByTestId('draft-cancel'))
    await screen.findByText('Cancelled')
    expect(studio.keepDraft).not.toHaveBeenCalled()
    expect(run().disabled).toBe(false)
  })

  it('Keep says the report was saved and its findings recorded, then reads the standing again', async () => {
    const studio = installDraftApi({
      startDraft: vi.fn().mockResolvedValue({ ok: true, candidate: reviewCandidate({ replacesExisting: true }) }),
      keepDraft: vi.fn().mockResolvedValue({ ok: true, written: REVIEW_TARGET, findingsRecorded: true }),
    })
    await drawn()
    fireEvent.click(run())
    await screen.findByTestId('candidate-text')
    expect(screen.getByText('This will replace the existing report.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('draft-keep'))
    expect((await screen.findByTestId('draft-saved')).textContent).toBe('Saved review-report.md. Findings recorded.')
    expect(studio.keepDraft).toHaveBeenCalledWith('/p', 'job-r', 'Matt K')
    await waitFor(() => expect(studio.getReviewStanding).toHaveBeenCalledTimes(2))
  })

  it('says no findings were recorded when the report had no findings table', async () => {
    installDraftApi({
      startDraft: vi.fn().mockResolvedValue({ ok: true, candidate: reviewCandidate() }),
      keepDraft: vi.fn().mockResolvedValue({ ok: true, written: REVIEW_TARGET, findingsRecorded: false }),
    })
    await drawn()
    fireEvent.click(run())
    await screen.findByTestId('candidate-text')
    fireEvent.click(screen.getByTestId('draft-keep'))
    expect((await screen.findByTestId('draft-saved')).textContent)
      .toBe('Saved review-report.md. No findings table was found, so no findings were recorded.')
  })

  it('Discard writes nothing', async () => {
    const studio = installDraftApi({ startDraft: vi.fn().mockResolvedValue({ ok: true, candidate: reviewCandidate() }) })
    await drawn()
    fireEvent.click(run())
    await screen.findByTestId('candidate-text')
    fireEvent.click(screen.getByTestId('draft-discard'))
    await screen.findByText('Discarded.')
    expect(studio.discardDraft).toHaveBeenCalledWith('/p', 'job-r', 'Matt K')
    expect(studio.keepDraft).not.toHaveBeenCalled()
  })

  it('with nobody signed in, Keep and Discard are off and say why', async () => {
    installDraftApi({ startDraft: vi.fn().mockResolvedValue({ ok: true, candidate: reviewCandidate() }) })
    await drawn('')
    fireEvent.click(run())
    await screen.findByTestId('candidate-text')
    expect((screen.getByTestId('draft-keep') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Sign in to keep or discard.')).toBeTruthy()
  })

  it('a failed run is one alert with Try again, no candidate and no count', async () => {
    installDraftApi({ startDraft: vi.fn().mockResolvedValue({ ok: false, error: 'Claude printed no result.' }) })
    await drawn()
    fireEvent.click(run())
    await screen.findByTestId('draft-error')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByTestId('candidate-text')).toBeNull()
    expect(screen.getByTestId('candidate-view').textContent).not.toMatch(/\d/)
  })

  it('recovers a review that was running before the screen was reopened', async () => {
    installDraftApi({
      getDraftState: vi.fn().mockResolvedValue({
        running: draftJob({ id: 'job-r', kind: 'review', stageId: '2', label: 'review-report.md' }), candidate: null,
      }),
    })
    await drawn()
    expect(await screen.findByTestId('draft-running')).toBeTruthy()
    expect(run().disabled).toBe(true)
  })
})

describe('Enhance and review share the one job', () => {
  const ACTIVITIES = [activity({ id: 'enhance', kind: 'draft' }), activity({ id: 'review', kind: 'draft' })]
  const DOCUMENT = {
    name: 'a.md', path: '.sdlc/artifacts/02-design/a.md', exists: true, folder: false, shaped: true, findingCount: 0, ready: true,
  }

  function drawBoth() {
    const studio = installDraftApi({
      getNarrativeCoverage: vi.fn().mockResolvedValue({
        ok: true, hasData: true, notes: [], withNarrative: 0, total: 1, artifacts: [{ name: 'a.md', status: 'none', stale: null }],
      }),
    })
    const readiness = readinessWith({
      stageId: '2', capabilities: ['activities', 'narrative-status'], activities: ACTIVITIES, documents: [DOCUMENT],
    })
    render(<ActivitiesPanel projectPath="/p" readiness={readiness} onOpenDocument={vi.fn()} actor="Matt K" />)
    return studio
  }

  it('a running summary turns the review button off with the same reason', async () => {
    const pending = deferred<StartDraftResult>()
    const studio = drawBoth()
    studio.startDraft.mockReturnValue(pending.promise)
    fireEvent.click(await screen.findByRole('button', { name: 'Draft with Claude' }))
    await screen.findByTestId('draft-running')
    expect((screen.getByRole('button', { name: 'Run the review' }) as HTMLButtonElement).disabled).toBe(true)
    const reasons = screen.getAllByTestId('draft-busy-reason').map((r) => r.textContent)
    expect(reasons).toContain('Already drafting a.narrative.md')
    // Only the panel that owns the job draws its progress.
    expect(screen.getAllByTestId('draft-running')).toHaveLength(1)
  })

  it('threads the signed-in name through to Keep', async () => {
    const studio = drawBoth()
    studio.startDraft.mockResolvedValue({ ok: true, candidate: draftCandidate({ stageId: '2', target: '.sdlc/artifacts/02-design/a.narrative.md' }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Draft with Claude' }))
    fireEvent.click(await screen.findByTestId('draft-keep'))
    await screen.findByTestId('draft-saved')
    expect(studio.keepDraft).toHaveBeenCalledWith('/p', 'job-1', 'Matt K')
  })

  it('a review candidate is drawn once, under the review panel only', async () => {
    const studio = drawBoth()
    studio.startDraft.mockResolvedValue({ ok: true, candidate: reviewCandidate() })
    fireEvent.click(await screen.findByRole('button', { name: 'Run the review' }))
    await screen.findByTestId('candidate-text')
    expect(screen.getAllByTestId('candidate-view')).toHaveLength(1)
    const reviewRow = document.querySelector('[data-activity-id="review"]') as HTMLElement
    expect(within(reviewRow).getByTestId('candidate-view')).toBeTruthy()
  })
})
