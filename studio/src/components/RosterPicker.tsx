// #31 RosterPicker: the UI half of the Batch-3 roster pickers (studio-observatory.md §6.4 "Hand-off
// Developer"). A `role="combobox"` over the roster the caller already holds — this component does
// no IPC, so the HandoffDialog keeps its one write and the board's reads stay where they are.
// With no roster to offer it degrades to the free-text input it replaces: the plugin validates
// the handle either way, and a picker that refused to accept a handle the roster has not caught
// up with would be Studio enforcing a rule the hand-off command owns.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Field, Input, cn } from '../ui'
import type { RosterEntry, RosterPickerProps } from '../ui'

/** The roster rows whose handle, name or team contain the typed text, in roster order. Matching is
 * a contains-test on purpose: people type a surname or a team as readily as a handle. */
export function filterRoster(roster: RosterEntry[], query: string): RosterEntry[] {
  const q = query.trim().replace(/^@/, '').toLowerCase()
  if (!q) return roster
  return roster.filter((p) =>
    p.handle.replace(/^@/, '').toLowerCase().includes(q)
    || p.name.toLowerCase().includes(q)
    || (p.team ?? '').toLowerCase().includes(q),
  )
}

export function RosterPicker({
  roster,
  value,
  onChange,
  allowFreeText = true,
  label,
  id,
  disabled,
  disabledReason,
  placeholder,
}: RosterPickerProps) {
  const generated = useId()
  const inputId = id ?? `roster-${generated}`
  const listId = `${inputId}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => filterRoster(roster, value), [roster, value])
  const hasRoster = roster.length > 0
  const showList = hasRoster && open && matches.length > 0
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1))

  const pick = (entry: RosterEntry) => {
    onChange(entry.handle)
    setOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!hasRoster) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else setActive((i) => Math.min(i + 1, matches.length - 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
        return
      case 'Enter':
        if (showList && matches[activeIndex]) {
          e.preventDefault()
          pick(matches[activeIndex])
        }
        return
      case 'Escape':
        if (open) {
          // Esc here closes the list only; the §6.2 "back" layer must not fire from inside a form.
          e.stopPropagation()
          setOpen(false)
        }
        return
      default:
        return
    }
  }

  const hint = !hasRoster
    ? 'No roster to choose from — type the handle; the hand-off command checks it.'
    : allowFreeText
      ? undefined
      : 'Choose someone from the roster.'

  return (
    <Field label={label} id={inputId} hint={hint}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          value={value}
          placeholder={placeholder ?? '@handle'}
          disabled={disabled}
          disabledReason={disabledReason}
          autoComplete="off"
          mono
          onChange={(e) => {
            onChange(e.target.value)
            setActive(0)
            if (hasRoster) setOpen(true)
          }}
          onFocus={() => { if (hasRoster) setOpen(true) }}
          onBlur={() => {
            // Let a click on an option land before the list goes away.
            setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={onKeyDown}
          {...(hasRoster
            ? {
              role: 'combobox',
              'aria-expanded': showList,
              'aria-controls': listId,
              'aria-autocomplete': 'list' as const,
              'aria-activedescendant': showList ? `${listId}-${activeIndex}` : undefined,
            }
            : {})}
        />
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={typeof label === 'string' ? label : undefined}
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-line-2 bg-surface-raised py-1 text-xs shadow-2"
          >
            {matches.map((p, i) => (
              <li
                key={p.handle}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5',
                  i === activeIndex ? 'bg-surface-2 text-ink-1' : 'text-ink-2',
                )}
              >
                <span>
                  <span className="font-medium text-ink-1">{p.name || p.handle}</span>
                  {p.name ? <span className="ml-1.5 font-mono text-ink-3">{p.handle}</span> : null}
                </span>
                {p.team ? <span className="shrink-0 text-ink-4">{p.team}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  )
}
