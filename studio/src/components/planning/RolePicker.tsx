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
import { newerPlugin, SECURITY_SIGNER } from '../../../shared/reasons'
import { Select } from '../../ui'
import { withRole } from './planningModel'

export type SlotRole = 'developer' | 'checker' | 'security'

export const SLOT_LABEL: Record<SlotRole, string> = { developer: 'Builder', checker: 'Checker', security: 'Security signer' }

/** The sentence beside a checker who is also the builder — the plugin's rule, named. */
export const SELF_CHECK_NOTE = 'same person as the builder — the plugin refuses a self-check (developer_is_checker)'

export const NOBODY = ''

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
  /** On a one-line slate row: the label rides as the select's accessible name only. */
  compact?: boolean
  onChange: (handle: string) => void
}

export function RolePicker({ role, spec, value, people, developer, canAssign, busy = false, compact = false, onChange }: RolePickerProps) {
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
  const reason = canAssign === false ? newerPlugin('assign-roles') : busy ? 'Waiting for the plugin to answer.' : undefined
  const selfCheck = role === 'checker' && value !== NOBODY && samePerson(value, developer)
  const options = [{ value: NOBODY, label: PLACEHOLDER[role] }, ...candidates.map((p) => ({ value: p.handle, label: p.name ? `${p.name} (${p.handle})` : p.handle }))]
  // A handle on the row that the roster filter does not list (a person who lost the role) stays
  // selectable as itself so the row reads what the spec says, never a blank.
  if (value !== NOBODY && !options.some((o) => o.value === value)) options.push({ value, label: value })
  return (
    <div className="flex flex-col gap-0.5" data-slot={role}>
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
        aria-label={`${SLOT_LABEL[role]} for ${spec}`}
      />
      {selfCheck && <p className={compact ? 'max-w-[14rem] text-[11px] text-status-warn-ink' : 'text-[11px] text-status-warn-ink'} data-self-check="">{SELF_CHECK_NOTE}</p>}
    </div>
  )
}
