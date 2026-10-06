// The command palette (studio-observatory.md §6.1). Rendered ONLY while open — two Playwright
// specs count `input` elements on the Board and the Sprint view and expect zero, so the combobox
// must not exist in the DOM when the palette is closed, not merely be hidden. Everything it can
// do comes in through `entries`; it never calls the preload bridge. The chrome — a search glyph,
// a 15 px query and a keycap hint row — is what makes the keyboard user's front door read as an
// instrument rather than a dialog; every hint is a `<kbd>`, never a second `<input>`.
// Round 2 (M5): the result rows stagger in (15 ms, cap 8) on the FIRST open of the session only —
// after that the palette is a tool and appears at once; a re-rank Flips rows to their new place
// over 160 ms (`data-flip-id="palette:<id>"`); the empty state's prefixes are real `Kbd`s; group
// labels and the footer are words, so they wear `ink-3`.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
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
import { LISTBOX_ID, cycleGroup, groupResults, optionDomId, resultCountText, stepSelection } from './paletteResults'
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
}

/** Re-rank Flip: 160 ms, no stagger — the rows move together, as one list. */
export const PALETTE_FLIP_S = 0.16

// Once per session (module state): the first open gets the row stagger, later opens do not.
let firstOpenPlayed = false
/** Test seam. */
export function resetPaletteFirstOpen(): void {
  firstOpenPlayed = false
}

export function CommandPalette({ open, onClose, entries, recentIds = [], onRun, placeholder = 'Search or jump to…' }: CommandPaletteProps) {
  // Mount the stateful body only while open so every keystroke's state resets with the dialog
  // and the `<input>` really is absent when closed.
  if (!open) return null
  return <PaletteBody onClose={onClose} entries={entries} recentIds={recentIds} onRun={onRun} placeholder={placeholder} />
}

type BodyProps = Omit<CommandPaletteProps, 'open'> & { recentIds: readonly string[]; placeholder: string }

function PaletteBody({ onClose, entries, recentIds, onRun, placeholder }: BodyProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const countId = useId()
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

  const results = useMemo(() => rankEntries(query, entries, { recentIds }), [query, entries, recentIds])
  const { groups, flat } = useMemo(() => groupResults(results), [results])
  const current = flat.length === 0 ? -1 : Math.min(selected, flat.length - 1)

  const run = (entry: PaletteEntry | undefined) => {
    if (!entry) return
    entry.run()
    onRun?.(entry)
    onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setSelected(stepSelection(flat.length, current, 1)); break
      case 'ArrowUp': e.preventDefault(); setSelected(stepSelection(flat.length, current, -1)); break
      case 'Home': e.preventDefault(); setSelected(flat.length ? 0 : -1); break
      case 'End': e.preventDefault(); setSelected(flat.length - 1); break
      case 'Tab': e.preventDefault(); setSelected(cycleGroup(groups, current, e.shiftKey ? -1 : 1)); break
      case 'Enter': e.preventDefault(); run(flat[current]?.entry); break
      case 'Escape': e.preventDefault(); e.stopPropagation(); onClose(); break
      // Backspace on an empty query clears a prefix — the natural edit already does that, since
      // the prefix is the only character left; nothing to special-case.
      default: return
    }
  }

  return (
    <Dialog open onClose={onClose} title="Command palette" label="Command palette" size="md" initialFocus={inputRef} chrome={false} className="overflow-hidden p-0" data-testid="command-palette">
      <div className="flex items-center gap-2 border-b border-line-1 px-3 py-2">
        <Icon icon={Search} size={16} className="text-ink-4" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={current >= 0 ? optionDomId(current) : undefined}
          aria-autocomplete="list"
          aria-describedby={countId}
          aria-label="Search commands, stages, specs and documents"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          onChange={(e) => { flip.capture(); setQuery(e.target.value); setSelected(0) }}
          onKeyDown={onKeyDown}
          // `font-normal` overrides the md token's 600: the query is typed text, not a heading.
          className="w-full bg-transparent py-1.5 text-md font-normal text-ink-1 placeholder:text-ink-4"
        />
        <Kbd keys={['Escape']} />
      </div>
      <p id={countId} aria-live="polite" className="sr-only">{resultCountText(flat.length)}</p>
      {/* `relative`: the Flip's absolute positions are scoped by this list, the scrolled ancestor. */}
      <ul ref={listRef} id={LISTBOX_ID} role="listbox" aria-label="Results" className="relative max-h-[60vh] overflow-y-auto py-1">
        {groups.map((g) => {
          const labelId = `${LISTBOX_ID}-${g.group}`
          return (
            <li key={g.group} role="presentation">
              <ul role="group" aria-labelledby={labelId} className="pb-1">
                <li id={labelId} role="presentation" className={cn('px-3 pb-1 pt-2.5', EYEBROW_CLASS)}>{g.label}</li>
                {g.items.map((item, i) => {
                  const index = g.start + i
                  return (
                    <PaletteOption
                      key={item.entry.id}
                      id={optionDomId(index)}
                      item={item}
                      selected={index === current}
                      onHover={() => setSelected(index)}
                      onRun={() => run(item.entry)}
                      kbd={item.entry.kbd ? <Kbd keys={item.entry.kbd} /> : null}
                    />
                  )
                })}
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
      <div className="flex items-center gap-3 border-t border-line-1 px-3 py-1.5 text-2xs text-ink-3">
        <span className="inline-flex items-center gap-1"><Kbd keys={['ArrowUp']} /><Kbd keys={['ArrowDown']} /> move</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1"><Kbd keys={['Enter']} /> open</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1"><Kbd keys={['Escape']} /> close</span>
      </div>
    </Dialog>
  )
}
