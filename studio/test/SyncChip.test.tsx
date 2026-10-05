// @vitest-environment jsdom
//
// The sidebar's sync chip. A project that is simply not connected to a shared repository yet (every
// new project) is not a failure, so it reads as a calm statement of where the work is saved. The red
// "Sync error" stays for a sync that actually failed.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SyncChip } from '../src/components/SyncChip'

describe('SyncChip', () => {
  it('says the work is saved on this computer only, calmly, when there is no shared repository', () => {
    const { container } = render(<SyncChip syncState={{ kind: 'localOnly' }} />)
    expect(screen.getByText('Saved on this computer only')).toBeTruthy()
    expect(screen.getByText(/not shared with a team yet/i)).toBeTruthy()
    expect(screen.queryByText(/error/i)).toBeNull()
    // Not the error styling.
    expect(container.innerHTML).not.toContain('command-error')
    expect(container.innerHTML).not.toContain('bg-red')
  })

  it('explains how to connect, in the hover text', () => {
    const { container } = render(<SyncChip syncState={{ kind: 'localOnly' }} />)
    const title = container.querySelector('[title]')?.getAttribute('title') ?? ''
    expect(title).toMatch(/shared repository/i)
    expect(title).toMatch(/git remote add origin/)
  })

  it('still shows a real failure in red', () => {
    const { container } = render(<SyncChip syncState={{ kind: 'error', message: 'fetch failed' }} />)
    expect(screen.getByText('Sync error')).toBeTruthy()
    expect(container.innerHTML).toContain('command-error')
  })
})
