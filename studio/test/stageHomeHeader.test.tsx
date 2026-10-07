// @vitest-environment jsdom
/** StageHome's header after round 2 (S1 + S2 + I3): the eyebrow is the stage's group and ordinal
 * from `groupStages`, the summary strip sits between the heading and the tabs, the screen root is
 * still `main.firstElementChild` (the e2e measures it), and the Spine data names the viewed stage. */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageHome, spineDataFor, stageEyebrow } from '../src/components/StageHome'
import { StageReadinessProvider } from '../src/components/StageReadinessContext'
import type { ProjectStage, ProjectStatus, StageDocument, StageReadiness } from '../shared/types'
import { readinessWith } from './activityFixtures'

function stage(id: string, display: string, state: ProjectStage['stage_state'] = 'later'): ProjectStage {
  return { id, name: id, display, status: state, stage_state: state, artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null }
}

const STATUS: ProjectStatus = {
  project_name: 'demo', profile_id: 'p', current_phase: { id: '0', display: 'Phase 0' },
  stages: [
    stage('0', 'Phase 0: Discovery', 'current'), stage('1', 'Phase 1: Requirements'), stage('2', 'Phase 2: Design'),
    stage('3', 'Phase 3: Foundation'), stage('build', 'Build Loop'), stage('7', 'Phase 7: Documentation'),
  ],
}

function doc(path: string, ready: boolean): StageDocument {
  return { name: path, path, exists: true, folder: false, shaped: true, findingCount: 0, ready }
}

function readiness(stageId: string): StageReadiness {
  return readinessWith({ stageId, display: `Phase ${stageId}: Stage ${stageId}`, documents: [doc('a.md', true), doc('b.md', false)] })
}

function install() {
  const studio = {
    getStageReadiness: vi.fn((_p: string, stageId?: string) => Promise.resolve(readiness(stageId ?? '0'))),
    openDocument: vi.fn().mockReturnValue(new Promise(() => {})),
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

function home(stageId: string) {
  return (
    <main>
      <StageReadinessProvider projectPath="/p" stageId={stageId}>
        <StageHome projectPath="/p" stageId={stageId} actor="matt" status={STATUS} setOpening={vi.fn()} onSignedOff={vi.fn()} onOpenDocument={vi.fn()} />
      </StageReadinessProvider>
    </main>
  )
}

describe('stageEyebrow: the area from groupStages, never a count of its own', () => {
  it('names the group and the ordinal inside it', () => {
    expect(stageEyebrow(STATUS, '0')).toBe('Foundation · Stage 1 of 4')
    expect(stageEyebrow(STATUS, '3')).toBe('Foundation · Stage 4 of 4')
    expect(stageEyebrow(STATUS, 'build')).toBe('Build · Stage 1 of 1')
    expect(stageEyebrow(STATUS, '7')).toBe('Ship · Stage 1 of 1')
    expect(stageEyebrow(STATUS, 'nope')).toBeNull()
  })
})

describe('spineDataFor: the viewed stage rides in the data object (I3)', () => {
  it('is the readiness stage, and null before readiness answers', () => {
    expect(spineDataFor(STATUS, readiness('1')).viewedStageId).toBe('1')
    expect(spineDataFor(STATUS, null).viewedStageId).toBeNull()
    expect(spineDataFor(STATUS, readiness('0')).currentStageId).toBe('0')
  })
})

describe('StageHome header (S1 + S2)', () => {
  it('eyebrow, then the byte-identical heading, then the strip, then the tabs — inside the screen root', async () => {
    install()
    const { container } = render(home('1'))
    const heading = await screen.findByRole('heading', { level: 2, name: 'Phase 1: Stage 1' })
    expect(screen.getByText('Foundation · Stage 2 of 4')).toBeTruthy()
    const strip = screen.getByRole('group', { name: 'Stage summary' })
    const tabs = screen.getByRole('tablist')
    expect(heading.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(strip.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(strip).getByText('1 of 2 complete')).toBeTruthy()
    expect(within(strip).getByRole('button', { name: /^Current step b\.md$/ })).toBeTruthy()
    // The e2e measures `main.firstElementChild.scrollWidth`: the screen root is still main's child.
    const main = container.querySelector('main')!
    expect(main.firstElementChild).toBe(heading.closest('[class*="space-y-6"]'))
  })

  it('without a project status there is no eyebrow and no Spine band, and the heading still leads', async () => {
    install()
    render(
      <StageReadinessProvider projectPath="/p" stageId="1">
        <StageHome projectPath="/p" stageId="1" actor="matt" setOpening={vi.fn()} onSignedOff={vi.fn()} onOpenDocument={vi.fn()} />
      </StageReadinessProvider>,
    )
    await screen.findByRole('heading', { level: 2, name: 'Phase 1: Stage 1' })
    expect(screen.queryByText(/Stage \d of \d/)).toBeNull()
    expect(screen.queryByTestId('spine-band')).toBeNull()
  })
})
