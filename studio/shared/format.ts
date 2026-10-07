// C6 — the one place a plugin value is turned into words. Every helper FORMATS a value the plugin
// reported; none derives one (no "hours since", no averages, no counts of its own). A value the
// plugin did not give reads as "no data" / "no date recorded", never as 0 or today's date.
// `Intl` does the plural, date and relative-day work so no screen keeps its own "s" rule.

const DEFAULT_LOCALE = 'en-GB'

export const NO_DATA = 'no data'
export const NO_DATE = 'no date recorded'

/** The word alone: `pluralWord(1, 'spec', 'specs')` → "spec". */
export function pluralWord(n: number, one: string, many: string, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(n)) return many
  return new Intl.PluralRules(locale).select(n) === 'one' ? one : many
}

/** Count and word together: `plural(6, 'spec', 'specs')` → "6 specs". A non-finite count reads
 * "no data" rather than "NaN specs". */
export function plural(n: number, one: string, many: string, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(n)) return NO_DATA
  return `${new Intl.NumberFormat(locale).format(n)} ${pluralWord(n, one, many, locale)}`
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "6 Oct 2026". */
export function formatDate(value: string | number | Date | null | undefined, locale: string = DEFAULT_LOCALE): string {
  const date = toDate(value)
  if (!date) return NO_DATE
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** "14:05" — 24-hour, no seconds. */
export function formatTime(value: string | number | Date | null | undefined, locale: string = DEFAULT_LOCALE): string {
  const date = toDate(value)
  if (!date) return NO_DATE
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

/** "6 Oct 2026, 14:05". */
export function formatDateTime(value: string | number | Date | null | undefined, locale: string = DEFAULT_LOCALE): string {
  const date = toDate(value)
  if (!date) return NO_DATE
  return `${formatDate(date, locale)}, ${formatTime(date, locale)}`
}

/** Hours the plugin measured: under ten, one decimal ("2.5 h"); ten and over, whole ("36 h").
 * Negative or non-finite is not a measurement and reads "no data". */
export function formatHours(hours: number | null | undefined, locale: string = DEFAULT_LOCALE): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return NO_DATA
  const digits = hours < 10 ? 1 : 0
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(hours)} h`
}

const DAY_MS = 86_400_000

/** Whole calendar days between two instants in the local zone, so 23:50 → 00:10 is one day. */
function calendarDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((a - b) / DAY_MS)
}

/** "today" · "yesterday" · "3 days ago" · "in 2 days". Days only — a finer unit would be the
 * clock's claim, not the plugin's. `now` is a parameter so a test is deterministic. */
export function formatRelative(
  value: string | number | Date | null | undefined,
  now: number | Date = Date.now(),
  locale: string = DEFAULT_LOCALE,
): string {
  const date = toDate(value)
  if (!date) return NO_DATE
  const reference = toDate(now) ?? new Date()
  const days = calendarDays(date, reference)
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
}
