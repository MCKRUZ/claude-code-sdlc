// @vitest-environment jsdom
/** The constellation's demand loop must reach zero. `useConstellationLayout` is listed in the
 * scene's buffer effect, hover effect (which calls `wake()`) and `onTick` deps; when it returned
 * a fresh object literal every render, each settle → `setInternalLive(false)` → re-render made
 * the hover effect replay and `wake()` again, and the loop ping-ponged at 30 fps instead of
 * idling (studio-observatory.md §5.0 "an idle scene renders zero frames", §9 budget). Pure
 * hook-level proof: the handles keep their identity across renders, so an effect keyed on them
 * fires once and the wake count stops climbing. */
import { useEffect } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SprintSlateRow, SprintView } from '../../shared/types'
import { MOTION_DURATIONS, MOTION_EASES } from '../../src/motion/contract'
import { contextFrom } from '../../src/motion/choreo/_shared'
import { constellationFromSprintView } from '../../src/scenes/constellation/constellationData'
import { buildRenderModel } from '../../src/scenes/constellation/constellationModel'
import { useConstellationLayout } from '../../src/scenes/constellation/useConstellationLayout'

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

const MODEL = buildRenderModel(constellationFromSprintView(sprintView([
  slateRow({ id: '0001', risk: 'HIGH' }),
  slateRow({ id: '0002', dependsOn: ['0001'] }),
  slateRow({ id: '0003', dependsOn: ['0002'] }),
])))

// MODE=test: the stub engine, so the settle applies its end state at once (no ticker to wait on).
const getContext = () => contextFrom(document.body, { enabled: false, reduced: true }, { durations: MOTION_DURATIONS, eases: MOTION_EASES })

describe('useConstellationLayout handles', () => {
  it('returns the same object across renders, so effects keyed on it fire once and wakes stop', () => {
    const invalidate = vi.fn()
    const wake = vi.fn()
    const hoverEffectRuns = { n: 0 }
    const { result, rerender } = renderHook(() => {
      const layout = useConstellationLayout(MODEL, '/p', getContext, invalidate, wake)
      // The scene's hover effect, as written: keyed on `layout`, wakes the loop.
      useEffect(() => { hoverEffectRuns.n += 1; wake() }, [layout])
      return layout
    })
    const first = result.current
    const wakesAfterMount = wake.mock.calls.length
    expect(hoverEffectRuns.n).toBe(1)

    // What a settle does: `setInternalLive(false)` re-renders the scene with the same inputs.
    for (let i = 0; i < 5; i += 1) act(() => rerender())

    expect(result.current).toBe(first)
    expect(hoverEffectRuns.n).toBe(1)
    expect(wake.mock.calls.length).toBe(wakesAfterMount)
    // And the stub-settled layout has nothing left to step: the loop's onTick would read false.
    expect(result.current.layoutTick()).toBe(false)
  })

  it('the handles hold refs, not copies: positions written by a tick are what the stable object reads', () => {
    const { result } = renderHook(() => useConstellationLayout(MODEL, '/p', getContext, () => {}, () => {}))
    const before = result.current.positions.current.slice()
    act(() => result.current.moveBody(0, 9, 9, 9))
    expect(result.current.positions.current.slice(0, 3)).toEqual([9, 9, 9])
    expect(before.slice(0, 3)).not.toEqual([9, 9, 9])
  })
})
