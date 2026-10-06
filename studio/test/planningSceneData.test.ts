/** Planning's Graph data (togo-command-center.md §3.2, §4): the proposal draws every body at
 * `buildOrderIndex: null` under `proposed: true`; the committed slate is the sprint home's
 * constellation; nothing outside `FIELD_ALLOW_LIST` reaches the geometry side. */
import { describe, expect, it } from 'vitest'
import type { SlateProposal, SprintSlateRow, SprintView } from '../shared/types'
import { constellationFromProposal, planningSceneData } from '../src/components/planning/planningSceneData'
import { assertOnlyAllowListedFields, buildRenderModel, FIELD_ALLOW_LIST } from '../src/scenes/constellation/constellationModel'

const slateRow = (over: Partial<SprintSlateRow>): SprintSlateRow => ({
  id: '0001', name: 'a', risk: 'LOW', type: 'feature', channel: '', status: 'ready', sprint: '', nextOwner: '', engReview: '', dataReview: '',
  dependsOn: [], dor: 'READY', dorBlocking: [], path: '/p/specs/0001-a.md', relPath: 'specs/0001-a.md', ...over,
})

const PROPOSAL: SlateProposal = {
  sprint: 'S08', target: 3, mix: 'HIGH:1,MEDIUM:2', alreadySlated: [], candidates: 4,
  proposal: [slateRow({ id: '0001', risk: 'HIGH' }), slateRow({ id: '0002', dependsOn: ['0001', '0042'], dor: 'NOT READY', dorBlocking: ['## Scope Out: missing'] })],
  mixAfter: { HIGH: { target: 1, actual: 1 } }, mixWarnings: [], dependencyWarnings: ['0002 depends on 0042 outside the slate'], hasData: true, note: null,
}

const VIEW: SprintView = {
  ok: true,
  sprint: { id: 'S08', goal: 'g', start: '2026-10-05', end: '2026-10-16', state: 'planning', target: 3, mix: '', boardRef: '', readiedBy: '', closedBy: '', created: '', path: '', relPath: '', days: { total: 10, elapsed: 1, remaining: 9 } },
  slate: [slateRow({ id: '0003', sprint: 'S08' }), slateRow({ id: '0004', sprint: 'S08' })],
  readiness: { ready: 2, total: 2, gaps: [] }, verdictsPending: [], handoffsOpen: [], mix: {}, mixWarnings: [], wip: { inFlight: 0, cap: null },
  buildOrder: ['0004', '0003'], nextUp: '0004', dependencyGaps: [], decisions: null, carriedIn: [], hasData: true, note: null,
}

describe('planningSceneData', () => {
  it('a proposal draws every body at buildOrderIndex null, proposed: true, with no build order and no next up', () => {
    const data = constellationFromProposal(PROPOSAL)
    expect(data.proposed).toBe(true)
    expect(data.bodies.map((b) => b.buildOrderIndex)).toEqual([null, null])
    expect(data.bodies.every((b) => !b.isNextUp)).toBe(true)
    expect(data.buildOrder).toEqual([])
    expect(data.nextUp).toBeNull()
    expect(data.dependencyGaps).toEqual(PROPOSAL.dependencyWarnings)
  })

  it('tethers follow depends_on as declared; an id outside the proposed set is a ghost, not a dropped edge', () => {
    const data = constellationFromProposal(PROPOSAL)
    expect(data.tethers).toEqual([{ from: '0002', to: '0001', ghost: false }, { from: '0002', to: '0042', ghost: true }])
    expect(data.ghosts).toEqual([{ id: '0042', reason: 'not-in-sprint', referencedBy: ['0002'] }])
  })

  it('the geometry side touches no field outside FIELD_ALLOW_LIST on proposal bodies', () => {
    const data = constellationFromProposal(PROPOSAL)
    expect(() => assertOnlyAllowListedFields(data)).not.toThrow()
    expect(FIELD_ALLOW_LIST).not.toContain('row')
    const model = buildRenderModel(data)
    expect(model.realCount).toBe(2)
    expect(model.ghostCount).toBe(1)
  })

  it('the committed slate is the sprint home\'s constellation (build order kept); the proposal surface needs a proposal', () => {
    const slate = planningSceneData(VIEW, PROPOSAL, 'slate')!
    expect(slate.proposed).toBeUndefined()
    expect(slate.bodies.map((b) => [b.id, b.buildOrderIndex])).toEqual([['0003', 1], ['0004', 0]])
    expect(planningSceneData(VIEW, null, 'proposal')).toBeNull()
    expect(planningSceneData(null, PROPOSAL, 'slate')).toBeNull()
    expect(planningSceneData(VIEW, PROPOSAL, 'proposal')!.proposed).toBe(true)
  })

  it('an empty proposal reads hasData false — the host shows the plugin\'s note, never an empty figure as zero', () => {
    const data = constellationFromProposal({ ...PROPOSAL, proposal: [], hasData: false, note: 'no sprint S09' })
    expect(data.hasData).toBe(false)
    expect(data.note).toBe('no sprint S09')
  })
})
