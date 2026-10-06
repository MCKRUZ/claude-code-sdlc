/** I7 — the spec neighbourhood layout (studio-upgrade-2 §4 P3) is a pure function with the same
 * honesty rules as the constellation: dependents come ONLY from other rows' declared `dependsOn`,
 * a ghost is an id the store has not seen, size is the risk tier, colour the status, NOT READY is
 * amber — and no string field but those two reaches a number. */
import { describe, expect, it } from 'vitest'
import type { BoardRow, SprintSlateRow } from '../../shared/types'
import { GHOST_RADIUS, RISK_RADIUS, WARN_TOKEN } from '../../src/scenes/constellation/constellationModel'
import { buildNeighbourhood, edgePath, nodeName, UNIT_PX } from '../../src/scenes/constellation/neighbourhood'

const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  spec: '0007', name: 'duplicate-claim-409', path: 'specs/0007.md', title: 'Duplicate claim 409', status: 'ready', risk: 'HIGH',
  team: 'claims', channel: '', owner: '@matt-k', developer: '', checker: '@priya-n', branch: '', sprint: 'S07', nextOwner: '',
  engReview: '', dataReview: '', dependsOn: [], pullRequest: null, ...over,
})
const slateRow = (over: Partial<SprintSlateRow> = {}): SprintSlateRow => ({
  id: '0009', name: 'retry-rail', risk: 'LOW', type: 'feature', channel: '', status: 'draft', sprint: 'S07', nextOwner: '',
  engReview: '', dataReview: '', dependsOn: [], dor: 'NOT READY', dorBlocking: ['## Scope Out: missing'], path: '/p/specs/0009.md', relPath: 'specs/0009.md', ...over,
})

const ROWS = [
  row(),
  row({ spec: '0008', name: 'claim-export', title: 'Claim export', risk: 'MEDIUM', status: 'in-flight', dependsOn: ['0007', '0042'] }),
  row({ spec: '0010', name: 'letters', title: 'Letters batch', risk: 'LOW', status: 'draft', dependsOn: ['0008'] }),
]

describe('buildNeighbourhood', () => {
  it('is null when the store holds nothing — the component says so rather than drawing an empty sky', () => {
    expect(buildNeighbourhood(row(), [], [])).toBeNull()
  })

  it('dependencies come from this spec\'s dependsOn; dependents ONLY from other rows naming it', () => {
    const hood = buildNeighbourhood(ROWS[1], ROWS)!
    expect(hood.dependencies.map((n) => n.id)).toEqual(['0007', '0042'])
    expect(hood.dependents.map((n) => n.id)).toEqual(['0010'])
    // A spec never names its own dependents: a row whose dependsOn lists itself adds nothing.
    const selfish = [...ROWS, row({ spec: '0011', dependsOn: ['0011'] })]
    expect(buildNeighbourhood(selfish[3], selfish)!.dependents).toEqual([])
    expect(buildNeighbourhood(selfish[3], selfish)!.dependencies).toEqual([])
  })

  it('a ghost is an id nobody fetched: fixed radius, no label, dashed edge; a known id draws by risk and status', () => {
    const hood = buildNeighbourhood(ROWS[1], ROWS)!
    const [known, ghost] = hood.dependencies
    expect(ghost.ghost).toBe(true)
    expect(ghost.label).toBeNull()
    expect(ghost.r).toBe(GHOST_RADIUS * UNIT_PX)
    expect(hood.edges.find((e) => e.to === '0042')?.ghost).toBe(true)
    expect(known.ghost).toBe(false)
    expect(known.r).toBe(RISK_RADIUS.HIGH * UNIT_PX)
    expect(known.colorToken).toBe('spec-ready')
    expect(hood.centre.colorToken).toBe('spec-inflight')
    expect(hood.centre.r).toBe(RISK_RADIUS.MEDIUM * UNIT_PX)
  })

  it('a NOT READY slate row is amber, never red; the slate fills in what the Board has not fetched', () => {
    const slate = [slateRow({ dependsOn: ['0007'] })]
    const hood = buildNeighbourhood(ROWS[0], ROWS, slate)!
    const dependent = hood.dependents.find((n) => n.id === '0009')!
    expect(dependent.ghost).toBe(false)
    expect(dependent.notReady).toBe(true)
    // Colour stays the plugin's status word; NOT READY is a dashed ring in the warn token (a
    // shape cue the legend names), never a second meaning for the body's colour.
    expect(dependent.colorToken).not.toBe(WARN_TOKEN)
    expect(dependent.ringToken).toBe(WARN_TOKEN)
    expect(dependent.chipTone).not.toBe('warn')
    expect(dependent.r).toBe(RISK_RADIUS.LOW * UNIT_PX)
  })

  it('no string field but risk and status affects the layout: titles, owners, teams, sprints change nothing', () => {
    const a = buildNeighbourhood(ROWS[1], ROWS)!
    const renamed = ROWS.map((r) => ({ ...r, title: `${r.title} renamed`, name: 'x', owner: '@someone-else', team: 'other', sprint: 'S99', nextOwner: '@z', branch: 'b', path: 'q.md', channel: 'voice' }))
    const b = buildNeighbourhood(renamed[1], renamed)!
    const geometry = (h: NonNullable<typeof a>) => [h.centre, ...h.dependencies, ...h.dependents].map((n) => [n.id, n.x, n.y, n.r, n.colorToken])
    expect(geometry(b)).toEqual(geometry(a))
    expect(b.width).toBe(a.width)
    expect(b.height).toBe(a.height)
  })

  it('columns: dependencies left, this spec centred, dependents right; evenly spread; deterministic order by id', () => {
    const many = [...ROWS, row({ spec: '0003', dependsOn: ['0008'] }), row({ spec: '0001', dependsOn: ['0008'] })]
    const hood = buildNeighbourhood(many[1], many)!
    expect(hood.dependents.map((n) => n.id)).toEqual(['0001', '0003', '0010'])
    expect(hood.dependents.every((n) => n.x === hood.width - 128)).toBe(true)
    expect(hood.dependencies.every((n) => n.x === 128)).toBe(true)
    expect(hood.centre.x).toBe(hood.width / 2)
    const ys = hood.dependents.map((n) => n.y)
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1])
    expect(buildNeighbourhood(many[1], [...many].reverse())!.dependents.map((n) => n.id)).toEqual(['0001', '0003', '0010'])
  })

  it('edges stop at each body\'s rim; names never read as a bare id', () => {
    const hood = buildNeighbourhood(ROWS[1], ROWS)!
    const d = edgePath(hood.centre, hood.dependencies[0])
    expect(d.startsWith(`M ${hood.centre.x - hood.centre.r} ${hood.centre.y}`)).toBe(true)
    expect(nodeName(hood.centre)).toBe('Spec 0008: Claim export')
    expect(nodeName(hood.dependencies[1])).toBe('Spec 0042 (not shown)')
  })
})
