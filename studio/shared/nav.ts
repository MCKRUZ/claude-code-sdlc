/** What the sidebar's entries mean.
 *
 * The sidebar is Studio's only navigation. Which screen each entry opens, which entry is lit for
 * which screen, and how a stage describes itself are decided here, away from the component. The
 * old layout put five tabs above the content beside a list of phases; only one of those tabs
 * depended on the phase picked, and nothing on screen said so. Keeping the rules in one small,
 * testable place is what stops that ambiguity coming back.
 */

import { stageStateLabel } from './stageLabel'

/** The screens Studio can show inside a project. */
export type Area = 'documents' | 'build' | 'sprint' | 'explain' | 'closing' | 'settings'

/** Where an entry takes you: an area, and for documents, which stage's. */
export interface NavTarget {
  area: Area
  stageId?: string
}

/** The one stage that has screens of its own beyond its documents. */
export const BUILD_STAGE_ID = 'build'

// --- grouping -----------------------------------------------------------------------------

const GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Foundation', ids: ['0', '1', '2', '3'] },
  { label: 'Build', ids: [BUILD_STAGE_ID] },
  { label: 'Ship', ids: ['7', '8', '9'] },
  { label: 'Close', ids: ['close'] },
]

/** The stages arranged as the journey they are. A stage the groups do not know — a phase added to
 * the registry later — goes in a trailing "Other" group rather than vanishing from the list. */
export function groupStages<T extends { id: string }>(stages: T[]): { label: string; stages: T[] }[] {
  const known = new Set(GROUPS.flatMap((g) => g.ids))
  const groups = GROUPS.map((g) => ({ label: g.label, stages: stages.filter((s) => g.ids.includes(s.id)) }))
  const other = stages.filter((s) => !known.has(s.id))
  if (other.length > 0) groups.push({ label: 'Other', stages: other })
  return groups.filter((g) => g.stages.length > 0)
}

// --- where entries lead -------------------------------------------------------------------

export type BuildView = 'board' | 'sprint' | 'going' | 'closing' | 'documents'

/** Build Loop's own screens — everything that used to be a top tab except the documents. */
export const BUILD_VIEWS: { id: BuildView; label: string }[] = [
  { id: 'board', label: 'Board' },
  // The sprint the team runs, beside the board it runs it on (proposal studio-improvements, D2).
  { id: 'sprint', label: 'Sprint' },
  { id: 'going', label: 'How it is going' },
  { id: 'closing', label: 'Closing' },
  { id: 'documents', label: 'Documents' },
]

export function targetForStage(stageId: string): NavTarget {
  return stageId === BUILD_STAGE_ID ? { area: 'build' } : { area: 'documents', stageId }
}

export function targetForBuildView(view: BuildView): NavTarget {
  switch (view) {
    case 'board': return { area: 'build' }
    case 'sprint': return { area: 'sprint' }
    case 'going': return { area: 'explain' }
    case 'closing': return { area: 'closing' }
    case 'documents': return { area: 'documents', stageId: BUILD_STAGE_ID }
  }
}

// --- which entry is lit -------------------------------------------------------------------

export interface ActiveNav {
  stageId: string | null
  buildView: BuildView | null
  footer: 'settings' | null
}

/** The entry to light for the screen showing. On Settings no stage is being viewed, so none is lit
 * — a lit stage above a screen that is not about it reads as "this is that stage's content". */
export function activeNav(area: Area, viewedStageId: string | undefined, currentStageId: string | null): ActiveNav {
  switch (area) {
    case 'settings': return { stageId: null, buildView: null, footer: 'settings' }
    case 'build': return { stageId: BUILD_STAGE_ID, buildView: 'board', footer: null }
    case 'sprint': return { stageId: BUILD_STAGE_ID, buildView: 'sprint', footer: null }
    case 'explain': return { stageId: BUILD_STAGE_ID, buildView: 'going', footer: null }
    case 'closing': return { stageId: BUILD_STAGE_ID, buildView: 'closing', footer: null }
    case 'documents': {
      const stageId = viewedStageId ?? currentStageId
      return { stageId, buildView: stageId === BUILD_STAGE_ID ? 'documents' : null, footer: null }
    }
  }
}

// --- how a stage describes itself ---------------------------------------------------------

interface StageLike {
  id?: string
  stage_state: 'current' | 'signed_off' | 'later'
  signed_off_by: string | null
}

export type NodeKind = 'signed' | 'completed' | 'current' | 'later'

const hasName = (s: StageLike) => !!s.signed_off_by && s.signed_off_by.trim() !== ''

/** A solid tick means a named person signed; an outlined one means completed with nobody recorded.
 * The two are different facts and should not look alike. */
export function nodeKind(stage: StageLike): NodeKind {
  if (stage.stage_state === 'signed_off') return hasName(stage) ? 'signed' : 'completed'
  return stage.stage_state === 'current' ? 'current' : 'later'
}

export interface DocProgress {
  complete: number
  total: number
}

/** The line under a stage's name. */
export function stageMeta(stage: StageLike, docs?: DocProgress | null): string {
  if (stage.stage_state === 'signed_off') {
    return `${stageStateLabel(stage)} · ${hasName(stage) ? stage.signed_off_by!.trim() : 'no name recorded'}`
  }
  if (stage.stage_state === 'current') {
    return docs ? `${docs.complete} of ${docs.total} documents complete` : 'In progress'
  }
  // Specs are built before the plugin marks Build as reached, so "Not started" would be false
  // for a project that is already building. Say what the stage holds instead.
  if (stage.id === BUILD_STAGE_ID) return 'Specs, checks and close-out'
  return 'Not started'
}
