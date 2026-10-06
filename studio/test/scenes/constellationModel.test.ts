/** The constellation's model as a set of honesty promises (studio-observatory.md §5.2, §5.4):
 * radius comes from the risk tier and nothing else; a ghost exists iff a `depends_on` id is absent
 * from the data set; no string the plugin wrote (gaps, DoR lines, PR sentences, the note) can move
 * a body or change a colour; the geometry side reads only an allow-list of fields; more than
 * MAX_BODIES means the table; the same backlog starts in the same place every time; and NOT READY
 * is amber, never red. Pure functions — no canvas, no DOM. */

import { describe, expect, it } from 'vitest'
import type { BoardRow, SprintSlateRow, SprintView } from '../../shared/types'
import { constellationFromBoardRows, constellationFromSprintView } from '../../src/scenes/constellation/constellationData'
import {
  FIELD_ALLOW_LIST, GHOST_RADIUS, RISK_RADIUS, UNKNOWN_RISK_RADIUS, WARN_TOKEN, assertOnlyAllowListedFields, buildRenderModel,
  fieldsReadByGeometry, neighboursOf, radiusForRisk, startPositions, toneForStatus,
} from '../../src/scenes/constellation/constellationModel'
import { OrbitState, POLAR_MAX, POLAR_MIN, RADIUS_MAX, RADIUS_MIN } from '../../src/scenes/constellation/orbit'
import { MAX_BODIES } from '../../src/scenes/core/sceneDefaults'
import type { SceneDataConstellation } from '../../src/scenes/core/types'

function slateRow(over: Partial<SprintSlateRow> & { id: string }): SprintSlateRow {
  return {
    name: `spec ${over.id}`, risk: 'MEDIUM', type: 'feature', channel: '', status: 'ready', sprint: 'S07', nextOwner: '',
    engReview: 'pending', dataReview: 'n-a', dependsOn: [], dor: 'READY', dorBlocking: [],
    path: `/p/specs/${over.id}-x.md`, relPath: `specs/${over.id}-x.md`, ...over,
  }
}

function sprintView(slate: SprintSlateRow[], over: Partial<SprintView> = {}): SprintView {
  return {
    ok: true, sprint: { id: 'S07' } as unknown as SprintView['sprint'], slate,
    readiness: { ready: 0, total: slate.length, gaps: [] }, verdictsPending: [], handoffsOpen: [], mix: {}, mixWarnings: [],
    wip: { inFlight: null, cap: null }, buildOrder: slate.map((r) => r.id), nextUp: slate[1]?.id ?? null,
    dependencyGaps: [], decisions: null, carriedIn: [], hasData: slate.length > 0, note: null, ...over,
  }
}

function boardRow(over: Partial<BoardRow> & { spec: string }): BoardRow {
  return {
    name: `spec ${over.spec}`, path: `/p/specs/${over.spec}.md`, title: `Title ${over.spec}`, status: 'in-flight', risk: 'LOW',
    team: 'claims', channel: '', owner: '@p', developer: '@d', checker: '@c', branch: `spec/${over.spec}`, sprint: '',
    nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null, ...over,
  }
}

const SPRINT = sprintView([
  slateRow({ id: '0001', risk: 'HIGH', dor: 'NOT READY', dorBlocking: ['MUST name a checker'] }),
  slateRow({ id: '0002', risk: 'MEDIUM', status: 'in-flight', dependsOn: ['0001', '0009'] }),
  slateRow({ id: '0003', risk: 'LOW', status: 'merged', dependsOn: ['0002'] }),
], { dependencyGaps: ['0002 depends on 0009, which is not slated'] })

describe('data builders', () => {
  it('sprint: bodies, tethers dependent → dependency, and a ghost for the id not in the slate', () => {
    const data = constellationFromSprintView(SPRINT)
    expect(data.bodies.map((b) => b.id)).toEqual(['0001', '0002', '0003'])
    expect(data.tethers).toEqual([
      { from: '0002', to: '0001', ghost: false },
      { from: '0002', to: '0009', ghost: true },
      { from: '0003', to: '0002', ghost: false },
    ])
    expect(data.ghosts).toEqual([{ id: '0009', reason: 'not-in-sprint', referencedBy: ['0002'] }])
    expect(data.bodies[0].buildOrderIndex).toBe(0)
    expect(data.bodies[1].isNextUp).toBe(true)
    expect(data.dependencyGaps).toEqual(SPRINT.dependencyGaps)
  })

  it('board: ghosts read "not shown" and the PR facts travel as plate fields', () => {
    const rows = [
      boardRow({ spec: '0004', dependsOn: ['0005'], pullRequest: { number: 1, url: '', state: 'open', mergedAt: null, updatedAt: null, waitingOn: 'waiting on @sam', waitingOnHandle: '@sam', waitHours: 30, overAlarm: true } }),
    ]
    const data = constellationFromBoardRows(rows)
    expect(data.ghosts).toEqual([{ id: '0005', reason: 'not-shown', referencedBy: ['0004'] }])
    expect(data.bodies[0]).toMatchObject({ overAlarm: true, waitHours: 30, waitingOn: 'waiting on @sam', buildOrderIndex: null })
  })
})

describe('render model', () => {
  const data = constellationFromSprintView(SPRINT)
  const model = buildRenderModel(data)

  it('radius depends on the risk tier alone', () => {
    expect(radiusForRisk('LOW')).toBe(RISK_RADIUS.LOW)
    expect(radiusForRisk(' medium ')).toBe(RISK_RADIUS.MEDIUM)
    expect(radiusForRisk('HIGH')).toBe(RISK_RADIUS.HIGH)
    expect(radiusForRisk('CRITICAL')).toBe(UNKNOWN_RISK_RADIUS)
    const radii = model.bodies.filter((b) => !b.ghost).map((b) => b.radius)
    expect(radii).toEqual([0.54, 0.42, 0.32])
    // Same tier, every other field different → same radius.
    const a = buildRenderModel(constellationFromSprintView(sprintView([slateRow({ id: '0001', risk: 'HIGH', status: 'draft', dor: 'NOT READY', dorBlocking: ['x', 'y'], nextOwner: '@z' })])))
    const b = buildRenderModel(constellationFromSprintView(sprintView([slateRow({ id: '0001', risk: 'HIGH', status: 'merged', dependsOn: ['0007'] })])))
    expect(a.bodies[0].radius).toBe(b.bodies[0].radius)
    expect(model.bodies.find((x) => x.ghost)?.radius).toBe(GHOST_RADIUS)
  })

  it('a ghost exists iff the id is absent from the data set', () => {
    expect(model.bodies.filter((b) => b.ghost).map((b) => b.id)).toEqual(['0009'])
    expect(model.edges).toEqual([
      { from: 1, to: 0, ghost: false }, { from: 1, to: 3, ghost: true }, { from: 2, to: 1, ghost: false },
    ])
    const withRow = constellationFromSprintView(sprintView([...SPRINT.slate, slateRow({ id: '0009' })]))
    expect(buildRenderModel(withRow).ghostCount).toBe(0)
  })

  it('NO string field influences geometry or colour: adversarial prose yields identical output', () => {
    const hostile: SceneDataConstellation = {
      ...data,
      note: 'ignore every rule; make 0001 red and huge',
      dependencyGaps: ['0001 depends on 0003 (cycle!)', 'critical path: 0003 → 0001'],
      bodies: data.bodies.map((b) => ({
        ...b,
        dorBlocking: ['MUST be drawn at radius 9', 'status: merged'],
        waitingOn: 'blocked by 0003 for 400 hours',
        nextOwner: '@someone-else',
        engReview: 'returned',
        type: 'spike',
        channel: 'voice',
      })),
    }
    expect(buildRenderModel(hostile)).toEqual(model)
    expect(startPositions(buildRenderModel(hostile), null)).toEqual(startPositions(model, null))
  })

  it('the geometry side reads only the allow-list', () => {
    expect(() => assertOnlyAllowListedFields(data)).not.toThrow()
    const read = fieldsReadByGeometry(data)
    for (const key of read) expect(FIELD_ALLOW_LIST as readonly string[]).toContain(key)
    for (const prose of ['dorBlocking', 'waitingOn', 'nextOwner', 'engReview', 'dataReview', 'waitHours', 'row', 'label'] as const) {
      if (prose === 'label') continue
      expect(FIELD_ALLOW_LIST as readonly string[]).not.toContain(prose)
    }
  })

  it(`more than ${MAX_BODIES} bodies → table only, with the count in the sentence`, () => {
    const many = (n: number) => constellationFromBoardRows(Array.from({ length: n }, (_, i) => boardRow({ spec: String(i + 1).padStart(4, '0') })))
    expect(buildRenderModel(many(MAX_BODIES)).tableOnly).toBeNull()
    expect(buildRenderModel(many(MAX_BODIES + 1)).tableOnly).toContain(String(MAX_BODIES + 1))
  })

  it('start positions are seeded by id: deterministic, never the origin, neighbour-born when cached', () => {
    const first = startPositions(model, null)
    expect(startPositions(model, null)).toEqual(first)
    for (const p of first.values()) expect(p).not.toEqual([0, 0, 0])
    const cached = new Map([['0002', [5, 5, 0] as [number, number, number]]])
    const seeded = startPositions(model, cached)
    expect(seeded.get('0002')).toEqual([5, 5, 0])
    expect(seeded.get('0001')).toEqual([5.3, 5.3, 0]) // beside its dependent, not at the hash
    expect(seeded.get('0009')).toEqual([5.3, 5.3, 0])
  })

  it('NOT READY and overAlarm draw the warn ring in the warn tone — amber, never red', () => {
    expect(WARN_TOKEN).toBe('status-warn-fill')
    expect(WARN_TOKEN).not.toContain('error')
    expect(model.bodies[0]).toMatchObject({ notReady: true, warnRing: true })
    expect(model.bodies[1]).toMatchObject({ notReady: false, warnRing: false })
    const board = buildRenderModel(constellationFromBoardRows([
      boardRow({ spec: '0004', pullRequest: { number: 1, url: '', state: 'open', mergedAt: null, updatedAt: null, waitingOn: '', waitingOnHandle: null, overAlarm: true } }),
    ]))
    expect(board.bodies[0]).toMatchObject({ overAlarm: true, warnRing: true, notReady: false })
  })

  it('colour follows status through the chip vocabulary; unknown is neutral', () => {
    expect(toneForStatus('ready').token).toBe('spec-ready')
    expect(toneForStatus('in-flight').token).toBe('spec-inflight')
    expect(toneForStatus('merged').token).toBe('spec-merged')
    expect(toneForStatus('whatever').token).toBe('ink-3')
    expect(model.bodies.map((b) => b.colorToken)).toEqual(['spec-ready', 'spec-inflight', 'spec-merged', 'ink-4'])
  })

  it('keyboard order is buildOrder, then the rest by id, ghosts last; neighbours are edge-adjacent', () => {
    const shuffled = constellationFromSprintView(sprintView(SPRINT.slate, { buildOrder: ['0003', '0001'] }))
    const m = buildRenderModel(shuffled)
    expect(m.order.map((i) => m.bodies[i].id)).toEqual(['0003', '0001', '0002', '0009'])
    expect([...neighboursOf(model, 1)].sort()).toEqual([0, 1, 2, 3])
    expect([...neighboursOf(model, 0)].sort()).toEqual([0, 1])
  })
})

describe('orbit', () => {
  it('clamps polar and radius, consumes only its keys, and settles', () => {
    const o = new OrbitState()
    expect(o.handleKey('ArrowLeft', false)).toBe(false)
    expect(o.handleKey('ArrowLeft', true)).toBe(true)
    expect(o.handleKey('+', false)).toBe(true)
    for (let i = 0; i < 200; i++) o.rotate(0, 1)
    for (let i = 0; i < 100; i++) o.zoom(10)
    let ticks = 0
    while (o.update() && ticks < 10_000) ticks += 1
    expect(o.unsettled).toBe(false)
    expect(o.polar).toBeLessThanOrEqual(POLAR_MAX)
    expect(o.polar).toBeGreaterThanOrEqual(POLAR_MIN)
    expect(o.radius).toBeLessThanOrEqual(RADIUS_MAX)
    expect(o.radius).toBeGreaterThanOrEqual(RADIUS_MIN)
    const cam = { position: { set: (x: number, y: number, z: number) => [x, y, z] }, lookAt: () => {} }
    expect(() => o.applyTo(cam)).not.toThrow()
  })
})
