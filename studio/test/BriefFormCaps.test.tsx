// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearAllBriefForms } from '../src/briefFormStore'
import { MAX_ATTENDEES, MAX_CLAIMS } from '../shared/briefLimits'
import { removeBriefApi } from './briefFixtures'
import { openBrief } from './briefHarness'

afterEach(() => {
  cleanup()
  removeBriefApi()
  clearAllBriefForms()
})

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('BriefForm: caps on claims and attendees', () => {
  it('stops adding attendees at the cap and says why', async () => {
    await openBrief()
    for (let i = 1; i < MAX_ATTENDEES; i++) fireEvent.click(button('Add attendee'))
    expect(screen.getAllByTestId('brief-attendee')).toHaveLength(MAX_ATTENDEES)
    expect(button('Add attendee').disabled).toBe(true)
    expect(screen.getByText(`A brief takes up to ${MAX_ATTENDEES} attendees.`)).toBeTruthy()
  })

  it('stops adding claims at the cap and says why', async () => {
    await openBrief()
    for (let i = 0; i < MAX_CLAIMS; i++) {
      fireEvent.change(screen.getByLabelText('Claim text'), { target: { value: `Claim ${i + 1}` } })
      fireEvent.change(screen.getByLabelText('Claim document'), { target: { value: 'DOC-001' } })
      fireEvent.click(button('Add claim'))
    }
    fireEvent.change(screen.getByLabelText('Claim text'), { target: { value: 'One more' } })
    fireEvent.change(screen.getByLabelText('Claim document'), { target: { value: 'DOC-001' } })
    expect(button('Add claim').disabled).toBe(true)
    expect(screen.getByText(`A brief takes up to ${MAX_CLAIMS} claims.`)).toBeTruthy()
  })
})
