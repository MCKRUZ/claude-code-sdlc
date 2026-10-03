// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NarrativeCoveragePanel } from '../src/components/NarrativeCoveragePanel'
import { useDraftJob } from '../src/components/useDraftJob'
import type { NarrativeCoverage, StageDocument, StartDraftResult } from '../shared/types'
import { deferred, draftCandidate, draftJob, installDraftApi, removeDraftApi } from './draftFixtures'

afterEach(() => {
  cleanup()
  removeDraftApi()
})

const doc = (name: string): StageDocument => ({
  name, path: `.sdlc/artifacts/01-requirements/${name}`, exists: true, folder: false, shaped: true, findingCount: 0, ready: true,
})
// d.md has no matching readiness document, and a.md already has a fresh summary.
const DOCS = [doc('a.md'), doc('b.md'), doc('c.md'), doc('e.md')]

const coverage = (): NarrativeCoverage => ({
  ok: true, hasData: true, notes: [], withNarrative: 2, total: 5,
  artifacts: [
    { name: 'a.md', status: 'present', stale: false },
    { name: 'b.md', status: 'present', stale: true },
    { name: 'c.md', status: 'none', stale: null },
    { name: 'd.md', status: 'none', stale: null },
    { name: 'f.md', status: 'present', stale: null },
  ],
})

function Harness({ stageId = '1', actor = 'Matt K', documents = DOCS }: { stageId?: string; actor?: string; documents?: StageDocument[] }) {
  const draft = useDraftJob('/p')
  return <NarrativeCoveragePanel projectPath="/p" stageId={stageId} documents={documents} draft={draft} actor={actor} />
}

function setup(over: Record<string, unknown> = {}) {
  return installDraftApi({ getNarrativeCoverage: vi.fn().mockResolvedValue(coverage()), ...over })
}

const rowFor = (name: string) => screen.getByTestId(`draft-row-${name}`)
const button = (name: string) => within(rowFor(name)).getByRole('button', { name: 'Draft with Claude' }) as HTMLButtonElement

async function drawn(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />)
  await screen.findByText(/plain-language summary/)
}

describe('NarrativeCoveragePanel: which documents get a button', () => {
  it('offers one for a document with no summary and one for an out-of-date summary', async () => {
    setup()
    await drawn()
    expect(button('c.md')).toBeTruthy()
    expect(button('b.md')).toBeTruthy()
  })

  it('offers none for a fresh summary or one that cannot be judged', async () => {
    setup()
    await drawn()
    expect(screen.queryByTestId('draft-row-a.md')).toBeNull()
    expect(screen.queryByTestId('draft-row-f.md')).toBeNull()
  })

  it('hides the button for a document the stage does not list, rather than guessing its path', async () => {
    setup()
    await drawn()
    expect(screen.queryByTestId('draft-row-d.md')).toBeNull()
  })

  it('offers no button for a folder entry that happens to share a name', async () => {
    setup()
    await drawn({ documents: [{ ...doc('c.md'), folder: true }] })
    expect(screen.queryByTestId('draft-row-c.md')).toBeNull()
  })

  it('shows no draft controls at all when it was not given the job', async () => {
    setup()
    render(<NarrativeCoveragePanel projectPath="/p" stageId="1" />)
    await screen.findByText(/plain-language summary/)
    expect(screen.queryByRole('button', { name: 'Draft with Claude' })).toBeNull()
    expect(screen.queryByText('Uses Claude.')).toBeNull()
  })

  it('says it uses Claude, and restates what a summary never mentions', async () => {
    setup()
    await drawn()
    expect(screen.getByText('Uses Claude.')).toBeTruthy()
    expect(screen.getByText('Summaries never mention velocity, story points, pull-request counts, lines of code or hours spent.')).toBeTruthy()
  })
})

describe('NarrativeCoveragePanel: running one', () => {
  it('starts the enhance job for the matching repo-relative path and nothing else', async () => {
    const studio = setup()
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByTestId('candidate-view')
    expect(studio.startDraft).toHaveBeenCalledWith('/p', {
      kind: 'enhance', stageId: '1', document: '.sdlc/artifacts/01-requirements/c.md',
    })
  })

  it('shows progress with Cancel, and Cancel stops it and leaves nothing kept', async () => {
    const run = deferred<StartDraftResult>()
    const studio = setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    await drawn()
    fireEvent.click(button('c.md'))
    expect(await screen.findByTestId('draft-running')).toBeTruthy()
    fireEvent.click(screen.getByTestId('draft-cancel'))
    await screen.findByText('Cancelled')
    expect(studio.cancelDraft).toHaveBeenCalledTimes(1)
    expect(studio.keepDraft).not.toHaveBeenCalled()
    expect(button('c.md').disabled).toBe(false)
  })

  it('disables every other button with the visible reason while one job runs', async () => {
    const run = deferred<StartDraftResult>()
    setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByTestId('draft-running')
    expect(button('b.md').disabled).toBe(true)
    expect(button('c.md').disabled).toBe(true)
    expect(screen.getByTestId('draft-busy-reason').textContent).toBe('Already drafting c.narrative.md')
  })

  it('keeps the other buttons off while a candidate waits for Keep or Discard', async () => {
    setup()
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByTestId('candidate-text')
    expect(button('b.md').disabled).toBe(true)
    expect(screen.getByTestId('draft-busy-reason').textContent).toBe('Already drafting requirements.narrative.md')
  })

  it('names the running job in one error line when main refuses a second start', async () => {
    setup({
      startDraft: vi.fn().mockResolvedValue({
        ok: false, error: 'Already drafting design.narrative.md', running: draftJob({ label: 'design.narrative.md' }),
      }),
    })
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Already drafting design.narrative.md')
  })

  it('shows one error line and Try again, and no candidate, when the run fails', async () => {
    setup({ startDraft: vi.fn().mockResolvedValue({ ok: false, error: 'Claude stopped before it finished.' }) })
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByTestId('candidate-text')).toBeNull()
    expect(screen.getByTestId('candidate-view').textContent).not.toMatch(/\d/)
  })

  it('recovers a job that was running before the screen was reopened', async () => {
    setup({ getDraftState: vi.fn().mockResolvedValue({ running: draftJob(), candidate: null }) })
    await drawn()
    expect(await screen.findByTestId('draft-running')).toBeTruthy()
    expect(button('c.md').disabled).toBe(true)
  })

  it('recovers a waiting candidate and lets the person keep it', async () => {
    const studio = setup({ getDraftState: vi.fn().mockResolvedValue({ running: null, candidate: draftCandidate() }) })
    await drawn()
    await screen.findByTestId('candidate-text')
    fireEvent.click(screen.getByTestId('draft-keep'))
    await screen.findByTestId('draft-saved')
    expect(studio.keepDraft).toHaveBeenCalledWith('/p', 'job-1', 'Matt K')
  })

  it('does not show a job from another stage under this one', async () => {
    const run = deferred<StartDraftResult>()
    setup({ startDraft: vi.fn().mockReturnValue(run.promise) })
    const { rerender } = render(<Harness stageId="1" />)
    await screen.findByText(/plain-language summary/)
    fireEvent.click(button('c.md'))
    await screen.findByTestId('draft-running')
    rerender(<Harness stageId="2" />)
    expect(screen.queryByTestId('candidate-view')).toBeNull()
    run.resolve({ ok: true, candidate: draftCandidate({ stageId: '1' }) })
    await waitFor(() => expect(screen.getByTestId('draft-busy-reason')).toBeTruthy())
    expect(screen.queryByTestId('candidate-text')).toBeNull()
  })
})

describe('NarrativeCoveragePanel: keeping and discarding', () => {
  it('Keep saves under the signed-in name, says what was saved, and reads the coverage again', async () => {
    const studio = setup({
      keepDraft: vi.fn().mockResolvedValue({ ok: true, written: '.sdlc/artifacts/01-requirements/c.narrative.md' }),
    })
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByTestId('candidate-text')
    fireEvent.click(screen.getByTestId('draft-keep'))
    expect((await screen.findByTestId('draft-saved')).textContent).toBe('Saved c.narrative.md.')
    expect(studio.keepDraft).toHaveBeenCalledWith('/p', 'job-1', 'Matt K')
    await waitFor(() => expect(studio.getNarrativeCoverage).toHaveBeenCalledTimes(2))
    expect(button('c.md').disabled).toBe(false)
  })

  it('a failed Keep shows one alert and leaves the candidate to try again', async () => {
    setup({ keepDraft: vi.fn().mockResolvedValue({ ok: false, error: 'That path is not allowed.' }) })
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByTestId('candidate-text')
    fireEvent.click(screen.getByTestId('draft-keep'))
    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByTestId('candidate-text')).toBeTruthy()
  })

  it('Discard calls discardDraft, writes nothing, and frees the buttons', async () => {
    const studio = setup()
    await drawn()
    fireEvent.click(button('c.md'))
    await screen.findByTestId('candidate-text')
    fireEvent.click(screen.getByTestId('draft-discard'))
    await screen.findByText('Discarded.')
    expect(studio.discardDraft).toHaveBeenCalledWith('/p', 'job-1', 'Matt K')
    expect(studio.keepDraft).not.toHaveBeenCalled()
    expect(button('b.md').disabled).toBe(false)
  })

  it('with nobody signed in, Keep and Discard are off and say why', async () => {
    const studio = setup()
    await drawn({ actor: '' })
    fireEvent.click(button('c.md'))
    await screen.findByTestId('candidate-text')
    expect((screen.getByTestId('draft-keep') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('draft-discard') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Sign in to keep or discard.')).toBeTruthy()
    expect(studio.keepDraft).not.toHaveBeenCalled()
  })
})

describe('the plugin names a coverage row by its stem, not its filename', () => {
  // narrative_status.py emits `name: stem` ("constitution"); the stage's documents are paths ending
  // ".md". The first version matched filename to filename, so on a real project no row got a button.
  it('offers the button and sends the document path the stage lists', async () => {
    const studio = installDraftApi({
      getNarrativeCoverage: vi.fn().mockResolvedValue({
        ok: true, hasData: true, notes: [], withNarrative: 0, total: 1,
        artifacts: [{ name: 'constitution', status: 'none', stale: null }],
      }),
    })
    const documents = [{
      name: 'constitution.md', path: '.sdlc/artifacts/00-discovery/constitution.md', exists: true, folder: false,
      shaped: true, findingCount: 0, ready: true,
    }]
    render(<Harness stageId="0" documents={documents} />)
    await screen.findByText(/plain-language summary/)
    fireEvent.click(within(screen.getByTestId('draft-row-constitution')).getByRole('button', { name: 'Draft with Claude' }))
    await waitFor(() => expect(studio.startDraft).toHaveBeenCalledWith('/p', {
      kind: 'enhance', stageId: '0', document: '.sdlc/artifacts/00-discovery/constitution.md',
    }))
  })
})
