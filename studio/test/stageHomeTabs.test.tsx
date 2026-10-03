// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageHome } from '../src/components/StageHome'
import { StageReadinessProvider } from '../src/components/StageReadinessContext'
import type { StageDocument, StageReadiness } from '../shared/types'
import { activity, readinessWith } from './activityFixtures'

function doc(path: string, ready: boolean): StageDocument {
  return { name: path, path, exists: true, folder: false, shaped: true, findingCount: 0, ready } as StageDocument
}

const ACTIVITIES = [
  activity({ id: 'rules-check', kind: 'check', label: 'Business rules check' }),
  activity({ id: 'intake', kind: 'run', label: 'Read the documents', command: 'sdlc-intake' }),
  activity({ id: 'data', kind: 'create', label: 'Data contract', command: 'sdlc-data' }),
]

function stage(stageId: string, over: Partial<StageReadiness> = {}): StageReadiness {
  return readinessWith({
    stageId, display: `Phase ${stageId}: Stage ${stageId}`, isCurrent: false,
    documents: [doc('a.md', false), doc('b.md', false)],
    ...over,
  })
}

function install(readinessFor: (stageId?: string) => StageReadiness) {
  const studio = {
    getStageReadiness: vi.fn((_project: string, stageId?: string) => Promise.resolve(readinessFor(stageId))),
    getStageGuide: vi.fn().mockResolvedValue({ ok: true, markdown: 'The stage guide text.' }),
    openDocument: vi.fn().mockReturnValue(new Promise(() => {})),
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

function home(stageId: string): ReactElement {
  return (
    <StageReadinessProvider projectPath="/p" stageId={stageId}>
      <StageHome projectPath="/p" stageId={stageId} actor="matt" setOpening={vi.fn()} onSignedOff={vi.fn()} onOpenDocument={vi.fn()} />
    </StageReadinessProvider>
  )
}

const tabs = () => within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)
const selected = () => screen.getByRole('tab', { selected: true }).textContent

describe('StageHome: the Guide tab', () => {
  it('adds Guide after Documents, and Workflow stays the default', async () => {
    install((id) => stage(id ?? '1'))
    render(home('1'))
    await screen.findByRole('tablist')
    expect(tabs()).toEqual(['Workflow', 'Documents', 'Guide'])
    expect(selected()).toBe('Workflow')
  })

  it('shows the guide when picked, with every declared activity and its command', async () => {
    install((id) => stage(id ?? '1', { definition: 'phases/01.md', activities: ACTIVITIES }))
    render(home('1'))
    fireEvent.click(await screen.findByRole('tab', { name: 'Guide' }))
    expect(await screen.findByText('The stage guide text.')).toBeTruthy()
    const items = screen.getAllByTestId('guide-activity').map((i) => i.textContent)
    expect(items).toContain('Read the documents /sdlc-intake')
  })

  it('goes back to Workflow when the stage changes, as the other tabs do', async () => {
    install((id) => stage(id ?? '1', { definition: 'phases/x.md' }))
    const { rerender } = render(home('1'))
    fireEvent.click(await screen.findByRole('tab', { name: 'Guide' }))
    expect(selected()).toBe('Guide')

    rerender(home('2'))
    await waitFor(() => expect(selected()).toBe('Workflow'))
  })
})

describe('StageHome: Also in this stage on the Workflow tab', () => {
  it('draws the list under the step list, only for kinds Studio has a control for', async () => {
    install((id) => stage(id ?? '1', {
      capabilities: ['activities', 'rules-check'], activities: ACTIVITIES,
    }))
    render(home('1'))
    await screen.findByText('Also in this stage')
    const ids = screen.getAllByTestId('activity-row').map((r) => r.getAttribute('data-activity-id'))
    expect(ids).toEqual(['rules-check', 'data'])
    const list = screen.getAllByTestId('workflow-step')[0].closest('ol')!
    expect(list.compareDocumentPosition(screen.getByTestId('activities-panel')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('leaves the tab exactly as it was for an older plugin that emits no activities key', async () => {
    install((id) => stage(id ?? '1'))
    render(home('1'))
    await screen.findAllByTestId('workflow-step')
    expect(screen.getAllByTestId('workflow-step')).toHaveLength(3)
    expect(screen.queryByText('Also in this stage')).toBeNull()
    expect(screen.queryByTestId('activities-panel')).toBeNull()
  })

  it('keeps the document steps when the plugin warns about its declaration', async () => {
    install((id) => stage(id ?? '1', { activities: [], warnings: ['activities.yaml is broken.'] }))
    render(home('1'))
    await screen.findByTestId('activities-warning')
    expect(screen.getAllByTestId('workflow-step')).toHaveLength(3)
  })

  it('refreshes readiness after Create so the activity status comes from the plugin again', async () => {
    const studio = install((id) => stage(id ?? '1', { capabilities: ['activities'], activities: ACTIVITIES.slice(2) }))
    // @ts-expect-error - extending the test double
    window.studio.startActivity = vi.fn().mockResolvedValue({ ok: true, created: ['x/data-contract.md'], existing: [], opened: 'x/data-contract.md' })
    render(home('1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Create' }))
    await screen.findByTestId('activity-result')
    await waitFor(() => expect(studio.getStageReadiness).toHaveBeenCalledTimes(2))
  })
})
