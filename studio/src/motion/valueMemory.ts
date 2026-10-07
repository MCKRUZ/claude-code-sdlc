// What a counter last showed, keyed by a stable id, kept OUTSIDE React (§4.1 `valueMemory`).
// A `StatTile` that unmounts when the person leaves a screen and remounts when they return
// should tween from the number it last displayed — not from 0, which it never displayed. The
// memory is also what makes the "never 0→n" rule checkable: a counter with no remembered value
// renders its first value as text, and a tween only runs between two REAL finite values.
export type RememberedValue = number | null

const memory = new Map<string, RememberedValue>()

export const valueMemory = {
  /** `undefined` means "never shown" — distinct from `null`, which means "shown as no data". */
  recall(id: string): RememberedValue | undefined {
    return memory.get(id)
  },

  remember(id: string, value: RememberedValue): void {
    memory.set(id, value)
  },

  forget(id: string): void {
    memory.delete(id)
  },

  clear(): void {
    memory.clear()
  },

  get size(): number {
    return memory.size
  },
}

/** The one place the counter rules live, so the hook and a test agree on them. A tween runs only
 * when both ends are finite numbers, they differ, and the previous value is not 0: a counter that
 * read "0" a moment ago was almost always a tile whose data had not arrived, and counting up from
 * there animates a fact that never existed. `0 → n` is therefore a text swap, like `null → n`. */
export type CounterTransition = 'first' | 'tween' | 'crossfade' | 'swap' | 'none'

export function classifyTransition(previous: RememberedValue | undefined, next: RememberedValue): CounterTransition {
  if (previous === undefined) return 'first'
  if (previous === next) return 'none'
  if (previous === null || next === null) return 'crossfade'
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return 'swap'
  if (previous === 0) return 'swap'
  return 'tween'
}
