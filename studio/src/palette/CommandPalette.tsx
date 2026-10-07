// The command palette / omnibar (studio-observatory.md §6.1, togo-command-center.md §3.6).
// Rendered ONLY while open — two Playwright specs count `input` elements on the Board and the
// Sprint view and expect zero, so the combobox must not exist in the DOM when the palette is
// closed, not merely be hidden. Everything it can do comes in through `entries`; it never calls
// the preload bridge. Round 3 (Q3): the combobox is `cmdk` — it owns the `role="combobox"` input
// (`aria-expanded`, `aria-controls` → the listbox, `aria-activedescendant` → the selected row),
// ↑ ↓ with wrap, Home / End, Enter on the selected row and hover-select; the ranking stays the
// kit's own scorer (`shouldFilter={false}`) with the `intents.ts` verb row first, Tab / Shift+Tab
// cycle groups here, and the Dialog's layer owns Escape. The chrome — a search glyph, a 15 px
// query and a keycap hint row — is what makes the keyboard user's front door read as an
// instrument; every hint is a `<kbd>`, never a second `<input>`. Round 2 (M5): the rows stagger in
// (15 ms, cap 8) on the FIRST open of the session only; a re-rank Flips rows to their new place
// over 160 ms (`data-flip-id="palette:<id>"`); the empty state's prefixes are real `Kbd`s.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { MOTION_EASES } from '../motion/contract'
import { dialog as dialogChoreo } from '../motion/choreo/dialog'
import { useFlipGroup } from '../motion/useFlipGroup'
import { Dialog } from '../ui/Dialog'
import { EYEBROW_CLASS } from '../ui/Eyebrow'
import { Icon } from '../ui/Icon'
import { Kbd } from '../ui/Kbd'
import { cn } from '../ui/cn'
import { kitChoreoContext } from '../ui/kitMotion'
import { PaletteOption } from './PaletteOption'
import { cycleGroup, groupResults, resultCountText } from './paletteResults'
import { rankEntries } from './score'
import type { PaletteEntry } from './types'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  entries: readonly PaletteEntry[]
  /** Most recent first; boosts the scorer and labels the Recent group. */
  recentIds?: readonly string[]
  /** Called after the entry's own `run()`, e.g. to remember the pick. */
  onRun?: (entry: PaletteEntry) => void
  placeholder?: string
  /** The omnibar's verb rows for the typed words (`intents.ts`): zero or one entry, listed first.
   * Pure — the host builds the closure over its rows and roster; nothing is fetched or spawned. */
  intents?: (query: string, suggest: (phrase: string) => void) => PaletteEntry[]
}

/** A verb row outranks every static row, so the group holding it sorts first (`groupResults`). */
export const INTENT_SCORE = 10_000

/** Re-rank Flip: 160 ms, no stagger — the rows move together, as one list. */
export const PALETTE_FLIP_S = 0.16

export const PALETTE_INPUT_LABEL = 'Search commands, stages, specs and documents'

// Once per session (module state): the first open gets the row stagger, later opens do not.
let firstOpenPlayed = false
/** Test seam. */
export function resetPaletteFirstOpen(): void {
  firstOpenPlayed = false
}

export function CommandPalette({ open, onClose, entries, recentIds = [], onRun, placeholder = 'Search or jump to…', intents }: CommandPaletteProps) {
  // Mount the stateful body only while open so every keystroke's state resets with the dialog
  // and the `<input>` really is absent when closed.
  if (!open) return null
  return <PaletteBody onClose={onClose} entries={entries} recentIds={recentIds} onRun={onRun} placeholder={placeholder} intents={intents} />
}

type BodyProps = Omit<CommandPaletteProps, 'open'> & { recentIds: readonly string[]; placeholder: string }

function PaletteBody({ onClose, entries, recentIds, onRun, placeholder, intents }: BodyProps) {
  const [query, setQuery] = useState('')
  // cmdk's selected value is the entry id; '' (never undefined) keeps the combobox controlled.
  const [selectedId, setSelectedId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const baseId = useId()
  const countId = `${baseId}-count`
  const flip = useFlipGroup(listRef, '[data-flip-id]', { duration: PALETTE_FLIP_S, ease: MOTION_EASES['dur-2'], stagger: 0 })

  // First open of the session: rows arrive at 15 ms steps (row #15's stagger, cap 8). The Dialog
  // plays its own panel; this passes rows only.
  useLayoutEffect(() => {
    if (firstOpenPlayed) return
    firstOpenPlayed = true
    const list = listRef.current
    if (!list) return
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'))
    const tl = dialogChoreo.play(kitChoreoContext(list), { panel: null, rows, direction: 'open' })
    return () => {
      tl.kill()
    }
  }, [])

  // Remember who opened us and give focus back on unmount. The Dialog restores focus too; the
  // palette repeats it so the promise holds even if a host renders it outside a Dialog later.
  useEffect(() => {
    openerRef.current = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    return () => {
      const opener = openerRef.current
      if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus()
    }
  }, [])

  // Q4 (P4 seam): a typo's nearest template, chosen, FILLS the query with the phrase (its
  // placeholders still to type) and keeps the palette open on it — nothing is run and the host
  // hears nothing; only a phrase the grammar parses whole reaches `onIntent`. The flag is read by
  // `run` on the same tick the row's `run()` set it, so the close that follows every other row
  // is skipped for this one.
  const suggested = useRef(false)
  const suggest = useCallback((phrase: string) => {
    suggested.current = true
    setQuery(phrase)
    inputRef.current?.focus()
  }, [])
  const results = useMemo(() => {
    const ranked = rankEntries(query, entries, { recentIds })
    const verbs = intents && query.trim() ? intents(query, suggest) : []
    return verbs.length === 0 ? ranked : [...verbs.map((entry) => ({ entry, score: INTENT_SCORE, matches: [] })), ...ranked]
  }, [query, entries, recentIds, intents, suggest])
  const { groups, flat } = useMemo(() => groupResults(results), [results])
  const current = flat.findIndex((r) => r.entry.id === selectedId)

  // cmdk writes the combobox's active descendant from the row it finds selected in the DOM after
  // a move it made itself; the row it picks on open and after a re-rank is this component's
  // controlled state, so the same id is written here from the same row — never a different one.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    const row = selectedId ? rows.find((el) => el.dataset.entryId === selectedId) : undefined
    if (row?.id) input.setAttribute('aria-activedescendant', row.id)
    else input.removeAttribute('aria-activedescendant')
  }, [selectedId, flat])

  const run = (entry: PaletteEntry | undefined) => {
    if (!entry) return
    suggested.current = false
    entry.run()
    // A suggestion row filled the query instead of running anything: the palette stays open on the
    // filled phrase, and the row is not remembered as a recent (it is not an index entry).
    if (suggested.current) return
    onRun?.(entry)
    onClose()
  }

  // cmdk answers ↑ ↓ (wrapping), Home, End and Enter on its root; the Dialog's dismissable layer
  // answers Escape. Tab / Shift+Tab are the kit's own: the first row of the next (previous) group.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const target = flat[cycleGroup(groups, current, e.shiftKey ? -1 : 1)]
    if (target) setSelectedId(target.entry.id)
  }

  return (
    // `placement="top"`: the panel's height follows the result list, so it is anchored by its top
    // edge — the field the person is typing into never moves between keystrokes (v13).
    <Dialog open onClose={onClose} title="Command palette" label="Command palette" size="md" initialFocus={inputRef} chrome={false} placement="top" className="overflow-hidden p-0" data-testid="command-palette">
      <Command label={PALETTE_INPUT_LABEL} shouldFilter={false} loop vimBindings={false} value={selectedId} onValueChange={setSelectedId}>
        <div className="flex items-center gap-2 border-b border-line-1 px-3 py-2">
          <Icon icon={Search} size={16} className="text-ink-4" />
          <Command.Input
            ref={inputRef}
            aria-describedby={countId}
            aria-label={PALETTE_INPUT_LABEL}
            placeholder={placeholder}
            value={query}
            onValueChange={(next) => {
              flip.capture()
              setQuery(next)
            }}
            onKeyDown={onKeyDown}
            // `font-normal` overrides the md token's 600: the query is typed text, not a heading.
            className="w-full bg-transparent py-1.5 text-md font-normal text-ink-1 placeholder:text-ink-4"
          />
          <Kbd keys={['Escape']} />
        </div>
        <p id={countId} aria-live="polite" className="sr-only">{resultCountText(flat.length)}</p>
        {/* `relative`: the Flip's absolute positions are scoped by this list, the scrolled ancestor. */}
        <Command.List ref={listRef} label="Results" className="relative max-h-[60vh] overflow-y-auto py-1">
          <ul role="presentation">
            {groups.map((g) => {
              const labelId = `${baseId}-${g.group}`
              return (
                <li key={g.group} role="presentation">
                  <ul role="group" aria-labelledby={labelId} className="pb-1">
                    <li id={labelId} role="presentation" className={cn('px-3 pb-1 pt-2.5', EYEBROW_CLASS)}>{g.label}</li>
                    {g.items.map((item) => (
                      <Command.Item asChild key={item.entry.id} value={item.entry.id} onSelect={() => run(item.entry)}>
                        <PaletteOption item={item} selected={item.entry.id === selectedId} kbd={item.entry.kbd ? <Kbd keys={item.entry.kbd} /> : null} />
                      </Command.Item>
                    ))}
                  </ul>
                </li>
              )
            })}
            {flat.length === 0 && (
              <li role="presentation" data-palette-empty="" className="px-3 py-6 text-center text-sm text-ink-3">
                Nothing matches “{query}”. Try <Kbd keys={['>']} className="font-mono" /> for actions, <Kbd keys={['#']} className="font-mono" /> for specs,{' '}
                <Kbd keys={['/']} className="font-mono" /> for documents, <Kbd keys={['@']} className="font-mono" /> for stages.
              </li>
            )}
          </ul>
        </Command.List>
        <div className="flex items-center gap-3 border-t border-line-1 px-3 py-1.5 text-2xs text-ink-3">
          <span className="inline-flex items-center gap-1"><Kbd keys={['ArrowUp']} /><Kbd keys={['ArrowDown']} /> move</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1"><Kbd keys={['Enter']} /> open</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1"><Kbd keys={['Escape']} /> close</span>
        </div>
      </Command>
    </Dialog>
  )
}
