// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearAllBriefForms } from '../src/briefFormStore'
import { briefCandidates, question, removeBriefApi } from './briefFixtures'
import { box, openBrief } from './briefHarness'

afterEach(() => {
  cleanup()
  removeBriefApi()
  clearAllBriefForms()
})

// Found by the correctness review of PR #96: the form and the main process must agree on what each
// rule is, or the person finds out only when Build is refused.
describe('BriefForm agrees with the main process', () => {
  it('limits logistics and attendee text to 200 characters, as the main process does', async () => {
    await openBrief()
    for (const label of ['Client name', 'Date, time and location', 'Duration', 'Facilitator', 'Attendee 1 name', 'Attendee 1 role']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).maxLength).toBe(200)
    }
  })

  it('treats an empty route as a question for the room, as the plugin does', async () => {
    const questions = [question(1, 'Scope', ''), question(2, 'Scope', 'workshop')]
    await openBrief({}, briefCandidates({ questions }))
    expect(box('Include Q-01').disabled).toBe(false)
    fireEvent.click(box('Include Q-01'))
    expect(box('Include Q-01').checked).toBe(true)
    expect(screen.getByTestId('brief-questions-counter').textContent).toBe('1 of 12')
  })

  it('lists a route that starts with pre as emailed, never as a question for the room', async () => {
    const questions = [question(1, 'Scope', 'workshop'), question(2, 'Scope', 'pre-workshop (email Dana)')]
    await openBrief({}, briefCandidates({ questions }))
    expect(screen.queryByRole('checkbox', { name: 'Include Q-02' })).toBeNull()
    expect(screen.getByText(/Email these before the workshop/).parentElement?.textContent).toContain('Q-02')
  })

  it('never offers a tick it will then ignore: every enabled question box can be ticked', async () => {
    const questions = [question(1, 'Scope', 'workshop-extra'), question(2, 'Scope', 'workshop')]
    await openBrief({}, briefCandidates({ questions }))
    for (const id of ['Q-01', 'Q-02']) {
      const checkbox = box(`Include ${id}`)
      expect(checkbox.disabled).toBe(false)
      fireEvent.click(checkbox)
      expect(box(`Include ${id}`).checked).toBe(true)
    }
  })
})
