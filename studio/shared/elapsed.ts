/** A running time for a person watching something load: whole seconds under a minute ("7s"),
 * then minutes and seconds ("2:05"). Never negative, so a clock that steps back cannot show a
 * nonsense figure. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
