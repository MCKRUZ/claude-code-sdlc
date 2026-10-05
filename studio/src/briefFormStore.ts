import type { BriefAttendee, BriefCandidatesResult, BriefClaim } from '../shared/types'

type Candidates = Extract<BriefCandidatesResult, { ok: true }>

/** Everything a person types into the workshop-brief form (spec 0032), as plain data. The ticked
 * lists hold ids; the order a build sends is the order the candidates are shown in, not the order
 * of ticking, so nothing here needs to remember it. */
export interface BriefFormState {
  contradictions: string[]
  questions: string[]
  loadBearing: string[]
  claims: BriefClaim[]
  /** The claim being typed, not yet added. */
  claimDraft: BriefClaim
  decisions: string[]
  decisionDraft: string
  clientName: string
  dateTimeLocation: string
  duration: string
  facilitator: string
  /** True once the person typed in the facilitator field; the signed-in name never overwrites it. */
  facilitatorEdited: boolean
  attendees: BriefAttendee[]
  replaceExisting: boolean
}

export const BLANK_ATTENDEE: BriefAttendee = { name: '', role: '' }

/** The form for a project nobody has opened yet: the command's recommended contradictions ticked
 * (up to the page's limit), everything else empty. */
export function initialBriefForm(candidates: Candidates, actor: string): BriefFormState {
  const recommended = candidates.contradictions.filter((c) => c.recommended).map((c) => c.id)
  return {
    contradictions: recommended.slice(0, candidates.limits.contradictions),
    questions: [],
    loadBearing: [],
    claims: [],
    claimDraft: { text: '', docRef: '' },
    decisions: [],
    decisionDraft: '',
    clientName: '',
    dateTimeLocation: '',
    duration: '',
    facilitator: actor,
    facilitatorEdited: false,
    attendees: [BLANK_ATTENDEE],
    replaceExisting: false,
  }
}

// Module-level on purpose: switching tabs unmounts the form, and a half-written brief must outlive
// that. It is never written to disk and dies with the window.
const forms = new Map<string, BriefFormState>()

export const loadBriefForm = (projectPath: string): BriefFormState | undefined => forms.get(projectPath)

export function saveBriefForm(projectPath: string, form: BriefFormState): void {
  forms.set(projectPath, form)
}

export function clearBriefForm(projectPath: string): void {
  forms.delete(projectPath)
}

export function clearAllBriefForms(): void {
  forms.clear()
}
