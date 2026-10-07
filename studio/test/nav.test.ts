/** The sidebar is Studio's only navigation. What each entry means — which screen it opens, which
 * entry is lit for which screen, how a stage describes itself — is decided here, away from the
 * component, because it was the ambiguity in exactly these rules (top tabs that looked as if they
 * belonged to the selected phase) that made the old layout confusing.
 */

import { describe, expect, it } from 'vitest'
import {
  activeNav, BUILD_VIEWS, groupStages, homeFor, LANE_IDS, LANE_LABEL, nodeKind, SPRINT_HOME_CAPABILITY,
  sprintHomeUnavailableReason, stageMeta, targetForBuildView, targetForHome, targetForStage,
} from '../shared/nav'

const stage = (id: string, state: 'current' | 'signed_off' | 'later', signed_off_by: string | null = null) => ({
  id, display: `Stage ${id}`, stage_state: state, signed_off_by,
})

const ALL = ['0', '1', '2', '3', 'build', '7', '8', '9', 'close'].map((id) => stage(id, 'later'))

describe('groupStages', () => {
  it('groups the journey as Foundation, Build, Ship, Close, in that order', () => {
    const groups = groupStages(ALL)
    expect(groups.map((g) => g.label)).toEqual(['Foundation', 'Build', 'Ship', 'Close'])
    expect(groups.map((g) => g.stages.map((s) => s.id))).toEqual([['0', '1', '2', '3'], ['build'], ['7', '8', '9'], ['close']])
  })

  it('keeps the registry order inside a group, whatever order the ids were declared in', () => {
    const groups = groupStages([stage('3', 'later'), stage('0', 'later'), stage('2', 'later'), stage('1', 'later')])
    expect(groups[0].stages.map((s) => s.id)).toEqual(['3', '0', '2', '1'])
  })

  it('omits a group that has no stages', () => {
    expect(groupStages([stage('0', 'later')]).map((g) => g.label)).toEqual(['Foundation'])
  })

  it('never drops a stage it does not know: a future phase lands in a final group', () => {
    const groups = groupStages([...ALL, stage('10', 'later')])
    const last = groups[groups.length - 1]
    expect(last.label).toBe('Other')
    expect(last.stages.map((s) => s.id)).toEqual(['10'])
    expect(groups.flatMap((g) => g.stages)).toHaveLength(ALL.length + 1)
  })
})

describe('what an entry opens', () => {
  it('a stage opens that stage’s documents', () => {
    expect(targetForStage('2')).toEqual({ area: 'documents', stageId: '2' })
  })

  it('Build Loop opens its board', () => {
    expect(targetForStage('build')).toEqual({ area: 'build' })
  })

  it('each Build Loop view opens its own screen', () => {
    expect(targetForBuildView('board')).toEqual({ area: 'build' })
    expect(targetForBuildView('sprint')).toEqual({ area: 'sprint' })
    expect(targetForBuildView('planning')).toEqual({ area: 'planning' })
    expect(targetForBuildView('going')).toEqual({ area: 'explain' })
    expect(targetForBuildView('closing')).toEqual({ area: 'closing' })
    expect(targetForBuildView('documents')).toEqual({ area: 'documents', stageId: 'build' })
  })

  it('offers the Build Loop views with the sprint home first, relabelled Home, and its Planning beside it (command center §1, §3.2)', () => {
    expect(BUILD_VIEWS.map((v) => v.id)).toEqual(['sprint', 'planning', 'board', 'going', 'closing', 'documents'])
    expect(BUILD_VIEWS.find((v) => v.id === 'sprint')?.label).toBe('Home')
    expect(BUILD_VIEWS.find((v) => v.id === 'planning')?.label).toBe('Planning')
    expect(BUILD_VIEWS.map((v) => v.label)).not.toContain('Sprint')
  })
})

describe('homeFor — the one pure choice (command center §1)', () => {
  const build = { current_phase: { id: 'build' } }
  const phase1 = { current_phase: { id: '1' } }
  const caps = ['sprint-status', 'sprint-plan']

  it.each([
    ['Build + sprint-status + a sprint', build, { hasData: true }, caps, 'sprint'],
    ['Build + sprint-status, no sprint yet (empty state, the plugin\'s note)', build, { hasData: false }, caps, 'sprint'],
    ['Build + sprint-status, probe unavailable', build, null, caps, 'sprint'],
    ['Build without sprint-status', build, { hasData: true }, ['sprint-plan'], 'lifecycle'],
    ['Build with no capability list', build, { hasData: true }, null, 'lifecycle'],
    ['Phase 1 with sprint-status', phase1, { hasData: true }, caps, 'lifecycle'],
    ['Phase 1 without', phase1, null, [], 'lifecycle'],
    ['no status at all', null, null, caps, 'lifecycle'],
  ] as const)('%s → %s', (_name, status, probe, capabilities, expected) => {
    expect(homeFor(status, probe, capabilities)).toBe(expected)
  })

  it('names the capability it reads and the sentence the Build station shows without it', () => {
    expect(SPRINT_HOME_CAPABILITY).toBe('sprint-status')
    expect(sprintHomeUnavailableReason(['sprint-status'])).toBeNull()
    expect(sprintHomeUnavailableReason([])).toBe('sprint home arrives with a newer plugin: lacks sprint-status')
    expect(sprintHomeUnavailableReason(null)).toBe('sprint home arrives with a newer plugin: lacks sprint-status')
  })

  it('a home is a nav target: the sprint area, or the current stage\'s documents', () => {
    expect(targetForHome('sprint', '3')).toEqual({ area: 'sprint' })
    expect(targetForHome('lifecycle', '3')).toEqual({ area: 'documents', stageId: '3' })
    expect(targetForHome('lifecycle', null)).toEqual({ area: 'documents', stageId: undefined })
  })
})

describe('the four lanes', () => {
  it('are a fixed vocabulary in loop order, labelled as the brief names them', () => {
    expect([...LANE_IDS]).toEqual(['ready', 'building', 'checking', 'merged'])
    expect(LANE_IDS.map((id) => LANE_LABEL[id])).toEqual(['Ready', 'Building', 'Checking', 'Merged'])
  })
})

describe('which entry is lit', () => {
  it('lights the stage whose documents are showing', () => {
    expect(activeNav('documents', '2', '3')).toEqual({ stageId: '2', buildView: null, footer: null })
  })

  it('defaults to the current stage when none was picked', () => {
    expect(activeNav('documents', undefined, '3')).toEqual({ stageId: '3', buildView: null, footer: null })
  })

  it('lights Build Loop and the right view for each Build screen', () => {
    expect(activeNav('build', undefined, '3')).toEqual({ stageId: 'build', buildView: 'board', footer: null })
    expect(activeNav('sprint', undefined, '3')).toEqual({ stageId: 'build', buildView: 'sprint', footer: null })
    expect(activeNav('explain', undefined, '3')).toEqual({ stageId: 'build', buildView: 'going', footer: null })
    expect(activeNav('closing', undefined, '3')).toEqual({ stageId: 'build', buildView: 'closing', footer: null })
  })

  it('lights Home for planning (its screen) and How it is going for steering (its read-only view)', () => {
    expect(activeNav('planning', undefined, '3')).toEqual({ stageId: 'build', buildView: 'planning', footer: null })
    expect(activeNav('steering', undefined, '3')).toEqual({ stageId: 'build', buildView: 'going', footer: null })
  })

  it('lights Build Loop’s Documents view when its documents are showing', () => {
    expect(activeNav('documents', 'build', '3')).toEqual({ stageId: 'build', buildView: 'documents', footer: null })
  })

  it('lights only Settings on the settings screen — no stage is being viewed', () => {
    expect(activeNav('settings', '2', '3')).toEqual({ stageId: null, buildView: null, footer: 'settings' })
  })
})

describe('how a stage describes itself', () => {
  it('a named sign-off is a solid tick and names the person', () => {
    const s = stage('2', 'signed_off', 'Priya N.')
    expect(nodeKind(s)).toBe('signed')
    expect(stageMeta(s)).toBe('Signed off · Priya N.')
  })

  it('a finished stage with no recorded name is a different, outlined tick and says so', () => {
    const s = stage('0', 'signed_off', null)
    expect(nodeKind(s)).toBe('completed')
    expect(stageMeta(s)).toBe('Completed · no name recorded')
  })

  it('the current stage shows document progress when it is known', () => {
    expect(stageMeta(stage('3', 'current'), { complete: 3, total: 5 })).toBe('3 of 5 documents complete')
  })

  it('the current stage says only "In progress" while progress is unknown', () => {
    expect(stageMeta(stage('3', 'current'), null)).toBe('In progress')
    expect(nodeKind(stage('3', 'current'))).toBe('current')
  })

  it('a later stage is not started', () => {
    expect(stageMeta(stage('7', 'later'))).toBe('Not started')
    expect(nodeKind(stage('7', 'later'))).toBe('later')
  })

  it('Build Loop never claims "Not started": specs are built before the stage is formally reached', () => {
    // On a real project 19 specs were merged while the plugin still marked Build "later".
    expect(stageMeta(stage('build', 'later'))).toBe('Specs, checks and close-out')
    // Once it is reached, it reads like any other stage.
    expect(stageMeta(stage('build', 'current'))).toBe('In progress')
    expect(stageMeta(stage('build', 'signed_off', 'Priya N.'))).toBe('Signed off · Priya N.')
  })
})
