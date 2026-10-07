// @vitest-environment jsdom
//
// studio-observatory.md §9 "Shell re-renders": a console entry used to re-render the whole shell
// — the navigation, the open screen, ChatPanel — every ~2 s on the Workflow tab and every 150 ms
// while a command streamed. The fix is three parts (`consoleStore` subscribed by the Console
// alone, `React.memo` boundaries around the shell's siblings in Frame.tsx, a `useCallback`
// onNavigate in App), and this test is the proof: push entries into the store and count renders
// of the siblings. The command center (togo-command-center.md §1) retired the Sidebar for the
// TopBand + LifecycleStrip inside the first `<aside>`; the strip and ChatPanel are replaced by
// probes that count their own renders, since the question is whether React CALLS them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ConsoleEntry, ProjectStatus, StageReadiness } from '../shared/types'
import { Frame } from '../src/components/Frame'
import { consoleStore, resetConsoleStore } from '../src/stores/consoleStore'

const renders = { sidebar: 0, chat: 0 }

vi.mock('../src/components/LifecycleStrip', () => ({
  LifecycleStrip: () => { renders.sidebar += 1; return <nav aria-label="Project" data-testid="strip-probe" /> },
  stripFactsFrom: () => ({ sprintId: null, ordinal: null, capabilities: null }),
}))
vi.mock('../src/components/TopBand', () => ({
  TopBand: () => <div data-topband="" />,
  OMNIBAR_PLACEHOLDER: 'a spec id, a verb, or a place',
}))
vi.mock('../src/components/ChatPanel', () => ({
  ChatPanel: () => { renders.chat += 1; return <aside data-testid="chat-probe" /> },
}))

function status(): ProjectStatus {
  return {
    projectName: 'p',
    currentPhase: '1',
    stages: [
      { id: '0', display: 'Discovery', stage_state: 'complete' },
      { id: '1', display: 'Requirements', stage_state: 'current' },
    ],
  } as unknown as ProjectStatus
}

function entry(id: string): ConsoleEntry {
  return {
    id, command: 'uv run scripts/stage_readiness.py', args: [], cwd: '/p', startedAt: '2026-10-05T00:00:00Z',
    durationMs: 10, exitCode: 0, stdout: '', stderr: '', ok: true,
  }
}

beforeEach(() => {
  resetConsoleStore()
  renders.sidebar = 0
  renders.chat = 0
  // Only the one call the readiness provider makes; the chat panel (the other bridge user in
  // Frame's subtree) is a probe here, so nothing else is needed.
  const readiness: StageReadiness = {
    ok: true, stageId: '1', name: 'requirements', display: 'Requirements', isCurrent: true,
    documents: [], findings: [], judgement: [], signOff: { status: 'pending', signedOffBy: null, completedAt: null }, ready: false,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { getStageReadiness: vi.fn().mockResolvedValue(readiness) }
})

afterEach(() => {
  // @ts-expect-error - cleaning up the test double between tests
  delete window.studio
})

function renderFrame() {
  return render(
    <Frame
      status={status()}
      projectPath="/p"
      syncState={{ kind: 'idle', lastPulledAt: null }}
      area="documents"
      actor="Matt K"
      onNavigate={() => {}}
    >
      <h2>Screen</h2>
    </Frame>,
  )
}

/** Let the provider's readiness promise settle so the baseline counts include every render the
 * mount itself causes; what follows is then attributable to the store alone. */
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

describe('Frame: a console entry re-renders the Console alone', () => {
  it('pushing entries into consoleStore does not re-render the strip or ChatPanel', async () => {
    renderFrame()
    await settle()
    const sidebarBefore = renders.sidebar
    const chatBefore = renders.chat
    expect(sidebarBefore).toBeGreaterThan(0)
    expect(chatBefore).toBeGreaterThan(0)

    act(() => {
      consoleStore.append(entry('a'))
      consoleStore.append(entry('b'))
      consoleStore.append(entry('a'))
    })
    await settle()

    expect(renders.sidebar).toBe(sidebarBefore)
    expect(renders.chat).toBe(chatBefore)
  })

  it('the Console reads the store when no consoleEntries prop is passed', async () => {
    const { container } = renderFrame()
    await settle()
    act(() => { consoleStore.append(entry('a')) })
    expect(container.querySelector('.h-64')).toBeNull()
    act(() => { consoleStore.setOpen(true) })
    const panel = container.querySelector('.h-64')
    expect(panel).not.toBeNull()
    // One row for the one entry — the store's list, not an empty prop.
    expect(panel!.textContent).not.toContain('Nothing has run yet.')
  })

  it('the Frame root carries the round-2 shell contract: --chat-width, --console-height, data-chat-hidden', async () => {
    const { container } = renderFrame()
    await settle()
    const root = container.firstElementChild as HTMLElement
    expect(root.hasAttribute('data-frame-root')).toBe(true)
    expect(root.style.getPropertyValue('--chat-width')).toBe('380px')
    expect(root.style.getPropertyValue('--console-height')).toBe('0px')
    expect(root.hasAttribute('data-chat-hidden')).toBe(false)
    act(() => { consoleStore.setOpen(true) })
    await settle()
    expect(root.style.getPropertyValue('--console-height')).toMatch(/^\d+px$/)
    expect(root.style.getPropertyValue('--console-height')).not.toBe('0px')
    act(() => { consoleStore.setOpen(false) })
    await settle()
    expect(root.style.getPropertyValue('--console-height')).toBe('0px')
  })

  it('keeps the shell shape: skip link first, main#main tabIndex -1, exactly two asides in order', async () => {
    const { container } = renderFrame()
    await settle()
    const root = container.firstElementChild!
    const skip = root.firstElementChild as HTMLAnchorElement
    expect(skip.tagName).toBe('A')
    expect(skip.getAttribute('href')).toBe('#main')
    const main = container.querySelector('main#main')!
    expect(main.getAttribute('tabindex')).toBe('-1')
    expect(main.className).toBe('min-w-0 flex-1 overflow-auto p-6')
    expect(main.firstElementChild?.tagName).toBe('H2')
    // Two asides, band then chat: the strip's probe sits inside the first.
    const asides = Array.from(container.querySelectorAll('aside'))
    expect(asides.map((a) => a.dataset.testid)).toEqual(['shell-band', 'chat-probe'])
    expect(asides[0].querySelector('[data-testid="strip-probe"]')).not.toBeNull()
    expect(screen.getByText('Screen')).toBeTruthy()
  })
})
