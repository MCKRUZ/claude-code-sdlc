// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAllBriefForms } from '../src/briefFormStore'
import { briefCandidates, builtBrief, removeBriefApi } from './briefFixtures'
import {
  addDecision, box, buttonNamed, click, completeForm, fillLogistics, openBrief, pickDocuments, reason, type,
} from './briefHarness'

afterEach(() => {
  cleanup()
  removeBriefApi()
  clearAllBriefForms()
})

const build = () => buttonNamed('Build the brief')

describe('BriefForm: when Build is allowed, and why not', () => {
  it('is disabled with one visible reason that names what is missing, in order', async () => {
    await openBrief()
    expect(build().disabled).toBe(true)
    expect(reason()).toBe('Choose at least 3 load-bearing documents')
    pickDocuments('DOC-001', 'DOC-002', 'DOC-003')
    expect(reason()).toBe('Add at least 1 more decision')
    addDecision('Who owns intake?')
    expect(reason()).toBe('Client name is required')
    type('Client name', 'Acme Insurance')
    expect(reason()).toBe('Date, time and location is required')
    type('Date, time and location', '12 Nov, 10:00, Leeds')
    expect(reason()).toBe('Duration is required')
    type('Duration', '90 minutes')
    expect(reason()).toBe('Add at least one attendee with a name and a role')
    type('Attendee 1 name', 'Jo Client')
    expect(reason()).toBe('Add at least one attendee with a name and a role')
    type('Attendee 1 role', 'Head of Claims')
    expect(screen.queryByTestId('brief-build-reason')).toBeNull()
    expect(build().disabled).toBe(false)
  })

  it('treats a whitespace-only field as missing', async () => {
    await openBrief()
    completeForm()
    type('Client name', '    ')
    expect(reason()).toBe('Client name is required')
    expect(build().disabled).toBe(true)
  })

  it('names the facilitator when it is emptied', async () => {
    await openBrief()
    completeForm()
    type('Facilitator', '')
    expect(reason()).toBe('Facilitator is required')
  })

  it('names too many load-bearing documents and too many decisions', async () => {
    await openBrief({}, briefCandidates({ limits: { contradictions: 5, questions: 12, decisions: [3, 3], loadBearing: [3, 5] } }))
    completeForm()
    expect(build().disabled).toBe(false)
    type('Decision text', 'One too many')
    fireEvent.click(buttonNamed('Add decision'))
    expect(reason()).toBe('The page takes at most 3 decisions')
  })

  it('needs the existing brief to be confirmed for replacement before it enables', async () => {
    await openBrief({}, briefCandidates({ existingBrief: true }))
    completeForm()
    expect(screen.getByText('A brief already exists.')).toBeTruthy()
    expect(build().disabled).toBe(true)
    expect(reason()).toBe('Tick "Replace the existing brief" to build')
    click('Replace the existing brief')
    expect(build().disabled).toBe(false)
  })

  it('shows no replace control when there is no brief yet', async () => {
    await openBrief()
    expect(screen.queryByText('A brief already exists.')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Replace the existing brief' })).toBeNull()
  })
})

describe('BriefForm: what is sent', () => {
  it('passes exactly the chosen selections, in the order shown, with only workshop questions', async () => {
    const { studio } = await openBrief()
    click('Include CON-04'); click('Include CON-03')
    click('Include Q-05'); click('Include Q-01')
    pickDocuments('DOC-003', 'DOC-001', 'DOC-002')
    type('Claim text', '  Average claim takes 19 days  ')
    type('Claim document', 'DOC-002')
    fireEvent.click(buttonNamed('Add claim'))
    addDecision('  Who owns intake?  ')
    addDecision('What is the target?')
    type('Client name', ' Acme Insurance ')
    type('Date, time and location', '12 Nov, 10:00, Leeds')
    type('Duration', '90 minutes')
    type('Attendee 1 name', 'Jo Client')
    type('Attendee 1 role', 'Head of Claims')
    fireEvent.click(buttonNamed('Add attendee'))
    fireEvent.click(buttonNamed('Build the brief'))
    await waitFor(() => expect(studio.buildBrief).toHaveBeenCalledTimes(1))
    expect(studio.buildBrief).toHaveBeenCalledWith('/p', {
      contradictions: ['CON-01', 'CON-02', 'CON-03', 'CON-04'],
      questions: ['Q-01', 'Q-05'],
      loadBearing: ['DOC-001', 'DOC-002', 'DOC-003'],
      claims: [{ text: 'Average claim takes 19 days', docRef: 'DOC-002' }],
      decisions: ['Who owns intake?', 'What is the target?'],
      logistics: {
        clientName: 'Acme Insurance', dateTimeLocation: '12 Nov, 10:00, Leeds', duration: '90 minutes',
        facilitator: '@matt', attendees: [{ name: 'Jo Client', role: 'Head of Claims' }],
      },
      replaceExisting: false,
    })
  })

  it('sends replaceExisting only when the person ticked it', async () => {
    const { studio } = await openBrief({}, briefCandidates({ existingBrief: true }))
    completeForm()
    click('Replace the existing brief')
    fireEvent.click(build())
    await waitFor(() => expect(studio.buildBrief).toHaveBeenCalled())
    expect(studio.buildBrief.mock.calls[0][1].replaceExisting).toBe(true)
  })

  it('calls buildBrief once however many times the button is pressed', async () => {
    let finish!: (value: unknown) => void
    const pending = new Promise((r) => { finish = r })
    const { studio } = await openBrief({ buildBrief: vi.fn().mockReturnValue(pending) })
    completeForm()
    fireEvent.click(build()); fireEvent.click(build()); fireEvent.click(build())
    expect(studio.buildBrief).toHaveBeenCalledTimes(1)
    finish(builtBrief())
    await screen.findByTestId('brief-result')
    expect(studio.buildBrief).toHaveBeenCalledTimes(1)
  })
})

describe('BriefForm: the result', () => {
  it('shows the path, the counts, the notes and the lint, then opens the brief', async () => {
    const result = builtBrief({
      contradictionsOnPage: 3, questionsOnPage: 4, emailedInstead: ['Q-02', 'Q-07'],
      notes: ['No claims were given, so "What the documents say" is empty.'],
      lint: [{ line: 14, message: 'this line does not end with a question mark' }],
    })
    const { onOpenDocument } = await openBrief({ buildBrief: vi.fn().mockResolvedValue(result) })
    completeForm()
    fireEvent.click(build())
    await screen.findByTestId('brief-result')
    expect(screen.getByText('Brief written: .sdlc/artifacts/00-discovery/workshop-brief.md')).toBeTruthy()
    expect(screen.getByText('3 contradictions and 4 questions on the page')).toBeTruthy()
    expect(screen.getByText('Emailed instead: Q-02, Q-07')).toBeTruthy()
    expect(screen.getByText('No claims were given, so "What the documents say" is empty.')).toBeTruthy()
    expect(screen.getByText('Line 14: this line does not end with a question mark')).toBeTruthy()
    expect(onOpenDocument).toHaveBeenCalledWith('.sdlc/artifacts/00-discovery/workshop-brief.md')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('omits the emailed line when nothing was emailed', async () => {
    await openBrief()
    completeForm()
    fireEvent.click(build())
    await screen.findByTestId('brief-result')
    expect(screen.queryByText(/Emailed instead/)).toBeNull()
  })

  it('shows one alert line with the refusal and keeps the form filled', async () => {
    const { onOpenDocument } = await openBrief({ buildBrief: vi.fn().mockResolvedValue({ ok: false, error: 'Error: a claim needs a document in workshop.py' }) })
    completeForm()
    fireEvent.click(build())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Error: a claim needs a document in workshop.py')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByTestId('brief-form')).toBeTruthy()
    expect((screen.getByLabelText('Client name') as HTMLInputElement).value).toBe('Acme Insurance')
    expect(box('Load-bearing DOC-001').checked).toBe(true)
    expect(onOpenDocument).not.toHaveBeenCalled()
    expect(build().disabled).toBe(false)
  })

  it('shows one alert line when the call throws, and allows trying again', async () => {
    await openBrief({ buildBrief: vi.fn().mockRejectedValue(new Error('IPC went away')) })
    completeForm()
    fireEvent.click(build())
    expect((await screen.findByRole('alert')).textContent).toBe('IPC went away')
    await waitFor(() => expect(build().disabled).toBe(false))
  })
})

describe('BriefForm: remembering what was typed', () => {
  it('keeps ticks, claims, decisions and logistics across an unmount and remount', async () => {
    const first = await openBrief()
    click('Include CON-01')
    click('Include CON-05')
    pickDocuments('DOC-004')
    type('Claim text', 'Average claim takes 19 days')
    type('Claim document', 'DOC-003')
    fireEvent.click(buttonNamed('Add claim'))
    addDecision('Who owns intake?')
    fillLogistics()
    first.view.unmount()
    await openBrief({}, undefined, {}, false)
    expect(box('Include CON-01').checked).toBe(false)
    expect(box('Include CON-05').checked).toBe(true)
    expect(box('Load-bearing DOC-004').checked).toBe(true)
    expect(screen.getByTestId('brief-claim').textContent).toContain('Average claim takes 19 days')
    expect(screen.getByTestId('brief-decision').textContent).toContain('Who owns intake?')
    expect((screen.getByLabelText('Client name') as HTMLInputElement).value).toBe('Acme Insurance')
    expect((screen.getByLabelText('Attendee 1 name') as HTMLInputElement).value).toBe('Jo Client')
  })

  it('never shows one project\'s values in another', async () => {
    const first = await openBrief({}, undefined, { projectPath: '/a' })
    fillLogistics()
    first.view.unmount()
    await openBrief({}, undefined, { projectPath: '/b' }, false)
    expect((screen.getByLabelText('Client name') as HTMLInputElement).value).toBe('')
    expect(box('Include CON-01').checked).toBe(true)
    cleanup()
    await openBrief({}, undefined, { projectPath: '/a' }, false)
    expect((screen.getByLabelText('Client name') as HTMLInputElement).value).toBe('Acme Insurance')
  })

  it('clears the stored form after a successful build', async () => {
    const first = await openBrief()
    completeForm()
    click('Include CON-01')
    fireEvent.click(build())
    await screen.findByTestId('brief-result')
    first.view.unmount()
    await openBrief({}, undefined, {}, false)
    expect((screen.getByLabelText('Client name') as HTMLInputElement).value).toBe('')
    expect(box('Include CON-01').checked).toBe(true)
  })

  it('keeps the stored form after a refused build', async () => {
    const first = await openBrief({ buildBrief: vi.fn().mockResolvedValue({ ok: false, error: 'Error: no' }) })
    completeForm()
    fireEvent.click(build())
    await screen.findByRole('alert')
    first.view.unmount()
    await openBrief({}, undefined, {}, false)
    expect((screen.getByLabelText('Client name') as HTMLInputElement).value).toBe('Acme Insurance')
  })
})
