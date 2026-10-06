// The hook a host (Frame) uses to turn its live state into palette entries, plus the recent-pick
// list. It memoises on the input object the host passes — the host is expected to `useMemo` that
// object, since `run()` closures are rebuilt whenever it changes. No IPC: the specs come from
// `backlogStore` (what the Board already fetched), the documents from the readiness context.
import { useCallback, useMemo, useState } from 'react'
import { BUILD_VIEWS } from '../../shared/nav'
import { readDensity, readMotion, readTheme, usePreference, writeDensity, writeMotion, writeTheme } from '../ui/preferenceBridge'
import { nextDensity, nextMotion, nextTheme } from './paletteActions'
import { buildIndex, withRecentGroup } from './paletteIndex'
import { pushRecent, readRecent } from './recent'
import type { PaletteActionHooks, PaletteEntry, PaletteIndexInput, SettingsAnchor } from './types'

/** Settings sections in render order; a host passes this unless it has fewer sections. */
export const SETTINGS_ANCHORS: readonly SettingsAnchor[] = [
  'repository', 'gate-approvals', 'connection', 'people', 'limits',
  'approval', 'tooling', 'fixed-rules', 'appearance',
]

/** Everything in `PaletteIndexInput` except the two lists that have one right value. */
export type PaletteHostInput = Omit<PaletteIndexInput, 'buildViews' | 'settingsAnchors'> &
  Partial<Pick<PaletteIndexInput, 'buildViews' | 'settingsAnchors'>>

export interface PaletteIndexState {
  /** Rows for the open palette, recent picks re-tagged into the Recent group. */
  entries: PaletteEntry[]
  recentIds: string[]
  /** Call after an entry runs; persists and updates the Recent group. */
  remember: (entryId: string) => void
}

export function usePaletteIndex(host: PaletteHostInput): PaletteIndexState {
  // Read lazily, once: a second read on every render would make the hook's cost scale with
  // localStorage, and recents only change through `remember`.
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecent())
  const base = useMemo(() => buildIndex({
    ...host,
    buildViews: host.buildViews ?? BUILD_VIEWS,
    settingsAnchors: host.settingsAnchors ?? SETTINGS_ANCHORS,
  }), [host])
  const entries = useMemo(() => withRecentGroup(base, recentIds), [base, recentIds])
  const remember = useCallback((entryId: string) => setRecentIds(pushRecent(entryId)), [])
  return { entries, recentIds, remember }
}

/** The three preference hooks plus the one-step cyclers the shortcut map dispatches to. Values
 * come through `preferenceBridge`, so a change made here re-renders the Sidebar's Appearance
 * toggle too, and vice versa; the palette never holds a copy of a preference. Memoised on the
 * three values so a host can spread the result into its `actions` without re-building the index
 * on every render. */
export function usePreferenceActionHooks(): {
  hooks: Pick<PaletteActionHooks, 'theme' | 'density' | 'motion'>
  cycleTheme: () => void
  toggleDensity: () => void
  toggleMotion: () => void
} {
  const theme = usePreference(readTheme)
  const density = usePreference(readDensity)
  const motion = usePreference(readMotion)
  return useMemo(() => ({
    hooks: {
      theme: { value: theme, set: writeTheme },
      density: { value: density, set: writeDensity },
      motion: { value: motion, set: writeMotion },
    },
    cycleTheme: () => writeTheme(nextTheme(theme)),
    toggleDensity: () => writeDensity(nextDensity(density)),
    toggleMotion: () => writeMotion(nextMotion(motion)),
  }), [theme, density, motion])
}
