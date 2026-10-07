// @vitest-environment jsdom
/** I7 — the neighbourhood as drawn: no canvas, bodies are real buttons named "Spec NNNN: title"
 * (never a bare id), an empty store says to open the Board, and a body that cannot open says why. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NEIGHBOURHOOD_EMPTY, SpecNeighbourhood } from '../src/components/SpecNeighbourhood'
import { backlogStore } from '../src/stores/backlogStore'
import type { BoardRow } from '../shared/types'

const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  spec: '0007', name: 'duplicate-claim-409', path: 'specs/0007.md', title: 'Duplicate claim 409', status: 'ready', risk: 'HIGH',
  team: 'claims', channel: '', owner: '@matt-k', developer: '', checker: '@priya-n', branch: '', sprint: 'S07', nextOwner: '',
  engReview: '', dataReview: '', dependsOn: [], pullRequest: null, ...over,
})
const ROWS = [row(), row({ spec: '0008', name: 'claim-export', title: 'Claim export', risk: 'MEDIUM', dependsOn: ['0007', '0042'] })]
const rowFor = (id: string) => ROWS.find((r) => r.spec === id) ?? null

afterEach(() => {
  cleanup()
  backlogStore.clear()
})

describe('SpecNeighbourhood', () => {
  it('with nothing fetched it says to open the Board once, and draws no figure', () => {
    render(<SpecNeighbourhood row={ROWS[1]} onOpenSpec={vi.fn()} rowFor={rowFor} />)
    expect(screen.getByText(NEIGHBOURHOOD_EMPTY)).toBeTruthy()
    expect(screen.queryByTestId('spec-neighbourhood')).toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('draws SVG edges and one button per body, named with the id AND the title, and opens a neighbour', () => {
    backlogStore.setRows('/p', ROWS)
    const onOpenSpec = vi.fn()
    render(<SpecNeighbourhood row={ROWS[1]} onOpenSpec={onOpenSpec} rowFor={rowFor} />)
    const figure = screen.getByTestId('spec-neighbourhood')
    expect(figure.querySelectorAll('svg path[data-edge]')).toHaveLength(2)
    expect(document.querySelector('canvas')).toBeNull()
    const buttons = Array.from(figure.querySelectorAll('button'))
    const names = buttons.map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Spec 0007: Duplicate claim 409', 'Spec 0042 (not shown)', 'Spec 0008: Claim export'])
    for (const name of names) expect(name).not.toMatch(/^\d{4}$/)
    fireEvent.click(screen.getByRole('button', { name: 'Spec 0007: Duplicate claim 409' }))
    expect(onOpenSpec).toHaveBeenCalledWith(expect.objectContaining({ spec: '0007' }))
    // The ghost cannot open (nobody fetched it) and says why; the centre is the spec being read.
    const ghost = screen.getByRole('button', { name: 'Spec 0042 (not shown)' })
    expect(ghost.getAttribute('aria-disabled')).toBe('true')
    expect(ghost.getAttribute('title')).toContain('Open the Board once')
    expect(screen.getByRole('button', { name: 'Spec 0008: Claim export' }).getAttribute('title')).toBe('This is the spec you are reading.')
    expect(figure.querySelector('figcaption')?.textContent).toContain('Size is the risk tier')
    // The legend names what colour means and what the ring means — colour is never the only signal.
    expect(figure.querySelector('figcaption')?.textContent).toMatch(/colour is the plugin's status word/)
    expect(figure.querySelector('figcaption')?.textContent).toMatch(/dashed amber ring is its NOT READY/)
    // Labels are two lines (id, then name), never truncated.
    expect(figure.querySelector('button span.truncate')).toBeNull()
  })

  it('without an opener every body is drawn but none opens, each with its reason', () => {
    backlogStore.setRows('/p', ROWS)
    render(<SpecNeighbourhood row={ROWS[1]} onOpenSpec={null} rowFor={rowFor} />)
    const known = screen.getByRole('button', { name: 'Spec 0007: Duplicate claim 409' })
    expect(known.getAttribute('aria-disabled')).toBe('true')
    expect(known.getAttribute('title')).toBeTruthy()
  })
})
