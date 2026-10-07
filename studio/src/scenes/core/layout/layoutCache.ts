// Where the constellation remembers its positions between opens (studio-observatory.md §5.0,
// `localStorage['studio.constellation.<hash(projectPath)>']`). Layout ONLY — a position says
// where a body sits, never anything about the work it stands for — so losing the cache costs a
// re-layout and nothing else, and every read is guarded: no `localStorage` (node tests, SSR), a
// full quota or a corrupt entry all read as "no cache".
import type { PreferenceStorageKey } from '../../../theme/tokens'
import { hashHex } from './hash'

export type Position = [number, number, number]

const VERSION = 1

interface CacheRecord {
  v: number
  positions: Record<string, Position>
}

export function layoutCacheKey(projectPath: string): Extract<PreferenceStorageKey, `studio.constellation.${string}`> {
  return `studio.constellation.${hashHex(projectPath)}`
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}

export function loadLayoutCache(projectPath: string): Map<string, Position> | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(layoutCacheKey(projectPath))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CacheRecord>
    if (parsed.v !== VERSION || typeof parsed.positions !== 'object' || parsed.positions === null) return null
    const out = new Map<string, Position>()
    for (const [id, pos] of Object.entries(parsed.positions)) if (isPosition(pos)) out.set(id, pos)
    return out
  } catch {
    return null
  }
}

export function saveLayoutCache(projectPath: string, positions: Map<string, Position>): void {
  const store = storage()
  if (!store) return
  const record: CacheRecord = { v: VERSION, positions: {} }
  for (const [id, pos] of positions) {
    record.positions[id] = [round(pos[0]), round(pos[1]), round(pos[2])]
  }
  try {
    store.setItem(layoutCacheKey(projectPath), JSON.stringify(record))
  } catch {
    // Quota or a disabled store: the next open simply lays out again.
  }
}

export function clearLayoutCache(projectPath: string): void {
  storage()?.removeItem(layoutCacheKey(projectPath))
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
