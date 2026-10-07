// The TopBand's `…` menu (togo-command-center.md §1 "Where the rest lives"): the project-wide
// things that are not a place in the project — the chat toggle, the shortcuts help, steering
// mode, New project / Open folder. Round 3 (Q3): `@radix-ui/react-dropdown-menu` sits under it —
// Radix owns the real `role="menu"` (arrow keys rove, Home/End jump, typeahead, Escape closes and
// returns focus to the trigger, a pointer down outside closes, Tab stays inside), portals the
// menu to `#overlays` and places it with its popper, so it can never be clipped by the band or
// overlap the strip. Every row is still a `<button>`, so the shell holds no `<input>`. Rows are
// present only when the host passed their callback — a row that cannot be honoured is absent,
// never inert. Settings, Appearance and Console sit in the band itself as visible controls.
import { useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bug, Ellipsis, FolderOpen, Keyboard, MessageSquare, Plus, Presentation, type LucideIcon } from 'lucide-react'
import { Icon, Kbd, cn, overlayRoot } from '../ui'
import { kbdKeys } from '../shortcuts/shortcutMap'

export interface OverflowActions {
  toggleChat?: () => void
  openShortcuts?: () => void
  /** Steering mode (Area `steering`, `g t`). */
  steering?: () => void
  /** Report an issue (/sdlc-report-issue): captures the window, then opens the dialog. */
  reportIssue?: () => void
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
  if (actions.reportIssue) rows.push({ id: 'report-issue', label: 'Report an issue…', icon: Bug, run: actions.reportIssue })
  if (actions.newProject) rows.push({ id: 'new-project', label: 'New project…', icon: Plus, run: actions.newProject })
  if (actions.openFolder) rows.push({ id: 'open-folder', label: 'Open folder…', icon: FolderOpen, run: actions.openFolder })
  return rows
}

export function OverflowMenu({ actions, className }: { actions: OverflowActions; className?: string }) {
  const rows = overflowRows(actions)
  const [open, setOpen] = useState(false)
  const pointerDown = useRef(false)

  if (rows.length === 0) return null
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={OVERFLOW_LABEL}
          onPointerDown={() => {
            pointerDown.current = true
          }}
          // Radix opens on pointer down. A click no pointer down preceded (a synthetic click, some
          // assistive tech) toggles here, so the control is never a dead button.
          onClick={() => {
            if (!pointerDown.current) setOpen((v) => !v)
            pointerDown.current = false
          }}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1',
            open && 'bg-surface-2 text-ink-1',
            className,
          )}
        >
          <Icon icon={Ellipsis} size={18} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={overlayRoot() ?? undefined}>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          loop
          aria-label={OVERFLOW_LABEL}
          className="z-30 min-w-[15rem] rounded-[14px] bg-surface-raised p-1.5 shadow-3 ring-1 ring-line-1 outline-none"
        >
          {rows.map((row) => (
            <DropdownMenu.Item asChild key={row.id} onSelect={() => row.run()}>
              <button
                type="button"
                data-pressable=""
                className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-[7px] text-left text-sm text-ink-1 outline-none hover:bg-surface-2 focus:bg-surface-2 data-[highlighted]:bg-surface-2"
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
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
