// @vitest-environment jsdom
//
// The sidebar's sync chip. A project that is simply not connected to a shared repository yet (every
// new project) is not a failure, so it reads as a calm statement of where the work is saved, with the
// way out in its hover card. The red "Sync error" stays for a sync that actually failed.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SyncChip } from '../src/components/SyncChip'
import { CHIP_TONE } from '../src/ui/Chip'

describe('SyncChip', () => {
  it('says the work is saved on this computer only, in the neutral tone, when there is no shared repository', () => {
    render(<SyncChip syncState={{ kind: 'localOnly' }} />)
    const chip = screen.getByRole('status')
    expect(chip.textContent).toContain('Saved on this computer only')
    expect(chip.textContent).not.toMatch(/error/i)
    expect(chip.className).not.toContain(CHIP_TONE.error)
  })

  it('explains, in the hover card, that nothing is shared yet and how to connect a repository', async () => {
    render(<SyncChip syncState={{ kind: 'localOnly' }} />)
    fireEvent.mouseEnter(screen.getByRole('status').parentElement as HTMLElement)
    expect(await screen.findByText(/not shared with a team yet/i, {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText(/git remote add origin/)).toBeTruthy()
  })

  it('still shows a real failure as an error', () => {
    render(<SyncChip syncState={{ kind: 'error', message: 'fetch failed' }} />)
    const chip = screen.getByRole('status')
    expect(chip.textContent).toContain('Sync error')
    expect(chip.className).toContain(CHIP_TONE.error)
  })
})
