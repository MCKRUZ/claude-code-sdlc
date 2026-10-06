// @vitest-environment jsdom
/** `{10,4,6}` → 10 segments, index 4 "today"; any null → no bar, the sentence instead;
 * `remaining` shown as given even when `total − elapsed` disagrees (P5 acceptance). */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DATES_UNREADABLE } from '../shared/reasons'
import { BusinessDayBar, daysSentence, segmentStates } from '../src/components/BusinessDayBar'

describe('segmentStates', () => {
  it('{10,4,6} → ten segments, four done, index 4 today, five left', () => {
    const states = segmentStates({ total: 10, elapsed: 4, remaining: 6 })!
    expect(states).toHaveLength(10)
    expect(states.slice(0, 4).every((s) => s === 'done')).toBe(true)
    expect(states[4]).toBe('today')
    expect(states.slice(5).every((s) => s === 'left')).toBe(true)
  })
  it('remaining 0 → no "today" segment (the sprint ended); elapsed ≥ total → all done', () => {
    expect(segmentStates({ total: 10, elapsed: 10, remaining: 0 })!.every((s) => s === 'done')).toBe(true)
    expect(segmentStates({ total: 3, elapsed: 1, remaining: 0 })).toEqual(['done', 'left', 'left'])
  })
  it('any null → null (no bar)', () => {
    expect(segmentStates({ total: null, elapsed: 4, remaining: 6 })).toBeNull()
    expect(segmentStates({ total: 10, elapsed: null, remaining: 6 })).toBeNull()
    expect(segmentStates({ total: 10, elapsed: 4, remaining: null })).toBeNull()
  })
  it('remaining is shown as given even when total − elapsed differs', () => {
    expect(daysSentence({ total: 10, elapsed: 4, remaining: 3 })).toBe('10 business days · 4 elapsed · 3 remaining')
    expect(daysSentence({ total: null, elapsed: 4, remaining: 3 })).toBe(DATES_UNREADABLE)
  })
})

describe('BusinessDayBar', () => {
  it('draws one segment per business day with data-segment states and names its source', () => {
    render(<BusinessDayBar days={{ total: 10, elapsed: 4, remaining: 6 }} />)
    const bar = screen.getByTestId('business-day-bar')
    expect(bar.getAttribute('data-bar')).toBe('drawn')
    expect(bar.getAttribute('title')).toContain('sprint.py status --json')
    const segments = bar.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(10)
    expect(segments[4].getAttribute('data-segment')).toBe('today')
    expect(screen.getByRole('img', { name: '10 business days · 4 elapsed · 6 remaining' })).toBeTruthy()
  })
  it('any null day → the sentence "dates unreadable — no bar" and no segments', () => {
    render(<BusinessDayBar days={{ total: 10, elapsed: null, remaining: 6 }} />)
    const bar = screen.getByTestId('business-day-bar')
    expect(bar.getAttribute('data-bar')).toBe('none')
    expect(bar.textContent).toBe(DATES_UNREADABLE)
    expect(bar.querySelectorAll('[data-segment]')).toHaveLength(0)
  })
})
