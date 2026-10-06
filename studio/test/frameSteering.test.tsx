// @vitest-environment jsdom
/** The shell in steering mode (togo-command-center.md §3.5, visual §4 "steer-bg full-bleed; no
 * chat, no console", fixer round): the Frame steps back — the band is the presentation variant,
 * the lifecycle strip (the only navigation) is not drawn, `<main>` has no padding so the room is
 * edge to edge without negative margins, and the chat aside stays in the DOM but hidden. Leaving
 * goes through the host's own Back. Outside steering the shell is exactly as before. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProjectStatus, StageReadiness } from '../shared/types'
import { Frame } from '../src/components/Frame'

vi.mock('../src/components/ChatPanel', () => ({
  ChatPanel: ({ hidden }: { hidden?: boolean }) => <aside data-testid="chat-probe" className={hidden ? 'hidden' : undefined}><h2>Chat</h2></aside>,
}))

const STATUS: ProjectStatus = {
  project_name: 'acme-claims', profile_id: 'p', current_phase: { id: 'build', display: 'Build Loop' },
  stages: [
    { id: '0', name: 'discovery', display: 'Phase 0: Discovery', status: 'signed_off', stage_state: 'signed_off', artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: 'x' },
    { id: 'build', name: 'build', display: 'Build Loop', status: 'current', stage_state: 'current', artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null },
  ],
}

beforeEach(() => {
  const readiness: StageReadiness = {
    ok: true, stageId: 'build', name: 'build', display: 'Build Loop', isCurrent: true,
    documents: [], findings: [], judgement: [], signOff: { status: 'pending', signedOffBy: null, completedAt: null }, ready: false,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { getStageReadiness: vi.fn().mockResolvedValue(readiness) }
})
afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

function mount(steering: boolean, back = vi.fn()) {
  render(
    <Frame status={STATUS} projectPath="/p" syncState={{ kind: 'idle', lastPulledAt: null }} area={steering ? 'steering' : 'sprint'} actor="Matt K" steering={steering} onNavigate={vi.fn()} shell={{ back }}>
      <section data-testid="screen">room</section>
    </Frame>,
  )
  return { back }
}

describe('Frame in steering mode', () => {
  it('draws the presentation band, no strip, a padding-less main and a hidden chat; Leave goes through the host\'s Back', () => {
    const { back } = mount(true)
    expect(document.querySelector('[data-frame-root]')?.hasAttribute('data-steering')).toBe(true)
    expect(document.querySelector('[data-topband][data-presentation]')).not.toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Project' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Build Loop/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Search/ })).toBeNull()
    const main = document.getElementById('main')!
    expect(main.className).toContain('p-0')
    expect(main.className).not.toContain('p-6')
    expect(screen.getByTestId('chat-probe').className).toContain('hidden')
    // Still the two asides, shell band then chat, and the one h1.
    expect(document.querySelectorAll('aside')).toHaveLength(2)
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Leave steering (Esc)' }))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('outside steering the strip, the omnibar trigger and the 24 px padding are all there', () => {
    mount(false)
    expect(screen.getByRole('navigation', { name: 'Project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Search/ })).toBeTruthy()
    expect(document.getElementById('main')!.className).toContain('p-6')
    expect(document.querySelector('[data-topband][data-presentation]')).toBeNull()
    expect(screen.getByTestId('chat-probe').className).not.toContain('hidden')
  })
})
