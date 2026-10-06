// The command palette (studio-observatory.md §6.1). Rendered ONLY while open — two Playwright
// specs count `input` elements on the Board and the Sprint view and expect zero, so the combobox
// must not exist in the DOM when the palette is closed, not merely be hidden. Everything it can
// do comes in through `entries`; it never calls the preload bridge. The chrome — a search glyph,
// a 15 px query and a keycap hint row — is what makes the keyboard user's front door read as an
// instrument rather than a dialog; every hint is a `<kbd>`, never a second `<input>`.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { Kbd } from '../ui/Kbd'
import { cn } from '../ui/cn'
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
  const openerRef = useRef<HTMLElement | null>(null)
  const countId = useId()

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
          onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={onKeyDown}
          // `font-normal` overrides the md token's 600: the query is typed text, not a heading.
          className="w-full bg-transparent py-1.5 text-md font-normal text-ink-1 placeholder:text-ink-4"
        />
        <Kbd keys={['Escape']} />
      </div>
      <p id={countId} aria-live="polite" className="sr-only">{resultCountText(flat.length)}</p>
      <ul id={LISTBOX_ID} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto py-1">
        {groups.map((g) => {
          const labelId = `${LISTBOX_ID}-${g.group}`
          return (
            <li key={g.group} role="presentation">
              <ul role="group" aria-labelledby={labelId} className="pb-1">
                <li id={labelId} role="presentation" className="px-3 pb-1 pt-2.5 text-eyebrow uppercase text-ink-4">{g.label}</li>
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
          <li role="presentation" className={cn('px-3 py-6 text-center text-sm text-ink-3')}>
            Nothing matches “{query}”. Try <kbd className="font-mono">&gt;</kbd> for actions, <kbd className="font-mono">#</kbd> for specs, <kbd className="font-mono">/</kbd> for documents, <kbd className="font-mono">@</kbd> for stages.
          </li>
        )}
      </ul>
      <div className="flex items-center gap-3 border-t border-line-1 px-3 py-1.5 text-2xs text-ink-4">
        <span className="inline-flex items-center gap-1"><Kbd keys={['ArrowUp']} /><Kbd keys={['ArrowDown']} /> move</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1"><Kbd keys={['Enter']} /> open</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1"><Kbd keys={['Escape']} /> close</span>
      </div>
    </Dialog>
  )
}
