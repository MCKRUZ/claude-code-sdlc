/** The constellation's instanced buffers (studio-upgrade-2 I2 / I5), built with real three
 * objects and no GPU: one contact pool per REAL body whose size is a function of the risk-tier
 * radius and the one uniform fit factor only; the selection ring has one instance while a body
 * is hovered and none otherwise; and the hovered body's incident tethers split into the two
 * directional sets by the declared `dependsOn` partition — never by any other field. */

import { describe, expect, it } from 'vitest'
import { Color, Matrix4, Vector3 } from 'three'
import type { SprintSlateRow, SprintView } from '../../shared/types'
import { constellationFromSprintView } from '../../src/scenes/constellation/constellationData'
import { buildRenderModel, partitionIncident, RISK_RADIUS } from '../../src/scenes/constellation/constellationModel'
import {
  CONSTELLATION_TOKENS, createBodyBuffers, disposeBodyBuffers, POOL_FLATTEN, POOL_OPACITY, POOL_SCALE, poolWidth, SELECTION_RADIUS,
  writeBodyTransforms,
} from '../../src/scenes/constellation/bodyMeshes'
import type { Palette } from '../../src/scenes/constellation/bodyMeshes'
import { createTetherBuffers, disposeTetherBuffers, GRID_OPACITY, GRID_TOKEN, writeTethers } from '../../src/scenes/constellation/tetherMeshes'

function slateRow(over: Partial<SprintSlateRow> & { id: string }): SprintSlateRow {
  return {
    name: `spec ${over.id}`, risk: 'MEDIUM', type: 'feature', channel: '', status: 'ready', sprint: 'S07', nextOwner: '',
    engReview: 'pending', dataReview: 'n-a', dependsOn: [], dor: 'READY', dorBlocking: [],
    path: `/p/specs/${over.id}-x.md`, relPath: `specs/${over.id}-x.md`, ...over,
  }
}

function sprintView(slate: SprintSlateRow[]): SprintView {
  return {
    ok: true, sprint: { id: 'S07' } as unknown as SprintView['sprint'], slate,
    readiness: { ready: 0, total: slate.length, gaps: [] }, verdictsPending: [], handoffsOpen: [], mix: {}, mixWarnings: [],
    wip: { inFlight: null, cap: null }, buildOrder: slate.map((r) => r.id), nextUp: null,
    dependencyGaps: [], decisions: null, carriedIn: [], hasData: slate.length > 0, note: null,
  }
}

// 0002 depends on 0001 and the absent 0009 (a ghost); 0003 depends on 0002; 0004 depends on 0002.
const MODEL = buildRenderModel(constellationFromSprintView(sprintView([
  slateRow({ id: '0001', risk: 'HIGH' }),
  slateRow({ id: '0002', dependsOn: ['0001', '0009'] }),
  slateRow({ id: '0003', risk: 'LOW', dependsOn: ['0002'] }),
  slateRow({ id: '0004', dependsOn: ['0002'] }),
])))

const PALETTE = Object.fromEntries(CONSTELLATION_TOKENS.map((t) => [t, new Color('#808080')])) as Palette
const POSITIONS = [0, 0, 0, 2, 0.5, 0, 4, -0.5, 0, 6, 0, 0, 8, 1, 0]

const scale3 = (m: Matrix4) => new Vector3().setFromMatrixScale(m)

describe('contact pools (I2)', () => {
  it('pool count = real body count (ghosts cast none), each flattened 1 : 0.35, ink-3 at 12 %, additive', () => {
    const b = createBodyBuffers(MODEL, PALETTE)
    expect(b.pools.count).toBe(MODEL.realCount)
    expect(b.pools.count).toBe(4)
    expect(MODEL.ghostCount).toBe(1)
    expect(POOL_FLATTEN).toBe(0.35)
    expect(POOL_OPACITY).toBe(0.12)
    expect(b.pools.material.opacity).toBe(POOL_OPACITY)
    expect(b.pools.material.transparent).toBe(true)
    expect(b.pools.material.depthWrite).toBe(false)
    expect(b.pools.geometry.parameters.height / b.pools.geometry.parameters.width).toBeCloseTo(POOL_FLATTEN)
    disposeBodyBuffers(b)
  })

  it('pool scale ∝ radius only: HIGH / LOW pools keep the risk ratio, the fit factor scales every pool alike, no other field enters', () => {
    const b = createBodyBuffers(MODEL, PALETTE)
    const m = new Matrix4()
    for (const scale of [1, 1.6]) {
      writeBodyTransforms(b, MODEL, POSITIONS, scale)
      b.pools.getMatrixAt(0, m)
      const high = scale3(m).x
      b.pools.getMatrixAt(2, m)
      const low = scale3(m).x
      expect(high / low).toBeCloseTo(RISK_RADIUS.HIGH / RISK_RADIUS.LOW)
      expect(high).toBeCloseTo(poolWidth(RISK_RADIUS.HIGH, scale))
      expect(poolWidth(RISK_RADIUS.HIGH, scale)).toBeCloseTo(RISK_RADIUS.HIGH * scale * POOL_SCALE)
    }
    // Two MEDIUM bodies with different status / order → identical pool size.
    writeBodyTransforms(b, MODEL, POSITIONS, 1)
    b.pools.getMatrixAt(1, m)
    const a = scale3(m).x
    b.pools.getMatrixAt(3, m)
    expect(scale3(m).x).toBeCloseTo(a)
    disposeBodyBuffers(b)
  })
})

describe('selection ring (I5)', () => {
  it('has one instance at the hovered body only, outside the warn ring, and none when nothing is hovered', () => {
    const b = createBodyBuffers(MODEL, PALETTE)
    writeBodyTransforms(b, MODEL, POSITIONS, 1, null)
    expect(b.selection.count).toBe(0)
    writeBodyTransforms(b, MODEL, POSITIONS, 1, 2)
    expect(b.selection.count).toBe(1)
    const m = new Matrix4()
    b.selection.getMatrixAt(0, m)
    const p = new Vector3().setFromMatrixPosition(m)
    expect([p.x, p.y, p.z]).toEqual([4, -0.5, 0])
    expect(scale3(m).x).toBeCloseTo(RISK_RADIUS.LOW)
    // Amber (1.3) and accent (1.5) coexist: the selection ring is the outer one.
    expect(SELECTION_RADIUS).toBeGreaterThan(1.3)
    expect(b.selection.material.color.getHexString()).toBe(PALETTE['accent-500'].getHexString())
    disposeBodyBuffers(b)
  })
})

describe('incident tethers by direction (I5)', () => {
  it('upstream / downstream = the declared dependsOn partition', () => {
    // Hover 0002 (index 1): it depends on 0001 and ghost 0009 (upstream); 0003 and 0004 depend on it.
    const { upstream, downstream } = partitionIncident(MODEL, 1)
    expect(upstream.map((i) => MODEL.edges[i])).toEqual([{ from: 1, to: 0, ghost: false }, { from: 1, to: 4, ghost: true }])
    expect(downstream.map((i) => MODEL.edges[i])).toEqual([{ from: 2, to: 1, ghost: false }, { from: 3, to: 1, ghost: false }])
    expect(partitionIncident(MODEL, 0)).toEqual({ upstream: [], downstream: [0] })
  })

  it('writes the hovered body\'s dependencies to the ink set and its dependents to the accent set; ghosts stay dashed', () => {
    const t = createTetherBuffers(MODEL, PALETTE)
    const segments = (line: { geometry: { attributes: { instanceStart?: { count: number } } }; visible: boolean }) =>
      line.visible ? line.geometry.attributes.instanceStart?.count ?? 0 : 0
    writeTethers(t, MODEL, POSITIONS, null)
    expect(segments(t.hot)).toBe(0)
    expect(segments(t.hotUp)).toBe(0)
    expect(segments(t.live)).toBe(3)
    expect(segments(t.ghost)).toBe(1)
    writeTethers(t, MODEL, POSITIONS, 1)
    expect(segments(t.hotUp)).toBe(1) // 0002 → 0001; the ghost edge stays in the ghost set
    expect(segments(t.hot)).toBe(2) // 0003 → 0002, 0004 → 0002
    expect(segments(t.live)).toBe(0)
    expect(segments(t.ghost)).toBe(1)
    expect(t.hotUpMaterial.color.getHexString()).toBe(PALETTE['ink-2'].getHexString())
    expect(t.hotMaterial.color.getHexString()).toBe(PALETTE['accent-500'].getHexString())
    disposeTetherBuffers(t)
  })

  it('grid is theme-aware: line-2 at .28 light, ink-4 at .48 dark', () => {
    expect(GRID_TOKEN).toEqual({ light: 'line-2', dark: 'ink-4' })
    expect(GRID_OPACITY).toEqual({ light: 0.28, dark: 0.48 })
  })
})
