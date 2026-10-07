// Density preference (studio-observatory.md §2.1): `<html data-density="comfortable|compact">`
// from `localStorage['studio.density']`. Compact only retunes the rhythm variables in base.css;
// the sidebar and the chat aside are sized in px so density never moves the nav. Applied in
// main.tsx next to the theme, before `createRoot`. No window access at module top level.
import type { DensityAttr } from './tokens'

export const DENSITY_STORAGE_KEY = 'studio.density'
export const DENSITIES: readonly DensityAttr[] = ['comfortable', 'compact']

function isDensity(value: unknown): value is DensityAttr {
  return typeof value === 'string' && (DENSITIES as readonly string[]).includes(value)
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The stored density; anything unreadable or unknown is `comfortable`. */
export function readDensity(): DensityAttr {
  const raw = storage()?.getItem(DENSITY_STORAGE_KEY)
  return isDensity(raw) ? raw : 'comfortable'
}

/** Sets `<html data-density>`. Returns what was applied. */
export function applyDensity(density: DensityAttr = readDensity()): DensityAttr {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-density', density)
  }
  return density
}

/** Persists and applies. A storage failure still applies for this session. */
export function setDensity(density: DensityAttr): DensityAttr {
  try {
    storage()?.setItem(DENSITY_STORAGE_KEY, density)
  } catch {
    // quota or disabled storage — apply anyway
  }
  return applyDensity(density)
}
