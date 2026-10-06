// One palette row. `aria-selected` is the only selection signal the listbox carries — the input
// owns real focus (`aria-activedescendant` points here), so the row must never take focus of
// its own or the combobox pattern breaks. Matched characters are emphasised by weight, not by
// colour alone. Round 2: the row carries `data-pressable` (M8, attribute only) and
// `data-flip-id="palette:<id>"` so a re-rank glides rows to their new place (M5).
import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import type { ScoredEntry } from './types'

interface PaletteOptionProps {
  id: string
  item: ScoredEntry
  selected: boolean
  onHover: () => void
  onRun: () => void
  kbd: ReactNode
}

export const paletteFlipId = (entryId: string) => `palette:${entryId}`

/** Split the title into runs so matched characters can be wrapped without re-rendering each
 * character as its own element. */
export function highlightRuns(title: string, matches: readonly number[]): { text: string; hit: boolean }[] {
  if (matches.length === 0) return [{ text: title, hit: false }]
  const hits = new Set(matches)
  const runs: { text: string; hit: boolean }[] = []
  for (let i = 0; i < title.length; i++) {
    const hit = hits.has(i)
    const last = runs[runs.length - 1]
    if (last && last.hit === hit) last.text += title.charAt(i)
    else runs.push({ text: title.charAt(i), hit })
  }
  return runs
}

export function PaletteOption({ id, item, selected, onHover, onRun, kbd }: PaletteOptionProps) {
  const { entry, matches } = item
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      data-entry-id={entry.id}
      data-flip-id={paletteFlipId(entry.id)}
      data-pressable=""
      onMouseEnter={onHover}
      // mousedown, not click: a click would first blur the input and the Dialog's trap would
      // fight over focus before the row ran.
      onMouseDown={(e) => { e.preventDefault(); onRun() }}
      className={cn(
        'mx-1 flex cursor-default items-center gap-3 rounded-md px-2 py-[7px] text-sm',
        // surface-3, not -2: the row must read as selected against the palette's own surface.
        selected ? 'bg-surface-3 text-ink-1' : 'text-ink-2',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {highlightRuns(entry.title, matches).map((run, i) => (
            run.hit ? <strong key={i} className="font-semibold text-ink-1">{run.text}</strong> : <span key={i}>{run.text}</span>
          ))}
        </span>
        {entry.subtitle && <span className="block truncate text-xs text-ink-3">{entry.subtitle}</span>}
      </span>
      {kbd && <span className="shrink-0 text-ink-3">{kbd}</span>}
    </li>
  )
}
