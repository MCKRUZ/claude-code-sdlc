// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearAllBriefForms } from '../src/briefFormStore'
import { briefCandidates, removeBriefApi } from './briefFixtures'
import { addDecision, box, buttonNamed, click, openBrief, pickDocuments, type } from './briefHarness'

afterEach(() => {
  cleanup()
  removeBriefApi()
  clearAllBriefForms()
})

const counter = (id: string) => screen.getByTestId(id).textContent

describe('BriefForm: contradictions', () => {
  it('lists id, title, severity and the question, with the recommended ones ticked', async () => {
    await openBrief()
    const first = screen.getAllByTestId('brief-contradiction')[0]
    for (const text of ['CON-01', 'Contradiction 1 title', 'blocks-outcome', 'Which is right for item 1?']) {
      expect(within(first).getByText(new RegExp(text))).toBeTruthy()
    }
    expect([1, 2, 3, 4, 5, 6].map((n) => box(`Include CON-0${n}`).checked)).toEqual([true, true, false, false, false, false])
    expect(counter('brief-contradictions-counter')).toBe('2 of 5')
  })

  it('shows both quoted sources only after the row is expanded', async () => {
    await openBrief()
    expect(screen.queryByText(/Quoted passage A1/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show sources for CON-01' }))
    expect(screen.getByText(/DOC-001 s1\.1/)).toBeTruthy()
    expect(screen.getByText(/Quoted passage A1/)).toBeTruthy()
    expect(screen.getByText(/DOC-002 s1\.2/)).toBeTruthy()
    expect(screen.getByText(/Quoted passage B2/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide sources for CON-01' }))
    expect(screen.queryByText(/Quoted passage A1/)).toBeNull()
  })

  it('disables the unticked boxes with the reason once the limit is reached, and frees them on untick', async () => {
    await openBrief()
    click('Include CON-03'); click('Include CON-04'); click('Include CON-05')
    expect(counter('brief-contradictions-counter')).toBe('5 of 5')
    expect(box('Include CON-06').disabled).toBe(true)
    expect(box('Include CON-01').disabled).toBe(false)
    expect(screen.getByText('The page holds 5 contradictions.')).toBeTruthy()
    click('Include CON-01')
    expect(box('Include CON-06').disabled).toBe(false)
    expect(screen.queryByText('The page holds 5 contradictions.')).toBeNull()
  })
})

describe('BriefForm: questions', () => {
  it('groups the workshop questions by block in the order given, all unticked', async () => {
    await openBrief()
    const groups = screen.getAllByTestId('brief-question-block')
    expect(groups.map((g) => g.getAttribute('data-block'))).toEqual(['Scope', 'Data'])
    expect(within(groups[1]).getByText(/Question 3 for the room/)).toBeTruthy()
    expect(box('Include Q-01').checked).toBe(false)
    expect(counter('brief-questions-counter')).toBe('0 of 12')
    click('Include Q-01'); click('Include Q-05')
    expect(counter('brief-questions-counter')).toBe('2 of 12')
  })

  it('lists pre-workshop questions under their own heading, not tickable and not on the page', async () => {
    await openBrief()
    const list = screen.getByTestId('brief-emailed-questions')
    expect(within(list).getByText('Email these before the workshop')).toBeTruthy()
    expect(within(list).getByText(/Question 2 for the room/)).toBeTruthy()
    expect(within(list).getByText(/not placed on the page/i)).toBeTruthy()
    expect(within(list).queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Include Q-02' })).toBeNull()
  })

  it('shows interview questions disabled with the reason', async () => {
    await openBrief()
    const checkbox = box('Include Q-04')
    expect(checkbox.disabled).toBe(true)
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText('Neither in the room nor emailed.')).toBeTruthy()
  })

  it('disables the further boxes with the reason at the question limit', async () => {
    await openBrief({}, briefCandidates({ limits: { contradictions: 5, questions: 2, decisions: [3, 5], loadBearing: [3, 5] } }))
    click('Include Q-01'); click('Include Q-03')
    expect(counter('brief-questions-counter')).toBe('2 of 2')
    expect(box('Include Q-05').disabled).toBe(true)
    expect(screen.getByText('The page holds 2 questions.')).toBeTruthy()
  })
})

describe('BriefForm: load-bearing documents', () => {
  it('lists id, file name and topics with the counter against the range', async () => {
    await openBrief()
    expect(counter('brief-documents-counter')).toBe('0 of 3 to 5')
    const section = within(screen.getByRole('region', { name: 'Load-bearing documents' }))
    expect(section.getByText(/file-2\.md/)).toBeTruthy()
    expect(section.getByText(/topic 2/)).toBeTruthy()
    pickDocuments('DOC-001', 'DOC-004')
    expect(counter('brief-documents-counter')).toBe('2 of 3 to 5')
  })

  it('disables the unticked documents at the maximum', async () => {
    await openBrief()
    pickDocuments('DOC-001', 'DOC-002', 'DOC-003', 'DOC-004', 'DOC-005')
    expect(counter('brief-documents-counter')).toBe('5 of 3 to 5')
    pickDocuments('DOC-001')
    expect(box('Load-bearing DOC-001').checked).toBe(false)
    expect(box('Load-bearing DOC-001').disabled).toBe(false)
  })

  it('stops a sixth document being added', async () => {
    await openBrief({}, briefCandidates({ documents: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `DOC-00${n}`, filename: `f${n}.md`, topics: '' })) }))
    pickDocuments('DOC-001', 'DOC-002', 'DOC-003', 'DOC-004', 'DOC-005')
    expect(box('Load-bearing DOC-006').disabled).toBe(true)
  })
})

describe('BriefForm: claims', () => {
  it('cannot add a claim until both the text and a document are given', async () => {
    await openBrief()
    const add = buttonNamed('Add claim')
    expect(add.disabled).toBe(true)
    type('Claim text', 'Average claim takes 19 days')
    expect(add.disabled).toBe(true)
    type('Claim document', 'DOC-002')
    expect(add.disabled).toBe(false)
  })

  it('offers each registry document by id and file name, and limits the text to 500 characters', async () => {
    await openBrief()
    const select = screen.getByLabelText('Claim document') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(
      ['Choose a document', ...[1, 2, 3, 4, 5].map((n) => `DOC-00${n} file-${n}.md`)])
    expect((screen.getByLabelText('Claim text') as HTMLInputElement).maxLength).toBe(500)
  })

  it('adds a claim as a row, clears the inputs, and removes it again', async () => {
    await openBrief()
    type('Claim text', 'Average claim takes 19 days')
    type('Claim document', 'DOC-002')
    fireEvent.click(buttonNamed('Add claim'))
    expect(screen.getByTestId('brief-claim').textContent).toContain('Average claim takes 19 days')
    expect(screen.getByTestId('brief-claim').textContent).toContain('DOC-002')
    expect((screen.getByLabelText('Claim text') as HTMLInputElement).value).toBe('')
    fireEvent.click(buttonNamed('Remove claim 1'))
    expect(screen.queryByTestId('brief-claim')).toBeNull()
  })
})

describe('BriefForm: decisions', () => {
  it('counts the standing decisions against the page range', async () => {
    await openBrief()
    expect(counter('brief-decisions-counter')).toBe('Decisions on the page: 2 (the template carries 2; the page takes 3 to 5)')
    addDecision('Who owns intake?')
    expect(counter('brief-decisions-counter')).toBe('Decisions on the page: 3 (the template carries 2; the page takes 3 to 5)')
  })

  it('refuses a whitespace-only decision and removes an added one', async () => {
    await openBrief()
    type('Decision text', '   ')
    expect(buttonNamed('Add decision').disabled).toBe(true)
    addDecision('Who owns intake?')
    expect(screen.getByTestId('brief-decision').textContent).toContain('Who owns intake?')
    fireEvent.click(buttonNamed('Remove decision 1'))
    expect(screen.queryByTestId('brief-decision')).toBeNull()
  })
})

describe('BriefForm: logistics', () => {
  it('defaults the facilitator to the signed-in person until it is edited', async () => {
    await openBrief()
    const input = screen.getByLabelText('Facilitator') as HTMLInputElement
    expect(input.value).toBe('@matt')
    type('Facilitator', 'Alex')
    expect(input.value).toBe('Alex')
  })

  it('adds and removes attendee rows', async () => {
    await openBrief()
    fireEvent.click(buttonNamed('Add attendee'))
    type('Attendee 2 name', 'Kim')
    fireEvent.click(buttonNamed('Remove attendee 1'))
    expect((screen.getByLabelText('Attendee 1 name') as HTMLInputElement).value).toBe('Kim')
    expect(screen.queryByLabelText('Attendee 2 name')).toBeNull()
  })

  it('adds a roster person as an attendee with the role left to fill', async () => {
    await openBrief()
    await screen.findByRole('option', { name: 'Sam K' })
    type('Team member to add', '@sam-k')
    fireEvent.click(buttonNamed('Add a team member'))
    expect((screen.getByLabelText('Attendee 1 name') as HTMLInputElement).value).toBe('Sam K')
    expect((screen.getByLabelText('Attendee 1 role') as HTMLInputElement).value).toBe('')
    expect(screen.getAllByLabelText(/Attendee \d+ name/)).toHaveLength(1)
  })

  it('omits the roster shortcut when the roster cannot be read', async () => {
    await openBrief({ getProjectSettings: () => Promise.reject(new Error('no roster')) })
    expect(screen.queryByRole('button', { name: 'Add a team member' })).toBeNull()
  })
})
