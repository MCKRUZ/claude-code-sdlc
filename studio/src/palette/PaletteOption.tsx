// One palette row. `aria-selected` is the only selection signal the listbox carries — the input
// owns real focus (`aria-activedescendant` points here), so the row must never take focus of
// its own or the combobox pattern breaks. Matched characters are emphasised by weight, not by
// colour alone. Round 2: the row carries `data-pressable` (M8, attribute only) and
// `data-flip-id="palette:<id>"` so a re-rank glides rows to their new place (M5). Round 3 (Q3):
// the palette is a cmdk combobox — `CommandPalette` renders this row through `Command.Item
// asChild`, so cmdk's slot props (its `id`, `data-value`, `onClick` → select, `onPointerMove` →
// hover-select, the ref it registers) arrive as ordinary props and spread onto the `<li>`; a bare
// row (no cmdk above it) still renders and runs on mouse down exactly as before.
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'
import { cn } from '../ui/cn'
import type { ScoredEntry } from './types'

interface PaletteOptionProps extends Omit<ComponentPropsWithoutRef<'li'>, 'id' | 'role' | 'children'> {
  /** cmdk supplies the id through its Item slot; a bare row may name its own. */
  id?: string
  item: ScoredEntry
  selected: boolean
  onHover?: () => void
  /** Runs a bare row on mouse down; under cmdk the Item's `onSelect` runs the row instead. */
  onRun?: () => void
  kbd: ReactNode
  ref?: Ref<HTMLLIElement>
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

export function PaletteOption({ id, item, selected, onHover, onRun, kbd, className, ref, ...rest }: PaletteOptionProps) {
  const { entry, matches } = item
  const isVerb = entry.group === 'verbs'
  return (
    <li
      {...rest}
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected}
      data-entry-id={entry.id}
      data-flip-id={paletteFlipId(entry.id)}
      data-pressable=""
      onMouseEnter={(e) => {
        rest.onMouseEnter?.(e)
        onHover?.()
      }}
      // mousedown, not click: a click would first blur the input and the dialog's focus scope
      // would fight over focus before the row ran. Under cmdk the click itself runs the row.
      onMouseDown={(e) => {
        rest.onMouseDown?.(e)
        e.preventDefault()
        onRun?.()
      }}
      className={cn(
        'mx-1 flex cursor-default items-start gap-3 rounded-md px-2 py-[7px] text-sm',
        // surface-3, not -2: the row must read as selected against the palette's own surface.
        selected ? 'bg-surface-3 text-ink-1' : 'text-ink-2',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        {/* A verb row's title IS the argv the plugin will run — the one line a person must read
            before Enter, including `--by`: it wraps in the ident face and is never truncated. */}
        <span className={cn('block', isVerb ? 'whitespace-normal break-words font-mono text-ident' : 'truncate')} data-verb-argv={isVerb ? '' : undefined}>
          {highlightRuns(entry.title, matches).map((run, i) => (
            run.hit ? <strong key={i} className="font-semibold text-ink-1">{run.text}</strong> : <span key={i}>{run.text}</span>
          ))}
        </span>
        {entry.subtitle && <span className={cn('block text-xs text-ink-3', isVerb ? 'whitespace-normal' : 'truncate')}>{entry.subtitle}</span>}
      </span>
      {kbd && <span className="shrink-0 text-ink-3">{kbd}</span>}
    </li>
  )
}
