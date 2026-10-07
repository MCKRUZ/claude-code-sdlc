// @vitest-environment jsdom
/** The chat folds per area (owner's v12 item 1): on the sprint home and planning the aside
 * starts collapsed to its rail — still the second `<aside>`, still mounted — the Frame root
 * carries `data-chat-collapsed` and a 40 px `--chat-width` for the screens beside it, and the
 * band's Chat button, the rail's own control and the store all flip one flag. On the lifecycle
 * home nothing changes: the chat opens at its 380 px as a11y.spec pins. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProjectStatus, StageReadiness } from '../shared/types'
import type { Area } from '../shared/nav'
import { Frame } from '../src/components/Frame'
import { chatStore, resetChatStore } from '../src/stores/chatStore'

vi.mock('../src/components/LifecycleStrip', () => ({
  LifecycleStrip: () => <nav aria-label="Project" data-testid="strip-probe" />,
  stripFactsFrom: () => ({ sprintId: null, ordinal: null, capabilities: null }),
}))
vi.mock('../src/components/ChatPanel', () => ({
  ChatPanel: ({ hidden, collapsed, onExpand }: { hidden?: boolean; collapsed?: boolean; onExpand?: () => void }) => (
    <aside data-testid="chat-probe" data-collapsed={collapsed ? '' : undefined} className={hidden ? 'hidden' : undefined}>
      {collapsed ? <button type="button" onClick={onExpand}>Open the chat</button> : <h2>Chat</h2>}
    </aside>
  ),
}))

const STATUS: ProjectStatus = {
  project_name: 'acme-claims', profile_id: 'p', current_phase: { id: 'build', display: 'Build Loop' },
  stages: [{ id: 'build', name: 'build', display: 'Build Loop', status: 'current', stage_state: 'current', artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null }],
}

beforeEach(() => {
  resetChatStore()
  const readiness: StageReadiness = {
    ok: true, stageId: 'build', name: 'build', display: 'Build Loop', isCurrent: true,
    documents: [], findings: [], judgement: [], signOff: { status: 'pending', signedOffBy: null, completedAt: null }, ready: false,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { getStageReadiness: vi.fn().mockResolvedValue(readiness) }
})
afterEach(() => {
  cleanup()
  resetChatStore()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

function mount(area: Area) {
  return render(
    <Frame status={STATUS} projectPath="/p" syncState={{ kind: 'idle', lastPulledAt: null }} area={area} actor="Matt K" onNavigate={vi.fn()}>
      <section data-testid="screen">home</section>
    </Frame>,
  )
}

const root = () => document.querySelector('[data-frame-root]') as HTMLElement

describe('Frame folds the chat per area', () => {
  it('sprint home: collapsed by default, still the second aside, root carries the rail width; Chat in the band is not pressed', () => {
    mount('sprint')
    expect(screen.getByTestId('chat-probe').hasAttribute('data-collapsed')).toBe(true)
    expect(screen.getByTestId('chat-probe').className).not.toContain('hidden')
    expect(document.querySelectorAll('aside')).toHaveLength(2)
    expect(root().hasAttribute('data-chat-collapsed')).toBe(true)
    expect(root().hasAttribute('data-chat-hidden')).toBe(false)
    expect(root().style.getPropertyValue('--chat-width')).toBe('40px')
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('planning starts folded too; the lifecycle home (documents) opens at the chosen width', () => {
    const planning = mount('planning')
    expect(screen.getByTestId('chat-probe').hasAttribute('data-collapsed')).toBe(true)
    planning.unmount()
    mount('documents')
    expect(screen.getByTestId('chat-probe').hasAttribute('data-collapsed')).toBe(false)
    expect(root().hasAttribute('data-chat-collapsed')).toBe(false)
    expect(root().style.getPropertyValue('--chat-width')).toBe('380px')
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy()
  })

  it('the band button, the rail control and the store flip the same flag for the showing area only', () => {
    mount('sprint')
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(screen.getByTestId('chat-probe').hasAttribute('data-collapsed')).toBe(false)
    expect(root().style.getPropertyValue('--chat-width')).toBe('380px')
    expect(chatStore.isCollapsed('sprint')).toBe(false)
    expect(chatStore.isCollapsed('planning')).toBe(true)
    act(() => { chatStore.toggle('sprint') })
    expect(screen.getByTestId('chat-probe').hasAttribute('data-collapsed')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Open the chat' }))
    expect(screen.getByTestId('chat-probe').hasAttribute('data-collapsed')).toBe(false)
  })

  it('steering hides the aside outright and never reports it as folded', () => {
    render(
      <Frame status={STATUS} projectPath="/p" syncState={{ kind: 'idle', lastPulledAt: null }} area="steering" actor="Matt K" steering onNavigate={vi.fn()}>
        <section>room</section>
      </Frame>,
    )
    expect(screen.getByTestId('chat-probe').className).toContain('hidden')
    expect(root().hasAttribute('data-chat-hidden')).toBe(true)
    expect(root().hasAttribute('data-chat-collapsed')).toBe(false)
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull()
  })
})
