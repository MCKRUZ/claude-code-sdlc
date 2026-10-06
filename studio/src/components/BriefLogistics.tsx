import { useState } from 'react'
import { MAX_ATTENDEES, MAX_LOGISTICS_TEXT } from '../../shared/briefLimits'
import type { BriefAttendee, RosterPerson } from '../../shared/types'
import type { BriefFormState } from '../briefFormStore'
import { Select } from '../ui'
import { PanelSecondaryButton } from './activityPanelBits'
import { BriefInput, Section } from './briefBits'

interface LogisticsProps {
  form: BriefFormState
  roster: RosterPerson[]
  onChange: (patch: Partial<BriefFormState>) => void
}

const FIELDS: Array<{ label: string; key: 'clientName' | 'dateTimeLocation' | 'duration' }> = [
  { label: 'Client name', key: 'clientName' },
  { label: 'Date, time and location', key: 'dateTimeLocation' },
  { label: 'Duration', key: 'duration' },
]

export function LogisticsSection({ form, roster, onChange }: LogisticsProps) {
  return (
    <Section title="Logistics">
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map(({ label, key }) => (
          <Field key={key} label={label} value={form[key]} onChange={(value) => onChange({ [key]: value })} />
        ))}
        <Field label="Facilitator" value={form.facilitator} onChange={(value) => onChange({ facilitator: value, facilitatorEdited: true })} />
      </div>
      <Attendees attendees={form.attendees} roster={roster} onChange={(attendees) => onChange({ attendees })} />
    </Section>
  )
}

// The `aria-label` is the accessible name the brief tests address each box by, so the visible
// label stays a plain span rather than the kit's Field (which would tie a second name to it).
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1 text-xs text-ink-2">
      <span>{label}</span>
      <BriefInput aria-label={label} maxLength={MAX_LOGISTICS_TEXT} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

const isBlank = (a: BriefAttendee) => a.name.trim() === '' && a.role.trim() === ''

interface AttendeesProps {
  attendees: BriefAttendee[]
  roster: RosterPerson[]
  onChange: (attendees: BriefAttendee[]) => void
}

function Attendees({ attendees, roster, onChange }: AttendeesProps) {
  const edit = (index: number, patch: Partial<BriefAttendee>) =>
    onChange(attendees.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-ink-2">Attendees</p>
      {attendees.map((a, i) => (
        <div key={i} data-testid="brief-attendee" className="flex items-center gap-2">
          <BriefInput aria-label={`Attendee ${i + 1} name`} maxLength={MAX_LOGISTICS_TEXT} value={a.name} onChange={(e) => edit(i, { name: e.target.value })} />
          <BriefInput aria-label={`Attendee ${i + 1} role`} maxLength={MAX_LOGISTICS_TEXT} value={a.role} onChange={(e) => edit(i, { role: e.target.value })} />
          <PanelSecondaryButton aria-label={`Remove attendee ${i + 1}`} onClick={() => onChange(attendees.filter((_, j) => j !== i))}>
            Remove
          </PanelSecondaryButton>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <PanelSecondaryButton disabled={attendees.length >= MAX_ATTENDEES} onClick={() => onChange([...attendees, { name: '', role: '' }])}>
          Add attendee
        </PanelSecondaryButton>
        {roster.length > 0 && <RosterShortcut roster={roster} onAdd={(name) => onChange(withAttendee(attendees, name).slice(0, MAX_ATTENDEES))} />}
      </div>
      {attendees.length >= MAX_ATTENDEES && <p className="text-xs text-ink-3">A brief takes up to {MAX_ATTENDEES} attendees.</p>}
    </div>
  )
}

/** A roster person fills the first untouched row rather than leaving an empty one above them. */
function withAttendee(attendees: BriefAttendee[], name: string): BriefAttendee[] {
  const added = { name, role: '' }
  const blank = attendees.findIndex(isBlank)
  return blank === -1 ? [...attendees, added] : attendees.map((a, i) => (i === blank ? added : a))
}

// Attendees are mostly the client's people, so the roster is a shortcut beside free text — not the
// kit's `roster` option shape, which would print "(@handle)" after every name.
function RosterShortcut({ roster, onAdd }: { roster: RosterPerson[]; onAdd: (name: string) => void }) {
  const [handle, setHandle] = useState('')
  const person = roster.find((p) => p.handle === handle)
  return (
    <>
      <Select
        size="sm"
        aria-label="Team member to add"
        value={handle}
        onChange={setHandle}
        className="w-auto"
        options={[
          { value: '', label: 'Choose a team member' },
          ...roster.map((p) => ({ value: p.handle, label: p.name || p.handle })),
        ]}
      />
      <PanelSecondaryButton
        disabled={!person}
        onClick={() => { if (person) { onAdd(person.name || person.handle); setHandle('') } }}
      >
        Add a team member
      </PanelSecondaryButton>
    </>
  )
}
