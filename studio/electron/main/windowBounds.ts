import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The window's size and place, remembered between sessions. Pure helpers here (tested); the
 * BrowserWindow wiring lives in index.ts. The app used to open at a fixed 1280×800 on every
 * display — small on a 27-inch screen, and the command center's lanes want room — so the first
 * open now fits the display's work area with a floor, and later opens restore what the person
 * left, as long as it still lands on a connected display. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface WorkArea { x: number; y: number; width: number; height: number }

export const MIN_WIDTH = 1180
export const MIN_HEIGHT = 720
/** The first-open ceiling: large enough for four lanes and the Today rail, never a wall-to-wall window. */
export const FIRST_OPEN_MAX = { width: 1680, height: 1050 }
/** Breathing room kept from the work area's edges on a first open. */
const MARGIN = 48

/** First open: the largest window up to FIRST_OPEN_MAX that fits the work area with a margin,
 * never under the floor, centred. */
export function firstOpenBounds(area: WorkArea): Rect {
  const width = Math.max(MIN_WIDTH, Math.min(FIRST_OPEN_MAX.width, area.width - MARGIN))
  const height = Math.max(MIN_HEIGHT, Math.min(FIRST_OPEN_MAX.height, area.height - MARGIN))
  return { width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2) }
}

/** A remembered rect is used only if at least a 200×120 corner of it is on SOME work area (a
 * display that was unplugged must not swallow the window); the size is clamped to the floor. */
export function fitSavedBounds(saved: unknown, areas: readonly WorkArea[]): Rect | null {
  if (!saved || typeof saved !== 'object') return null
  const r = saved as Partial<Rect>
  if (![r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const rect: Rect = { x: r.x!, y: r.y!, width: Math.max(MIN_WIDTH, r.width!), height: Math.max(MIN_HEIGHT, r.height!) }
  const visible = areas.some((a) => {
    const ox = Math.min(rect.x + rect.width, a.x + a.width) - Math.max(rect.x, a.x)
    const oy = Math.min(rect.y + rect.height, a.y + a.height) - Math.max(rect.y, a.y)
    return ox >= 200 && oy >= 120
  })
  return visible ? rect : null
}

export function boundsFile(userData: string): string {
  return join(userData, 'window-bounds.json')
}

export function readSavedBounds(userData: string): unknown {
  const file = boundsFile(userData)
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : null } catch { return null }
}

export function writeSavedBounds(userData: string, rect: Rect): void {
  const file = boundsFile(userData)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(rect), 'utf-8')
  } catch { /* a window size that could not be remembered is not worth a dialog */ }
}

/** Rendering scale for a window of this content width (device-independent px). The layout is
 * drawn for ~1440 px: on a 2560-wide display the type and controls read small and the lanes
 * stand mostly empty, so the window scales its rendering up — 1.0 at or under 1440, rising
 * linearly to 1.3 at 2560 and no further. Below 1440 nothing shrinks (a laptop stays legible).
 * A person's explicit zoom is not modelled here; `TOGO_AUTO_ZOOM=0` turns this off (tests). */
export const ZOOM_BASE_WIDTH = 1440
export const ZOOM_MAX_WIDTH = 2560
export const ZOOM_MAX = 1.3
export function zoomFor(contentWidth: number): number {
  if (!Number.isFinite(contentWidth) || contentWidth <= ZOOM_BASE_WIDTH) return 1
  const t = Math.min(1, (contentWidth - ZOOM_BASE_WIDTH) / (ZOOM_MAX_WIDTH - ZOOM_BASE_WIDTH))
  return Math.round((1 + t * (ZOOM_MAX - 1)) * 100) / 100
}
