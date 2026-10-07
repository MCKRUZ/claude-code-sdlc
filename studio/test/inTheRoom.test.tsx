// @vitest-environment jsdom
/** Presence, never totals: the roster in roster order, one ring each (only I wear the you-ring),
 * lane-shaped dots for the specs a person holds — no digit anywhere inside `[data-person]` or the
 * holdings — and hover lights that person's cards through `roomStore`. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { holdings, InTheRoom } from '../src/components/InTheRoom'
import { buildLanes } from '../src/components/lanes/laneModel'
import { resetRoomStore, roomStore } from '../src/stores/roomStore'
import { NO_ROSTER } from '../shared/reasons'
import { BOARD_ROWS, ME, ROSTER, SPRINT } from './sprintHomeFixture'

afterEach(() => { cleanup(); resetRoomStore() })

describe('holdings', () => {
  it('lists the lane rows naming a person, in lane order — a list, not a number', () => {
    const rows = buildLanes(SPRINT, BOARD_ROWS).all
    const sam = ROSTER.people[2]
    expect(holdings(sam, rows).map((h) => `${h.row.id}:${h.lane}`)).toEqual(['0008:building', '0009:checking', '0010:merged'])
    expect(holdings({ handle: '@nobody' }, rows)).toEqual([])
  })
})

describe('InTheRoom', () => {
  it('draws the roster in order with one you-ring, lane dots and no digits in any person element', () => {
    render(<InTheRoom people={ROSTER.people} view={SPRINT} board={BOARD_ROWS} me={ME} />)
    const rowsEl = document.querySelectorAll('[data-person-row]')
    expect(Array.from(rowsEl).map((r) => r.getAttribute('data-handle'))).toEqual(['@priya-n', ME, '@sam-k'])
    expect(document.querySelectorAll('[data-person][data-you]')).toHaveLength(1)
    for (const p of Array.from(document.querySelectorAll('[data-person]'))) expect(p.textContent ?? '').not.toMatch(/\d/)
    for (const h of Array.from(document.querySelectorAll('[data-holdings]'))) expect(h.textContent ?? '').not.toMatch(/\d/)
    // Sam holds three: three glyphs, no numeral.
    expect(rowsEl[2].querySelectorAll('[data-holdings] svg')).toHaveLength(3)
    expect(screen.getByText('presence, not totals')).toBeTruthy()
  })

  it('hover lights the person in the room store; leaving the list clears it', () => {
    render(<InTheRoom people={ROSTER.people} view={SPRINT} board={BOARD_ROWS} me={ME} />)
    const sam = document.querySelector('[data-person-row][data-handle="@sam-k"]') as HTMLElement
    fireEvent.mouseEnter(sam)
    expect(roomStore.litHandle).toBe('@sam-k')
    expect(sam.hasAttribute('data-lit')).toBe(true)
    fireEvent.mouseLeave(sam.closest('ul')!)
    expect(roomStore.litHandle).toBeNull()
  })

  it('no roster → the reasons sentence in the dashed frame', () => {
    render(<InTheRoom people={null} view={SPRINT} board={BOARD_ROWS} me={ME} />)
    expect(screen.getByTestId('room-empty').textContent).toBe(NO_ROSTER)
  })
})

describe('InTheRoom as one row under the header (owner\'s v12 item 1)', () => {
  it('lays the roster out as pills in a wrapping row, each naming the person with handle and team on hover', () => {
    render(<InTheRoom people={ROSTER.people} view={SPRINT} board={BOARD_ROWS} me={ME} />)
    const room = screen.getByTestId('in-the-room')
    expect(room.hasAttribute('data-room-row')).toBe(true)
    expect(room.className).toContain('flex-wrap')
    expect(room.className).not.toContain('space-y')
    const sam = document.querySelector('[data-person-row][data-handle="@sam-k"]') as HTMLElement
    expect(sam.className).toContain('rounded-full')
    expect(sam.getAttribute('title')).toBe('@sam-k · data')
    expect(sam.getAttribute('aria-label')).toBe('Sam K, data')
  })
})
