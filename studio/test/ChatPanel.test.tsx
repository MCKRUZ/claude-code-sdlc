// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPanel } from '../src/components/ChatPanel'
import type { ChatState, ChatTurnResult, ProjectStatus } from '../shared/types'

function emptyState(): ChatState {
  return { sessionId: null, messages: [] }
}

function status(): ProjectStatus {
  return {
    project_name: 'demo',
    profile_id: 'p',
    current_phase: { id: '0', display: 'Discovery' },
    stages: [],
  }
}

/** A minimal, controllable stand-in for window.studio (electron/preload/index.ts's own
 * contract) — each test wires the handful of calls it needs and leaves the rest as
 * never-resolving stubs, so a component bug (a call that should not have happened) fails
 * loudly rather than silently resolving through a shared catch-all mock. */
function installStudioMock(overrides: Partial<typeof window.studio> = {}) {
  const studio = {
    getChatState: vi.fn().mockResolvedValue(emptyState()),
    ensureChatStarted: vi.fn().mockResolvedValue({ ok: true, state: emptyState() } satisfies ChatTurnResult),
    sendChatMessage: vi.fn().mockResolvedValue({ ok: true, state: emptyState() } satisfies ChatTurnResult),
    answerChatQuestion: vi.fn().mockResolvedValue({ ok: true, state: emptyState() } satisfies ChatTurnResult),
    resolveChatProposal: vi.fn().mockResolvedValue({ ok: true, state: emptyState() } satisfies ChatTurnResult),
    ...overrides,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  // @ts-expect-error - cleaning up the test double between tests
  delete window.studio
})

describe('ChatPanel — item 8: the "Can see" status line always has real text', () => {
  it('shows a real placeholder message, never "Can see: " with nothing after it, when no project/stage is open', () => {
    installStudioMock()
    render(<ChatPanel status={null} projectPath={null} actor="" stageId={null} />)
    expect(screen.getByText('Can see: nothing yet — open a project first.')).toBeTruthy()
  })

  it('shows a "loading" message, never a blank line, when a project/stage ARE open but status has not arrived yet', () => {
    installStudioMock()
    render(<ChatPanel status={null} projectPath="/p" actor="" stageId="0" />)
    expect(screen.getByText('Can see: loading…')).toBeTruthy()
    // The literal bug this regresses: an empty string after "Can see: ".
    expect(screen.queryByText('Can see:')).toBeNull()
  })

  it('shows the project and stage once status has loaded', () => {
    installStudioMock()
    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy()
  })
})

describe('ChatPanel — item 7: actor is dropped from the three calls that never used it, kept (and normalized) on resolveChatProposal', () => {
  it('ensureChatStarted, sendChatMessage and answerChatQuestion are called with NO actor argument', async () => {
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()), // no messages -> ensureChatStarted runs
      ensureChatStarted: vi.fn().mockResolvedValue({ ok: true, state: emptyState() }),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)
    await waitFor(() => expect(studio.ensureChatStarted).toHaveBeenCalled())
    expect(studio.ensureChatStarted).toHaveBeenCalledWith('/p', '0')

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send' })) })
    expect(studio.sendChatMessage).toHaveBeenCalledWith('/p', '0', 'hello')
  })

  it('resolveChatProposal normalizes an empty actor to "unknown" (matching FieldEditor.tsx\'s own pattern), never a raw empty string', async () => {
    const proposalState: ChatState = {
      sessionId: 's', messages: [{
        id: 'm1', role: 'assistant', text: '', questions: [],
        proposals: [{ id: 'p1', document: 'd.md', section: 'S', field: 'F', value: 'V' }],
        at: new Date().toISOString(),
      }],
    }
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(proposalState),
      resolveChatProposal: vi.fn().mockResolvedValue({ ok: true, state: proposalState }),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy())

    const user = userEvent.setup()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Accept' })) })
    expect(studio.resolveChatProposal).toHaveBeenCalledWith('/p', '0', 'p1', 'accepted', 'V', 'unknown')
  })
})

describe('ChatPanel — item 2: busy resets on stage switch, and a stale reply for the OLD stage is ignored', () => {
  it('switching stages while ensureChatStarted is still in flight for the old stage does not leave the composer stuck disabled', async () => {
    let resolveOldGreet: (r: ChatTurnResult) => void = () => {}
    const oldGreetPromise = new Promise<ChatTurnResult>((resolve) => { resolveOldGreet = resolve })

    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()),
      ensureChatStarted: vi.fn().mockImplementation((_projectPath: string, stageId: string) => (
        stageId === 'old' ? oldGreetPromise : Promise.resolve({ ok: true, state: emptyState() })
      )),
    })
    void studio

    const { rerender } = render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="old" />)
    // The old stage is now busy (auto-greeting, awaiting the never-yet-resolved promise).
    // `busy` flips to true inside the mount effect, not synchronously with the textarea's own
    // first render — so this needs its own wait, not a bare assertion right after the element
    // merely exists. A CI runner slow enough to observe the gap between "element rendered" and
    // "effect ran" (macOS's, in practice) fails a synchronous check here even though the real
    // behavior is correct.
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    await waitFor(() => {
      expect((screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement).disabled).toBe(true)
    })

    // Navigate to a new stage BEFORE the old stage's greet resolves.
    rerender(<ChatPanel status={status()} projectPath="/p" actor="" stageId="new" />)

    // The composer must not stay disabled forever just because the OLD stage's request is
    // still pending — this is the literal bug: busy was never reset on stage change.
    await waitFor(() => {
      expect((screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement).disabled).toBe(false)
    })

    // Now let the stale old-stage reply arrive late. It must not resurrect busy=true (or any
    // other state change) for the stage the person already left.
    await act(async () => { resolveOldGreet({ ok: true, state: emptyState() }) })
    await new Promise((r) => setTimeout(r, 0))
    expect((screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement).disabled).toBe(false)
  })
})

describe('ChatPanel — item 1: a failed send does not lose the person\'s own message', () => {
  it('renders the leading (now-persisted) user message AND the error, rather than showing nothing for the failed turn', async () => {
    const stateAfterFailure: ChatState = {
      sessionId: null,
      messages: [{ id: 'u1', role: 'user', text: 'my message', questions: [], proposals: [], at: new Date().toISOString() }],
    }
    installStudioMock({
      getChatState: vi.fn().mockResolvedValue({ ...emptyState(), messages: [{ id: 'x', role: 'assistant', text: 'hi', questions: [], proposals: [], at: '' }] }),
      sendChatMessage: vi.fn().mockResolvedValue({ ok: false, state: stateAfterFailure, error: 'the model call failed' } satisfies ChatTurnResult),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)
    await waitFor(() => expect(screen.getByText('hi')).toBeTruthy())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Type a message…'), 'my message')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send' })) })

    // The message the person sent is visible — not silently dropped because the turn failed.
    expect(screen.getByText('my message')).toBeTruthy()
    expect(screen.getByText('the model call failed')).toBeTruthy()
    // The input was cleared on send (existing optimistic-clear behaviour) and stays cleared —
    // the message is shown as SENT (in the transcript), not restored to the box as if it never
    // went anywhere.
    expect((screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('ChatPanel — item 3: multiple proposals/questions in one message each render and resolve independently', () => {
  it('renders two proposal cards from the same message, and accepting one leaves the other pending', async () => {
    const twoProposals: ChatState = {
      sessionId: 's',
      messages: [{
        id: 'm1', role: 'assistant', text: '', questions: [],
        proposals: [
          { id: 'p1', document: 'd.md', section: 'S1', field: 'F1', value: 'V1' },
          { id: 'p2', document: 'd.md', section: 'S2', field: 'F2', value: 'V2' },
        ],
        at: new Date().toISOString(),
      }],
    }
    const afterAccept: ChatState = {
      ...twoProposals,
      messages: [{
        ...twoProposals.messages[0],
        proposals: [
          { ...twoProposals.messages[0].proposals[0], outcome: 'accepted' },
          twoProposals.messages[0].proposals[1],
        ],
      }],
    }
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(twoProposals),
      resolveChatProposal: vi.fn().mockResolvedValue({ ok: true, state: afterAccept }),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(2))
    const user = userEvent.setup()
    await act(async () => { await user.click(screen.getAllByRole('button', { name: 'Accept' })[0]) })

    expect(studio.resolveChatProposal).toHaveBeenCalledWith('/p', '0', 'p1', 'accepted', 'V1', 'matt')
    // p2's own card is still pending (rendered with its own live Accept button), independent
    // of p1's resolution — proving the two are addressed and resolved separately, not as one
    // shared "the message's proposal" the old singular field modeled them as.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1))
  })

  it('renders two structured questions from the same message, each with its own options', async () => {
    const twoQuestions: ChatState = {
      sessionId: 's',
      messages: [{
        id: 'm1', role: 'assistant', text: '', proposals: [],
        questions: [
          { id: 'q1', question: 'Q1?', options: ['A', 'B'] },
          { id: 'q2', question: 'Q2?', options: ['C', 'D'] },
        ],
        at: new Date().toISOString(),
      }],
    }
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(twoQuestions),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)

    await waitFor(() => {
      expect(screen.getByText('Q1?')).toBeTruthy()
      expect(screen.getByText('Q2?')).toBeTruthy()
    })
    const user = userEvent.setup()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'A' })) })
    expect(studio.answerChatQuestion).toHaveBeenCalledWith('/p', '0', 'q1', 'A')
  })
})
