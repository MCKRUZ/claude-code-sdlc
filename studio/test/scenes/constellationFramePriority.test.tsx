// @vitest-environment jsdom
/** The plates project AFTER the scene writes their anchors (v13 fixer round). R3F runs `useFrame`
 * subscribers sorted by priority, lowest first; both callbacks were priority 0 and ran in mount
 * order, so `Plates` (a child, subscribed first) projected anchors the scene had not written yet.
 * On a Board whose layout came from the cache — no settle tween, so ONE demand frame and the loop
 * idles — every plate projected (0,0,0): seven labels stacked in a column at the canvas centre,
 * detached from their bodies (observatory-v13-board-graph.png). The scene's anchor callback now
 * subscribes at `ANCHOR_FRAME_PRIORITY` (negative: earlier, and automatic rendering stays on) and
 * asks for one more frame after a transform write, so a projection that ran before it in an
 * earlier frame reads the final anchors. The R3F hooks are mocked: this pins the ORDER contract,
 * not WebGL. */
import { render } from '@testing-library/react'
import { PerspectiveCamera, Raycaster, Scene } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SprintSlateRow, SprintView } from '../../shared/types'

const r3f = vi.hoisted(() => ({
  useFrame: vi.fn<(cb: (state: unknown, dt: number) => void, priority?: number) => void>(),
  state: {} as Record<string, unknown>,
}))

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, dt: number) => void, priority?: number) => r3f.useFrame(cb, priority),
  useThree: (selector: (s: Record<string, unknown>) => unknown) => selector(r3f.state),
}))

import { ANCHOR_FRAME_PRIORITY, ConstellationScene } from '../../src/scenes/constellation/ConstellationScene'
import { constellationFromSprintView } from '../../src/scenes/constellation/constellationData'
import { buildRenderModel } from '../../src/scenes/constellation/constellationModel'
import { OrbitState } from '../../src/scenes/constellation/orbit'

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

afterEach(() => { r3f.useFrame.mockClear() })

describe('the constellation writes anchors before the plates project', () => {
  it('the scene subscribes its frame callback at a NEGATIVE priority — earlier than Plates\' default 0, rendering still automatic', () => {
    expect(ANCHOR_FRAME_PRIORITY).toBeLessThan(0)
    const data = constellationFromSprintView(sprintView([slateRow({ id: '0001', risk: 'HIGH' }), slateRow({ id: '0002', dependsOn: ['0001'] })]))
    const model = buildRenderModel(data)
    const canvas = document.createElement('canvas')
    const camera = new PerspectiveCamera(40, 2, 0.1, 80)
    const invalidate = vi.fn()
    Object.assign(r3f.state, { gl: { domElement: canvas }, camera, scene: new Scene(), size: { width: 724, height: 360 }, invalidate, raycaster: new Raycaster(), viewport: { width: 10, height: 5, factor: 1 } })
    render(<ConstellationScene data={data} model={model} hoverId={null} onHover={() => {}} live={false} orbit={new OrbitState()} projectKey="/p" />)
    const priorities = r3f.useFrame.mock.calls.map((c) => c[1] ?? 0)
    expect(priorities).toContain(ANCHOR_FRAME_PRIORITY)
    // Plates' projection keeps the default; sorted by priority the anchor writer runs first.
    expect(priorities).toContain(0)
    const sorted = [...r3f.useFrame.mock.calls].sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
    expect(sorted[0][1]).toBe(ANCHOR_FRAME_PRIORITY)
    // Nothing positive: a positive priority would switch R3F's automatic render off.
    expect(priorities.every((p) => p <= 0)).toBe(true)
  })
})
