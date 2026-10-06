// The TopBand's `…` menu (togo-command-center.md §1 "Where the rest lives"): the project-wide
// things that are not a place in the project — the chat toggle, the shortcuts help, steering
// mode, New project / Open folder. A real `role="menu"` (arrow keys rove, Home/End jump, Escape
// closes and returns focus to the trigger, a click outside closes); every row is a `<button>`,
// so the shell still holds no `<input>`. Rows are present only when the host passed their
// callback — a row that cannot be honoured is absent, never inert. Settings, Appearance and
// Console sit in the band itself as visible controls (the a11y pins read them there).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Ellipsis, FolderOpen, Keyboard, MessageSquare, Plus, Presentation, type LucideIcon } from 'lucide-react'
import { Icon, Kbd, cn } from '../ui'
import { kbdKeys } from '../shortcuts/shortcutMap'

export interface OverflowActions {
  toggleChat?: () => void
  openShortcuts?: () => void
  /** Steering mode (Area `steering`, `g t`). */
  steering?: () => void
  newProject?: () => void
  openFolder?: () => void
}

interface Row {
  id: string
  label: string
  icon: LucideIcon
  /** Shortcut steps as the map spells them ('Mod+\\', or a `g` sequence). */
  keys?: string[]
  run: () => void
}

export const OVERFLOW_LABEL = 'More'

export function overflowRows(actions: OverflowActions): Row[] {
  const rows: Row[] = []
  if (actions.toggleChat) rows.push({ id: 'chat', label: 'Chat', icon: MessageSquare, keys: ['Mod+\\'], run: actions.toggleChat })
  if (actions.openShortcuts) rows.push({ id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, keys: ['?'], run: actions.openShortcuts })
  if (actions.steering) rows.push({ id: 'steering', label: 'Steering mode', icon: Presentation, keys: ['g', 't'], run: actions.steering })
  if (actions.newProject) rows.push({ id: 'new-project', label: 'New project…', icon: Plus, run: actions.newProject })
  if (actions.openFolder) rows.push({ id: 'open-folder', label: 'Open folder…', icon: FolderOpen, run: actions.openFolder })
  return rows
}

export function OverflowMenu({ actions, className }: { actions: OverflowActions; className?: string }) {
  const rows = overflowRows(actions)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  // Click outside closes; the trigger itself toggles.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = rows.length
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((i) => (i + 1) % n); break
      case 'ArrowUp': e.preventDefault(); setActive((i) => (i - 1 + n) % n); break
      case 'Home': e.preventDefault(); setActive(0); break
      case 'End': e.preventDefault(); setActive(n - 1); break
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break
      case 'Tab': close(false); break
      default: return
    }
  }

  if (rows.length === 0) return null
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={OVERFLOW_LABEL}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => { setActive(0); setOpen((v) => !v) }}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1',
          open && 'bg-surface-2 text-ink-1',
        )}
      >
        <Icon icon={Ellipsis} size={18} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={OVERFLOW_LABEL}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 min-w-[15rem] rounded-[14px] bg-surface-raised p-1.5 shadow-3 ring-1 ring-line-1"
        >
          {rows.map((row, i) => (
            <button
              key={row.id}
              ref={(el) => { itemRefs.current[i] = el }}
              type="button"
              role="menuitem"
              data-pressable=""
              tabIndex={i === active ? 0 : -1}
              onMouseEnter={() => setActive(i)}
              onClick={() => { close(); row.run() }}
              className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-[7px] text-left text-sm text-ink-1 hover:bg-surface-2 focus:bg-surface-2"
            >
              <Icon icon={row.icon} size={16} className="text-ink-3" />
              <span className="flex-1">{row.label}</span>
              {row.keys ? (
                <span className="inline-flex items-center gap-1">
                  {row.keys.map((step, j) => (
                    <span key={`${step}-${j}`} className="inline-flex items-center gap-1">
                      {j > 0 && row.keys!.length === 2 && step.length === 1 ? <span className="text-2xs text-ink-4">then</span> : null}
                      <Kbd keys={kbdKeys(step)} />
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
