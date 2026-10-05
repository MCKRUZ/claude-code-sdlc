// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AiProposalCard } from '../src/components/AiProposalCard'

// The shared "AI draft — accept/edit/discard" card FieldEditor.tsx and ChatPanel.tsx both build
// on, extracted so a future fix to the pattern is made once (item 10 of the review).

describe('AiProposalCard', () => {
  it('renders the label and content, and fires onAccept/onDiscard', async () => {
    const onAccept = vi.fn()
    const onDiscard = vi.fn()
    render(
      <AiProposalCard label="Proposed write — d.md — S — F" busy={false} onAccept={onAccept} onDiscard={onDiscard}>
        <p>the proposed content</p>
      </AiProposalCard>,
    )
    expect(screen.getByText('Proposed write — d.md — S — F')).toBeTruthy()
    expect(screen.getByText('the proposed content')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('supports a custom accept label (FieldEditor\'s "Use this")', () => {
    render(
      <AiProposalCard label="Claude's draft" busy={false} acceptLabel="Use this" onAccept={() => {}} onDiscard={() => {}}>
        <p>draft text</p>
      </AiProposalCard>,
    )
    expect(screen.getByRole('button', { name: 'Use this' })).toBeTruthy()
  })

  it('renders middleActions between Accept and Discard (ChatPanel\'s Edit toggle)', () => {
    render(
      <AiProposalCard
        label="L" busy={false} onAccept={() => {}} onDiscard={() => {}}
        middleActions={<button type="button">Edit</button>}
      >
        <p>content</p>
      </AiProposalCard>,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('disables every action button while busy', () => {
    render(
      <AiProposalCard label="L" busy onAccept={() => {}} onDiscard={() => {}}>
        <p>content</p>
      </AiProposalCard>,
    )
    expect((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
