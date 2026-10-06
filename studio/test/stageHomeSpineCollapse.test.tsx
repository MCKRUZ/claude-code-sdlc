// @vitest-environment jsdom
/** The Spine band's chevron (round 2, I8 / row #28) and the ORDER it applies its state in. The
 * row measures the band when it plays and ends with `clearProps`, so the host must not swap the
 * markup under a running tween: collapsing plays on the open band and flips at the end; expanding
 * flips first and then plays from 0. Under the stub (test mode) both are one commit; with the
 * engine on, the body is still mounted while the collapse runs and the band is clipped while the
 * expand runs, and the end state in both directions carries no inline height or overflow. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gsap } from 'gsap'
import '../src/scenes/registerAll'
import { StageHome } from '../src/components/StageHome'
import { StageReadinessProvider } from '../src/components/StageReadinessContext'
import { configureMotionForTests } from '../src/motion/motion'
import { stageTabStore } from '../src/stores/stageTabStore'
import type { ProjectStage, ProjectStatus, StageDocument } from '../shared/types'
import { readinessWith } from './activityFixtures'

function stage(id: string, display: string, state: ProjectStage['stage_state'] = 'later'): ProjectStage {
  return { id, name: id, display, status: state, stage_state: state, artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null }
}

const STATUS: ProjectStatus = {
  project_name: 'demo', profile_id: 'p', current_phase: { id: '0', display: 'Phase 0' },
  stages: [stage('0', 'Phase 0: Discovery', 'current'), stage('1', 'Phase 1: Requirements'), stage('build', 'Build Loop')],
}

function doc(path: string, ready: boolean): StageDocument {
  return { name: path, path, exists: true, folder: false, shaped: true, findingCount: 0, ready }
}

beforeEach(() => {
  window.localStorage.clear()
  stageTabStore.setSpineCollapsed(false)
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = {
    getStageReadiness: vi.fn(() => Promise.resolve(readinessWith({ stageId: '1', display: 'Phase 1: Stage 1', documents: [doc('a.md', true)] }))),
    openDocument: vi.fn().mockReturnValue(new Promise(() => {})),
  }
})

afterEach(() => {
  cleanup()
  configureMotionForTests(null)
  gsap.globalTimeline.clear()
  stageTabStore.setSpineCollapsed(false)
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

async function mount() {
  render(
    <main>
      <StageReadinessProvider projectPath="/p" stageId="1">
        <StageHome projectPath="/p" stageId="1" actor="matt" status={STATUS} setOpening={vi.fn()} onSignedOff={vi.fn()} onOpenDocument={vi.fn()} />
      </StageReadinessProvider>
    </main>,
  )
  await screen.findByRole('heading', { level: 2, name: 'Phase 1: Stage 1' })
  // The scene is lazy: its chevron (the figure's `headerExtra`) arrives once the import resolves.
  await screen.findByRole('button', { name: /the lifecycle view$/ })
  return screen.getByTestId('spine-band')
}

const body = () => document.getElementById('spine-band-body')
const settle = () => act(() => { for (const t of gsap.globalTimeline.getChildren(true, true, false)) t.progress(1) })

describe('Spine band collapse / expand (I8)', () => {
  it('under the stub each click is one commit and leaves no inline height or overflow', async () => {
    const band = await mount()
    expect(body()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the lifecycle view' }))
    expect(band.hasAttribute('data-collapsed')).toBe(true)
    expect(body()).toBeNull()
    expect(band.style.height).toBe('')
    expect(band.style.overflow).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Expand the lifecycle view' }))
    expect(band.hasAttribute('data-collapsed')).toBe(false)
    expect(body()).toBeTruthy()
    expect(band.style.height).toBe('')
    expect(band.style.overflow).toBe('')
  })

  it('with the engine on, collapsing keeps the body mounted until the tween ends, then flips', async () => {
    configureMotionForTests({ isTestMode: () => false })
    const band = await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the lifecycle view' }))
    // The row is running on the OPEN band: the markup has not swapped yet.
    expect(body()).toBeTruthy()
    expect(band.hasAttribute('data-collapsed')).toBe(false)
    expect(band.style.overflow).toBe('hidden')
    settle()
    expect(band.hasAttribute('data-collapsed')).toBe(true)
    expect(body()).toBeNull()
    expect(band.style.height).toBe('')
    expect(band.style.overflow).toBe('')
  })

  it('with the engine on, expanding mounts the body first and then plays from 0 on it', async () => {
    configureMotionForTests({ isTestMode: () => false })
    stageTabStore.setSpineCollapsed(true)
    const band = await mount()
    expect(body()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand the lifecycle view' }))
    // Flipped first (the open markup is what the row measures), clipped while it grows.
    expect(band.hasAttribute('data-collapsed')).toBe(false)
    expect(body()).toBeTruthy()
    expect(band.style.overflow).toBe('hidden')
    settle()
    expect(body()).toBeTruthy()
    expect(band.style.height).toBe('')
    expect(band.style.overflow).toBe('')
  })
})
