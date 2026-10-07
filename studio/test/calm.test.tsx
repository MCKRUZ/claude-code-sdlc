// @vitest-environment jsdom
/** Calm by day 30 (togo-command-center.md §4, visual §7): the familiarity tier changes how a
 * state is reached, never what it is. The lane board rendered under `full`, `quiet` and
 * `settled` is byte-identical (motion is the stub under MODE=test, so `progress(1)` has already
 * been applied); the `settled` and `quiet` tiers hand the first-paint stagger zero targets,
 * `full` hands it the cards (capped at twelve). */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LaneBoard } from '../src/components/lanes/LaneBoard'
import { revealKeyFor, revealTargets } from '../src/components/lanes/laneMotion'
import type { FamiliarityTier } from '../src/motion/contract'
import { LIST_STAGGER_CAP, TIER_FEATURES } from '../src/motion/presets'
import { resetRoomStore } from '../src/stores/roomStore'
import { BOARD_ROWS, CC, ROSTER, SPRINT, slateRow } from './sprintHomeFixture'

afterEach(() => { cleanup(); resetRoomStore() })

const TIERS: FamiliarityTier[] = ['full', 'quiet', 'settled']

function board(tier: FamiliarityTier, view = SPRINT) {
  const { container, unmount } = render(
    <LaneBoard
      view={view} board={BOARD_ROWS} hostReason={null} actor={CC.actor} capabilities={CC.capabilities} roster={ROSTER.people}
      filter="all" onFilter={vi.fn()} onOpen={vi.fn()} onRun={vi.fn()} tier={tier} revealKey="k"
    />,
  )
  // The tier attribute is the one thing that may differ; everything the person sees is the same.
  const html = container.innerHTML.replace(/ data-tier="[a-z]+"/g, '')
  return { html, container, unmount }
}

describe('the DOM is identical across tiers', () => {
  it('full, quiet and settled render byte-identical lanes after the end state applies', () => {
    const htmls = TIERS.map((tier) => { const b = board(tier); const html = b.html; b.unmount(); return html })
    expect(htmls[1]).toBe(htmls[0])
    expect(htmls[2]).toBe(htmls[0])
    expect(htmls[0]).toContain('data-lane-card')
  })
})

describe('what each tier hands the first-paint stagger', () => {
  it('settled and quiet → zero targets; full → the cards', () => {
    const b = board('full')
    expect(revealTargets(b.container, 'settled')).toHaveLength(0)
    expect(revealTargets(b.container, 'quiet')).toHaveLength(0)
    expect(revealTargets(b.container, 'full').length).toBe(b.container.querySelectorAll('[data-lane-card]').length)
    expect(revealKeyFor('k', 'settled')).toBeNull()
    expect(revealKeyFor('k', 'quiet')).toBeNull()
    expect(revealKeyFor('k', 'full')).toBe('k')
    expect(revealKeyFor(null, 'full')).toBeNull()
  })

  it('a lane of more than twelve cards hands the stagger twelve; the rest paint at once', () => {
    const many = { ...SPRINT, slate: Array.from({ length: 15 }, (_, i) => slateRow({ id: String(100 + i).padStart(4, '0'), status: 'merged' })) }
    const b = board('full', many)
    expect(b.container.querySelectorAll('[data-lane-card]')).toHaveLength(15)
    expect(revealTargets(b.container, 'full')).toHaveLength(LIST_STAGGER_CAP)
  })

  it('the tier table is the visual\'s: full everything, quiet keeps pop/seam/slide/crossfade/counter, settled crossfade+counter', () => {
    expect([...TIER_FEATURES.settled].sort()).toEqual(['counter', 'crossfade'])
    expect(TIER_FEATURES.quiet.has('stagger')).toBe(false)
    expect(TIER_FEATURES.quiet.has('slide')).toBe(true)
    expect(TIER_FEATURES.full.has('stagger')).toBe(true)
  })
})
