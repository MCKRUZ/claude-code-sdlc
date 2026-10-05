// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActivitiesPanel } from '../src/components/ActivitiesPanel'
import { BriefForm } from '../src/components/BriefForm'
import { clearAllBriefForms } from '../src/briefFormStore'
import { activity, readinessWith } from './activityFixtures'
import { briefCandidates, installBriefApi, removeBriefApi } from './briefFixtures'
import { openBrief } from './briefHarness'

afterEach(() => {
  cleanup()
  removeBriefApi()
  clearAllBriefForms()
})

const CAPABILITIES = ['activities', 'brief-candidates']
const row = (id: string) => document.querySelector(`[data-activity-id="${id}"]`) as HTMLElement

function draw(over: Parameters<typeof activity>[0], capabilities = CAPABILITIES) {
  const studio = installBriefApi()
  const readiness = readinessWith({ capabilities, activities: [activity(over)] })
  render(<ActivitiesPanel projectPath="/p" readiness={readiness} actor="@matt" onOpenDocument={vi.fn()} />)
  return studio
}

describe('ActivitiesPanel: the brief activity', () => {
  it('draws the form, not a bare Create button, once the plugin lists brief-candidates', async () => {
    draw({ id: 'brief', kind: 'draft', label: 'Workshop brief' })
    expect(await within(row('brief')).findByTestId('brief-form')).toBeTruthy()
    expect(within(row('brief')).queryByRole('button', { name: 'Create' })).toBeNull()
  })

  it('shows the blocked reason verbatim, no form, and reads nothing', () => {
    const reason = 'Needs the document analysis first.'
    const studio = draw({ id: 'brief', kind: 'draft', status: 'blocked', reason })
    expect(within(row('brief')).getByText(reason)).toBeTruthy()
    expect(screen.queryByTestId('brief-form')).toBeNull()
    expect(studio.getBriefCandidates).not.toHaveBeenCalled()
  })

  it('says the plugin is too old when it lacks brief-candidates, and reads nothing', () => {
    const studio = draw({ id: 'brief', kind: 'draft' }, ['activities'])
    expect(within(row('brief')).getByTestId('activity-disabled-reason').textContent).toBe('needs a newer plugin: lacks brief-candidates')
    expect(screen.queryByTestId('brief-form')).toBeNull()
    expect(studio.getBriefCandidates).not.toHaveBeenCalled()
  })

  it('keeps the form for a done activity and labels it Done', async () => {
    draw({ id: 'brief', kind: 'draft', status: 'done' })
    expect(within(row('brief')).getByText('Done')).toBeTruthy()
    expect(await within(row('brief')).findByTestId('brief-form')).toBeTruthy()
  })
})

describe('BriefForm: what the candidates call returned', () => {
  it('shows one alert line and no form when the call fails', async () => {
    installBriefApi({}, { ok: false, error: 'workshop_brief.py is missing.' })
    render(<BriefForm projectPath="/p" actor="" onOpenDocument={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('workshop_brief.py is missing.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByTestId('brief-form')).toBeNull()
  })

  it('shows one alert line when the call throws', async () => {
    installBriefApi({ getBriefCandidates: vi.fn().mockRejectedValue(new Error('IPC went away')) })
    render(<BriefForm projectPath="/p" actor="" onOpenDocument={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toBe('IPC went away')
  })

  it("shows the plugin's notes and no form or counters when there is no data", async () => {
    installBriefApi({}, briefCandidates({
      hasData: false, notes: ['contradiction-list.md not found: run the document analysis first.'],
      contradictions: [], questions: [], documents: [],
    }))
    render(<BriefForm projectPath="/p" actor="" onOpenDocument={vi.fn()} />)
    expect(await screen.findByText('contradiction-list.md not found: run the document analysis first.')).toBeTruthy()
    expect(screen.queryByTestId('brief-form')).toBeNull()
    expect(screen.queryByText(/\d+ of \d+/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Build the brief' })).toBeNull()
  })

  it('reads the candidates for the project once and nothing else', async () => {
    const { studio } = await openBrief()
    expect(studio.getBriefCandidates).toHaveBeenCalledTimes(1)
    expect(studio.getBriefCandidates).toHaveBeenCalledWith('/p')
    expect(studio.buildBrief).not.toHaveBeenCalled()
  })

  it('drops a candidates reply that arrives after the project changed', async () => {
    let resolveA!: (value: unknown) => void
    const forA = new Promise((r) => { resolveA = r })
    const forB = briefCandidates({ contradictions: [], documents: [{ id: 'DOC-900', filename: 'b-only.md', topics: '' }] })
    const studio = installBriefApi({
      getBriefCandidates: vi.fn((p: string) => (p === '/a' ? forA : Promise.resolve(forB))),
    })
    const view = render(<BriefForm projectPath="/a" actor="" onOpenDocument={vi.fn()} />)
    view.rerender(<BriefForm projectPath="/b" actor="" onOpenDocument={vi.fn()} />)
    await screen.findByTestId('brief-form')
    resolveA(briefCandidates())
    await waitFor(() => expect(studio.getBriefCandidates).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(screen.queryByLabelText('Include CON-01')).toBeNull()
    expect(screen.getByLabelText('Load-bearing DOC-900')).toBeTruthy()
  })
})
