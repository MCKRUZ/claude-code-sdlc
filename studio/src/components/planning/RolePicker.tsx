// A slot picker on the slate (togo-command-center.md §3.2, §5): Builder and Checker over the roster
// filtered by `roles`, written through `spec_transition.py assign` (`assignRoles`); disabled with
// the capability reason without `assign-roles`. The Security signer slot is ALWAYS disabled with
// `reasons.SECURITY_SIGNER` — no frontmatter field exists for it. The no-self-check rule is the
// plugin's (`handoff.SELF_CHECK_MESSAGE`, refusal kind `developer_is_checker`): the picker never
// refuses on its own — it shows a live note when the chosen checker is the builder and lets the
// plugin's refusal land verbatim (§5: no UI-only refusal, never a disabled button for a rule the
// plugin owns).
import type { RosterPerson } from '../../../shared/types'
import { samePerson } from '../../../shared/identity'
import { newerPlugin, NO_ROSTER, SECURITY_SIGNER, WAITING_FOR_PLUGIN_ANSWER } from '../../../shared/reasons'
import { cn, Select } from '../../ui'
import { withRole } from './planningModel'

export type SlotRole = 'developer' | 'checker' | 'security'

export const SLOT_LABEL: Record<SlotRole, string> = { developer: 'Builder', checker: 'Checker', security: 'Security signer' }

/** The sentence beside a checker who is also the builder — the plugin's rule, named. */
export const SELF_CHECK_NOTE = 'same person as the builder — the plugin refuses a self-check (developer_is_checker)'

export const NOBODY = ''

/** The compact select on a slate row fills its slot (`COMPACT_SLOT_CLASS`: the two slots share
 * their line as `flex-1` over a 0 basis — `minmax(0,1fr)` each — so a long roster name can never
 * take the name's track), never under 10 rem, and ELLIPSISES its value: v14 at 1440 the fixed
 * 11 rem cut "Sam Kowalski (@sam-k" with no cue. The full text rides the select's `title`; the
 * option list still reads it whole. `SlateColumn` pins the slot to 11 rem once the pickers join
 * the name's line, through the slot's `className`. */
export const COMPACT_SELECT_CLASS = 'w-full min-w-[10rem] truncate'
export const COMPACT_SLOT_CLASS = 'min-w-0 flex-1 basis-0'

/** The empty option's words: an INVITATION on a slot a person fills ("choose a builder"), and on
 * the Security signer — a slot no frontmatter field backs — the fact that there is no field,
 * so the word "nobody" never reads as a recorded value. */
export const PLACEHOLDER: Record<SlotRole, string> = { developer: 'choose a builder', checker: 'choose a checker', security: 'no signer field yet' }

export interface RolePickerProps {
  role: SlotRole
  spec: string
  value: string
  people: readonly RosterPerson[]
  /** The row's current `developer`, for the live self-check note on the Checker slot. */
  developer?: string
  /** Whether the installed plugin declares `assign-roles`. Undefined = not yet known: drawn live. */
  canAssign?: boolean
  busy?: boolean
  /** On a slate row: the label rides as the select's accessible name only, the slot shares its
   * line (`COMPACT_SLOT_CLASS`) and the select fills it and ellipsises (`COMPACT_SELECT_CLASS`)
   * so the slate's name track keeps its floor — a natural-width "Sam Kowalski (@sam-k)" select
   * grew to ≈ 190 px and took it (v13); a fixed 11 rem then clipped it with no cue (v14). */
  compact?: boolean
  /** Classes for the slot (the wrapper), e.g. the slate's fixed width once the pickers go inline. */
  className?: string
  onChange: (handle: string) => void
}

export function RolePicker({ role, spec, value, people, developer, canAssign, busy = false, compact = false, className, onChange }: RolePickerProps) {
  const id = `role-${role}-${spec}`
  if (role === 'security') {
    return (
      <div className="flex flex-col gap-0.5" data-slot={role}>
        <label htmlFor={id} className="text-[11px] text-ink-3">{SLOT_LABEL.security}</label>
        <Select id={id} size="sm" value={NOBODY} onChange={() => {}} disabled disabledReason={SECURITY_SIGNER} options={[{ value: NOBODY, label: PLACEHOLDER.security }]} aria-label={`${SLOT_LABEL.security} for ${spec}`} />
        <p className="text-[11px] text-ink-3" data-slot-reason="">{SECURITY_SIGNER}</p>
      </div>
    )
  }
  const candidates = withRole(people, role)
  // With no roster there is nobody to pick: disabled with `NO_ROSTER` rather than an enabled
  // picker holding only its placeholder (§2.7: a disabled control always carries its reason).
  const reason = canAssign === false ? newerPlugin('assign-roles') : busy ? WAITING_FOR_PLUGIN_ANSWER : people.length === 0 ? NO_ROSTER : undefined
  const selfCheck = role === 'checker' && value !== NOBODY && samePerson(value, developer)
  const options = [{ value: NOBODY, label: PLACEHOLDER[role] }, ...candidates.map((p) => ({ value: p.handle, label: p.name ? `${p.name} (${p.handle})` : p.handle }))]
  // A handle on the row that the roster filter does not list (a person who lost the role) stays
  // selectable as itself so the row reads what the spec says, never a blank.
  if (value !== NOBODY && !options.some((o) => o.value === value)) options.push({ value, label: value })
  // The value's full text, for the pointer: an ellipsised "Sam Kowalski (@sam-k…" reads whole on
  // hover. A DISABLED select's title is its reason (`disabledReasonProps`), never overridden here
  // — so the key is absent, not `undefined`, when there is a reason (a spread `title: undefined`
  // would still win over the reason's).
  const shown = options.find((o) => o.value === value)?.label
  const titled = reason ? {} : { title: shown }
  return (
    <div className={cn('flex flex-col gap-0.5', compact && COMPACT_SLOT_CLASS, className)} data-slot={role}>
      <label htmlFor={id} className={compact ? 'sr-only' : 'text-[11px] text-ink-3'}>{SLOT_LABEL[role]}</label>
      <Select
        id={id}
        size="sm"
        value={value}
        onChange={onChange}
        disabled={Boolean(reason)}
        disabledReason={reason}
        options={options}
        data-write=""
        className={compact ? COMPACT_SELECT_CLASS : undefined}
        {...titled}
        aria-label={`${SLOT_LABEL[role]} for ${spec}`}
      />
      {selfCheck && <p className={compact ? 'max-w-[14rem] text-[11px] text-status-warn-ink' : 'text-[11px] text-status-warn-ink'} data-self-check="">{SELF_CHECK_NOTE}</p>}
    </div>
  )
}
