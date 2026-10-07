/** What the navigation's entries mean.
 *
 * The lifecycle strip (and, before it, the sidebar) is Studio's only navigation. Which screen each
 * entry opens, which entry is lit for which screen, which home a project opens on, and how a stage
 * describes itself are decided here, away from the component. The old layout put five tabs above
 * the content beside a list of phases; only one of those tabs depended on the phase picked, and
 * nothing on screen said so. Keeping the rules in one small, testable place is what stops that
 * ambiguity coming back.
 */

import { stageStateLabel } from './stageLabel'
import type { LaneId } from './types'

/** The screens Studio can show inside a project. `planning` and `steering` are the command
 * center's two lazy screens (togo-command-center.md §3.2, §3.5): planning is the sprint home's
 * planning board, steering the read-only committee view of the standard's numbers. */
export type Area = 'documents' | 'build' | 'sprint' | 'explain' | 'closing' | 'settings' | 'planning' | 'steering' | 'issues'

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

export type BuildView = 'board' | 'sprint' | 'planning' | 'issues' | 'going' | 'closing' | 'documents'

/** Build Loop's own screens — everything that used to be a top tab except the documents. The
 * sprint home leads (`sprint`, relabelled **Home**: the loop is the work — togo-command-center.md
 * §1), then its planning board, then the Board and the rest. The strip expands to this list. */
export const BUILD_VIEWS: { id: BuildView; label: string }[] = [
  { id: 'sprint', label: 'Home' },
  { id: 'planning', label: 'Planning' },
  { id: 'board', label: 'Board' },
  // Bugs in the product, from report to a bugfix spec (/sdlc-report-issue; plugin 1.8.0).
  { id: 'issues', label: 'Issues' },
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
    case 'planning': return { area: 'planning' }
    case 'issues': return { area: 'issues' }
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
    // Planning is the sprint home's screen; steering is the read-only view of "How it is going".
    case 'planning': return { stageId: BUILD_STAGE_ID, buildView: 'planning', footer: null }
    case 'issues': return { stageId: BUILD_STAGE_ID, buildView: 'issues', footer: null }
    case 'steering': return { stageId: BUILD_STAGE_ID, buildView: 'going', footer: null }
    case 'documents': {
      const stageId = viewedStageId ?? currentStageId
      return { stageId, buildView: stageId === BUILD_STAGE_ID ? 'documents' : null, footer: null }
    }
  }
}

// --- the two homes (togo-command-center.md §1) ---------------------------------------------

/** Where a project opens: the sprint home (the Build loop is the work) or the lifecycle home
 * (the stage's documents, decisions and sign-offs). Chosen ONCE per project open, never on a
 * timer; explicit switching is the strip, `g s` and `g l`. */
export type Home = 'sprint' | 'lifecycle'

/** The capability a plugin must declare for the sprint home to exist (`sprint.py status`). */
export const SPRINT_HOME_CAPABILITY = 'sprint-status'

/** The one pure choice: `'sprint'` iff the current phase is Build AND the installed plugin has
 * `sprint-status`; otherwise `'lifecycle'`. `sprintProbe` is accepted but does NOT decide — a
 * Build-loop project with no sprint yet (`has_data:false`) still lands on the sprint home, in its
 * empty state showing the plugin's own `note`. A plugin lacking the capability lands on the
 * lifecycle home and the Build station says so (`reasons.newerPlugin('sprint-status')`). */
export function homeFor(
  status: { current_phase: { id: string } } | null | undefined,
  sprintProbe: { hasData: boolean } | null | undefined,
  capabilities: readonly string[] | null | undefined,
): Home {
  void sprintProbe
  if (!status) return 'lifecycle'
  if (status.current_phase.id !== BUILD_STAGE_ID) return 'lifecycle'
  return (capabilities ?? []).includes(SPRINT_HOME_CAPABILITY) ? 'sprint' : 'lifecycle'
}

/** The nav target a home means. The lifecycle home is the current stage's documents screen. */
export function targetForHome(home: Home, currentStageId: string | null): NavTarget {
  return home === 'sprint' ? { area: 'sprint' } : { area: 'documents', stageId: currentStageId ?? undefined }
}

/** Why the sprint home is not available, or null when it is. One sentence, shown on the Build
 * station (the strip) — the plugin's capability list is the fact, this is only its wording. */
export function sprintHomeUnavailableReason(capabilities: readonly string[] | null | undefined): string | null {
  return (capabilities ?? []).includes(SPRINT_HOME_CAPABILITY) ? null : `sprint home arrives with a newer plugin: lacks ${SPRINT_HOME_CAPABILITY}`
}

// --- the four lanes (togo-command-center.md §3.1) ------------------------------------------

/** Lane order on the sprint home, left to right. The partition rule itself (which row sits in
 * which lane) is `components/lanes/laneModel.ts`; this is only the vocabulary. */
export const LANE_IDS: readonly LaneId[] = ['ready', 'building', 'checking', 'merged']

export const LANE_LABEL: Readonly<Record<LaneId, string>> = {
  ready: 'Ready',
  building: 'Building',
  checking: 'Checking',
  merged: 'Merged',
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
