import { inTheRoom } from '../shared/briefLimits'
import type { BriefCandidatesResult, BriefQuestion, BriefSelections } from '../shared/types'
import type { BriefFormState } from './briefFormStore'

export type BriefCandidates = Extract<BriefCandidatesResult, { ok: true }>

export const MAX_TEXT = 500

export const isWorkshopQuestion = (q: BriefQuestion) => inTheRoom(q.route)

const present = <T extends { id: string }>(shown: T[], ticked: string[]) => shown.filter((item) => ticked.includes(item.id))

/** The ticked ids in the order the candidates are shown. A stored id the plugin no longer lists
 * is dropped here, so a stale tick can never reach the build. */
export function tickedContradictions(form: BriefFormState, c: BriefCandidates): string[] {
  return present(c.contradictions, form.contradictions).map((x) => x.id)
}

export function tickedQuestions(form: BriefFormState, c: BriefCandidates): string[] {
  return present(c.questions.filter(isWorkshopQuestion), form.questions).map((x) => x.id)
}

export function tickedDocuments(form: BriefFormState, c: BriefCandidates): string[] {
  return present(c.documents, form.loadBearing).map((x) => x.id)
}

/** Decisions the page would carry: the template's standing ones plus those added here. */
export const decisionsOnPage = (form: BriefFormState, c: BriefCandidates) => c.standingDecisions + form.decisions.length

export function buildSelections(form: BriefFormState, c: BriefCandidates): BriefSelections {
  return {
    contradictions: tickedContradictions(form, c),
    questions: tickedQuestions(form, c),
    loadBearing: tickedDocuments(form, c),
    claims: form.claims.map((claim) => ({ text: claim.text.trim(), docRef: claim.docRef })),
    decisions: form.decisions.map((d) => d.trim()),
    logistics: {
      clientName: form.clientName.trim(),
      dateTimeLocation: form.dateTimeLocation.trim(),
      duration: form.duration.trim(),
      facilitator: form.facilitator.trim(),
      attendees: form.attendees
        .map((a) => ({ name: a.name.trim(), role: a.role.trim() }))
        .filter((a) => a.name !== '' || a.role !== ''),
    },
    replaceExisting: c.existingBrief && form.replaceExisting,
  }
}

const noun = (n: number, one: string, many: string) => (n === 1 ? one : many)

function documentsIssue(count: number, [min, max]: [number, number]): string | null {
  if (count < min) return `Choose at least ${min} load-bearing documents`
  if (count > max) return `Choose at most ${max} load-bearing documents`
  return null
}

/** What the page's decision range still asks of the person, counting the standing decisions. */
export function decisionsIssue(onPage: number, [min, max]: [number, number]): string | null {
  if (onPage < min) {
    const missing = min - onPage
    return `Add at least ${missing} more ${noun(missing, 'decision', 'decisions')}`
  }
  if (onPage > max) return `The page takes at most ${max} decisions`
  return null
}

function logisticsIssue({ logistics }: BriefSelections): string | null {
  if (logistics.clientName === '') return 'Client name is required'
  if (logistics.dateTimeLocation === '') return 'Date, time and location is required'
  if (logistics.duration === '') return 'Duration is required'
  if (logistics.facilitator === '') return 'Facilitator is required'
  const { attendees } = logistics
  if (attendees.length === 0 || attendees.some((a) => a.name === '' || a.role === '')) {
    return 'Add at least one attendee with a name and a role'
  }
  return null
}

/** The first thing standing between the form and a build, or null when the main process would accept
 * it. These mirror the rules it enforces; it checks them again and is the authority. */
export function buildIssue(form: BriefFormState, c: BriefCandidates): string | null {
  const selections = buildSelections(form, c)
  return documentsIssue(selections.loadBearing.length, c.limits.loadBearing)
    ?? decisionsIssue(decisionsOnPage(form, c), c.limits.decisions)
    ?? logisticsIssue(selections)
    ?? (c.existingBrief && !form.replaceExisting ? 'Tick "Replace the existing brief" to build' : null)
}
