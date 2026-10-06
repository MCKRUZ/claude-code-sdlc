// Roving focus for a row of buttons (Segmented, TabList). One keydown handler: ←/→ move to the
// next enabled sibling (wrapping), Home/End jump to the ends. Returns the index to activate or
// null when the key is not one of ours, so each caller decides what "activate" means (Segmented
// selects; Tabs selects too, per the design's "roving + arrows"). Pure — no DOM access here, so
// it is SSR-safe and unit-testable without a renderer.
export type RovingKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'

export function isRovingKey(key: string): key is RovingKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End'
}

export function nextRovingIndex(key: RovingKey, current: number, enabled: readonly boolean[]): number | null {
  const n = enabled.length
  if (n === 0) return null
  const step = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= n; i++) {
      const idx = (from + dir * i + n * i) % n
      if (enabled[idx]) return idx
    }
    return null
  }
  switch (key) {
    case 'ArrowRight':
      return step(current, 1)
    case 'ArrowLeft':
      return step(current, -1)
    case 'Home':
      return enabled.findIndex(Boolean) === -1 ? null : enabled.findIndex(Boolean)
    case 'End': {
      const last = enabled.lastIndexOf(true)
      return last === -1 ? null : last
    }
  }
}
