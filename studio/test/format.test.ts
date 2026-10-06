// C6 `shared/format.ts`: formats plugin values, never derives one. Node environment — the
// helpers are pure `Intl` and must work in the main process too.
import { describe, expect, it } from 'vitest'
import { NO_DATA, NO_DATE, formatDate, formatDateTime, formatHours, formatRelative, formatTime, plural, pluralWord } from '../shared/format'

describe('plural', () => {
  it('picks the word by Intl.PluralRules and renders the count', () => {
    expect(pluralWord(1, 'spec', 'specs')).toBe('spec')
    expect(pluralWord(0, 'spec', 'specs')).toBe('specs')
    expect(pluralWord(6, 'spec', 'specs')).toBe('specs')
    expect(plural(1, 'spec', 'specs')).toBe('1 spec')
    expect(plural(6, 'spec', 'specs')).toBe('6 specs')
    expect(plural(1200, 'line', 'lines')).toBe('1,200 lines')
  })

  it('never renders NaN as a count', () => {
    expect(plural(Number.NaN, 'spec', 'specs')).toBe(NO_DATA)
  })
})

describe('dates', () => {
  const at = new Date(2026, 9, 6, 14, 5) // 6 Oct 2026 14:05 local

  it('formatDate / formatTime / formatDateTime read as a person writes them', () => {
    expect(formatDate(at)).toBe('6 Oct 2026')
    expect(formatTime(at)).toBe('14:05')
    expect(formatDateTime(at)).toBe('6 Oct 2026, 14:05')
    expect(formatDate(at.toISOString())).toBe('6 Oct 2026')
  })

  it('a missing or unparseable date says so instead of inventing one', () => {
    expect(formatDate(null)).toBe(NO_DATE)
    expect(formatDate('')).toBe(NO_DATE)
    expect(formatDateTime('not a date')).toBe(NO_DATE)
    expect(formatTime(undefined)).toBe(NO_DATE)
  })
})

describe('formatHours', () => {
  it('one decimal under ten hours, whole from ten up', () => {
    expect(formatHours(2.46)).toBe('2.5 h')
    expect(formatHours(0.5)).toBe('0.5 h')
    expect(formatHours(9.96)).toBe('10.0 h')
    expect(formatHours(10)).toBe('10 h')
    expect(formatHours(36.4)).toBe('36 h')
  })

  it('does not fabricate a zero or a negative wait', () => {
    expect(formatHours(null)).toBe(NO_DATA)
    expect(formatHours(undefined)).toBe(NO_DATA)
    expect(formatHours(-1)).toBe(NO_DATA)
    expect(formatHours(Number.POSITIVE_INFINITY)).toBe(NO_DATA)
  })
})

describe('formatRelative', () => {
  const now = new Date(2026, 9, 6, 9, 0)

  it('speaks in calendar days: today, yesterday, N days ago, in N days', () => {
    expect(formatRelative(new Date(2026, 9, 6, 23, 59), now)).toBe('today')
    expect(formatRelative(new Date(2026, 9, 5, 23, 50), now)).toBe('yesterday')
    expect(formatRelative(new Date(2026, 9, 3, 12, 0), now)).toBe('3 days ago')
    expect(formatRelative(new Date(2026, 9, 7, 0, 10), now)).toBe('tomorrow')
    expect(formatRelative(new Date(2026, 9, 8, 0, 10), now)).toBe('in 2 days')
  })

  it('a missing date is "no date recorded", never "today"', () => {
    expect(formatRelative(null, now)).toBe(NO_DATE)
    expect(formatRelative('garbage', now)).toBe(NO_DATE)
  })
})
