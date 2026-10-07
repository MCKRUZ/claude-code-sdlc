// Pure helpers between the scorer and the listbox: grouping, the flat order ↑/↓ walks, and
// the result-count sentence the live region reads. Kept out of the component so the keyboard
// model (wrap, Home/End, Tab cycles groups) is testable as arithmetic.
import { PALETTE_GROUP_ORDER } from './types'
import type { PaletteGroup, ScoredEntry } from './types'

export const GROUP_LABEL: Record<PaletteGroup, string> = {
  verbs: 'Verbs',
  recent: 'Recent',
  stages: 'Stages',
  build: 'Build',
  specs: 'Specs',
  documents: 'Documents',
  settings: 'Settings',
  actions: 'Actions',
}

export interface ResultGroup {
  group: PaletteGroup
  label: string
  /** Index into the flat list of the group's first row, so Tab can land on it. */
  start: number
  items: ScoredEntry[]
}

/** Groups each keep score order inside. With a query typed, the group holding the best match
 * comes first (Enter on open must run the top result, not the first group's first row); with
 * nothing typed every score is 0 and the design's fixed group order stands. The flat list the
 * caller indexes with `aria-activedescendant` is the groups concatenated. */
export function groupResults(results: readonly ScoredEntry[]): { groups: ResultGroup[]; flat: ScoredEntry[] } {
  const byGroup = PALETTE_GROUP_ORDER
    .map((group) => ({ group, items: results.filter((r) => r.entry.group === group) }))
    .filter((g) => g.items.length > 0)
  byGroup.sort((a, b) => b.items[0].score - a.items[0].score || PALETTE_GROUP_ORDER.indexOf(a.group) - PALETTE_GROUP_ORDER.indexOf(b.group))
  const groups: ResultGroup[] = []
  const flat: ScoredEntry[] = []
  for (const { group, items } of byGroup) {
    groups.push({ group, label: GROUP_LABEL[group], start: flat.length, items })
    flat.push(...items)
  }
  return { groups, flat }
}

/** ↑/↓ with wrap. An empty list has no selection (-1). */
export function stepSelection(count: number, current: number, delta: 1 | -1): number {
  if (count === 0) return -1
  if (current < 0) return delta > 0 ? 0 : count - 1
  return (current + delta + count) % count
}

/** Tab / Shift+Tab: the first row of the next (or previous) group, wrapping. With one group
 * it goes to that group's first row, which is the honest answer rather than a no-op. */
export function cycleGroup(groups: readonly ResultGroup[], current: number, delta: 1 | -1): number {
  if (groups.length === 0) return -1
  let gi = groups.findIndex((g, i) => current >= g.start && (i === groups.length - 1 || current < groups[i + 1].start))
  if (gi < 0) gi = delta > 0 ? -1 : 0
  const next = (gi + delta + groups.length) % groups.length
  return groups[next].start
}

export function resultCountText(count: number): string {
  if (count === 0) return 'No results'
  return count === 1 ? '1 result' : `${count} results`
}

export const optionDomId = (index: number) => `palette-option-${index}`
export const LISTBOX_ID = 'palette-list'
