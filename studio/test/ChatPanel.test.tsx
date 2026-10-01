// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectingSteps } from '../src/chatConnectingSteps'
import { ChatPanel } from '../src/components/ChatPanel'
import type { ChatState, ChatTurnResult, ProjectStatus, StageReadiness } from '../shared/types'

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

/** The default readiness a test gets when it does not care about it: no documents at all, so
 * `computeWorkflowSteps` lands on the trailing Sign-off step — never a document — and the
 * connecting checklist's "Reading <project>" / header's "Helping with: <doc>" stay out of every
 * pre-existing assertion that was written before spec 0018 added this call. */
function emptyReadiness(): StageReadiness {
  return {
    ok: true, stageId: '0', name: 'discovery', display: 'Discovery', isCurrent: true,
    documents: [], findings: [], judgement: [],
    signOff: { status: 'pending', signedOffBy: null, completedAt: null },
    ready: true,
  }
}

/** A minimal, controllable stand-in for window.studio (electron/preload/index.ts's own
 * contract) — each test wires the handful of calls it needs and leaves the rest as
 * never-resolving stubs, so a component bug (a call that should not have happened) fails
 * loudly rather than silently resolving through a shared catch-all mock. */
function installStudioMock(overrides: Partial<typeof window.studio> = {}) {
  const studio = {
    getChatState: vi.fn().mockResolvedValue(emptyState()),
    getStageReadiness: vi.fn().mockResolvedValue(emptyReadiness()),
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
    // The composer only renders once initializing has fully settled (spec 0018) — having been
    // CALLED is not the same as having RESOLVED.
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())

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
  it('switching stages while ensureChatStarted is still in flight for the old stage does not leave the new stage stuck on the connecting checklist', async () => {
    // Spec 0018 rewrite: the symptom this regression used to show as ("the composer stays
    // disabled forever") is now "the connecting checklist never finishes" — `initializing` is
    // the state that used to leak across a stage switch (via `busy`); the checklist is what
    // visibly proves it was reset, the same way the disabled textarea used to.
    let resolveOldGreet: (r: ChatTurnResult) => void = () => {}
    const oldGreetPromise = new Promise<ChatTurnResult>((resolve) => { resolveOldGreet = resolve })

    installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()),
      ensureChatStarted: vi.fn().mockImplementation((_projectPath: string, stageId: string) => (
        stageId === 'old' ? oldGreetPromise : Promise.resolve({ ok: true, state: emptyState() })
      )),
    })

    const { rerender } = render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="old" />)
    // 'old' is stuck connecting — its own ensureChatStarted never resolves — so the checklist
    // stays up and the composer never appears for it.
    await waitFor(() => expect(screen.getByTestId('connecting-checklist')).toBeTruthy())
    expect(screen.queryByPlaceholderText('Type a message…')).toBeNull()

    // Navigate to a new stage BEFORE the old stage's greet resolves.
    rerender(<ChatPanel status={status()} projectPath="/p" actor="" stageId="new" />)

    // The new stage must still reach ready — this is the literal bug: it must not be held
    // hostage by the OLD stage's never-resolving request.
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    expect(screen.queryByTestId('connecting-checklist')).toBeNull()

    // Now let the stale old-stage reply arrive late. It must not resurrect the connecting
    // checklist (or any other state change) for the stage the person already left.
    await act(async () => { resolveOldGreet({ ok: true, state: emptyState() }) })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy()
    expect(screen.queryByTestId('connecting-checklist')).toBeNull()
  })

  it('a stale sendChatMessage reply for the OLD stage, arriving after the person switched stages, is never applied', async () => {
    // Caught by CI's automated correctness review: unlike the mount effect above (which already
    // had a `cancelled` guard), submit/answer/resolveProposal had none at all — a reply for a
    // stage the person already navigated away from would still overwrite whatever is on screen.
    let resolveOldSend: (r: ChatTurnResult) => void = () => {}
    const oldSendPromise = new Promise<ChatTurnResult>((resolve) => { resolveOldSend = resolve })
    const staleReply: ChatTurnResult = {
      ok: true,
      state: { sessionId: 's', messages: [{ id: 'stale', role: 'assistant', text: 'STALE-OLD-REPLY', questions: [], proposals: [], at: new Date().toISOString() }] },
    }
    const newStageState: ChatState = {
      sessionId: 's2', messages: [{ id: 'n1', role: 'assistant', text: 'NEW-STAGE-CONTENT', questions: [], proposals: [], at: new Date().toISOString() }],
    }

    installStudioMock({
      getChatState: vi.fn().mockImplementation((_projectPath: string, stageId: string) => (
        Promise.resolve(stageId === 'new' ? newStageState : emptyState())
      )),
      sendChatMessage: vi.fn().mockImplementation(() => oldSendPromise),
    })

    const { rerender } = render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="old" />)
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send' })) })

    // Navigate to a new stage BEFORE the old stage's send reply comes back.
    rerender(<ChatPanel status={status()} projectPath="/p" actor="" stageId="new" />)
    await waitFor(() => expect(screen.getByText('NEW-STAGE-CONTENT')).toBeTruthy())

    // Now the stale reply for "old" finally arrives. It must never reach the screen.
    await act(async () => { resolveOldSend(staleReply) })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('STALE-OLD-REPLY')).toBeNull()
    expect(screen.getByText('NEW-STAGE-CONTENT')).toBeTruthy()
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

describe('ChatPanel — spec 0018: the connecting checklist renders a named sequence, each item driven by a real signal', () => {
  it('each named step becomes done in the order its own real call resolves — never a timer', async () => {
    let resolveChatState: (s: ChatState) => void = () => {}
    const chatStatePromise = new Promise<ChatState>((resolve) => { resolveChatState = resolve })
    let resolveReadiness: (r: StageReadiness) => void = () => {}
    const readinessPromise = new Promise<StageReadiness>((resolve) => { resolveReadiness = resolve })
    let resolveGreet: (r: ChatTurnResult) => void = () => {}
    const greetPromise = new Promise<ChatTurnResult>((resolve) => { resolveGreet = resolve })

    installStudioMock({
      getChatState: vi.fn().mockReturnValue(chatStatePromise),
      getStageReadiness: vi.fn().mockReturnValue(readinessPromise),
      ensureChatStarted: vi.fn().mockReturnValue(greetPromise),
    })

    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

    const stepDone = (label: string) => (
      screen.getByText(label).closest('[data-testid="connecting-step"]')!.getAttribute('data-step-done')
    )
    await waitFor(() => expect(screen.getByTestId('connecting-checklist')).toBeTruthy())
    expect(stepDone('Connecting to Claude Code')).toBe('false')
    expect(stepDone('Reading demo')).toBe('false')
    expect(stepDone('Loading the current file')).toBe('false')

    // getChatState resolves first, with no prior messages, so ensureChatStarted is now in
    // flight — item 1 is done; items 2 and 3 are not.
    await act(async () => { resolveChatState(emptyState()) })
    await waitFor(() => expect(stepDone('Connecting to Claude Code')).toBe('true'))
    expect(stepDone('Reading demo')).toBe('false')
    expect(stepDone('Loading the current file')).toBe('false')

    // getStageReadiness resolves next (independent of the still-pending greet) — item 2 is
    // done; item 3 cannot be, since the model's own first turn has not come back yet.
    await act(async () => { resolveReadiness(emptyReadiness()) })
    await waitFor(() => expect(stepDone('Reading demo')).toBe('true'))
    expect(stepDone('Loading the current file')).toBe('false')
    expect(screen.queryByPlaceholderText('Type a message…')).toBeNull()

    // Only once the model's own first turn answers does item 3 — and readiness overall — finish.
    await act(async () => { resolveGreet({ ok: true, state: emptyState() }) })
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    expect(screen.queryByTestId('connecting-checklist')).toBeNull()
  })
})

describe('ChatPanel — spec 0018: free text stays usable even with a pending structured question', () => {
  it('quick-reply chips render inline below the message that asked, and typing something else still sends normally', async () => {
    const pendingQuestionState: ChatState = {
      sessionId: 's',
      messages: [{
        id: 'm1', role: 'assistant', text: 'Pick one:',
        questions: [{ id: 'q1', question: 'Which track?', options: ['A', 'B'] }],
        proposals: [], at: new Date().toISOString(),
      }],
    }
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(pendingQuestionState),
      sendChatMessage: vi.fn().mockResolvedValue({ ok: true, state: pendingQuestionState } satisfies ChatTurnResult),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

    await waitFor(() => expect(screen.getByText('Which track?')).toBeTruthy())
    // The chip is part of the thread — never a layout that replaces or disables the text box.
    expect(screen.getByRole('button', { name: 'A' })).toBeTruthy()
    const input = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement
    expect(input.disabled).toBe(false)

    const user = userEvent.setup()
    await user.type(input, 'something unrelated to the question')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send' })) })
    expect(studio.sendChatMessage).toHaveBeenCalledWith('/p', '0', 'something unrelated to the question')
  })
})

describe('ChatPanel — finding #2: a rejected Promise.all (e.g. a readiness read racing a TOCTOU gap) never leaves `initializing` stuck forever', () => {
  it('reaches the composer and shows an error when getStageReadiness rejects outright', async () => {
    installStudioMock({
      getStageReadiness: vi.fn().mockRejectedValue(new Error('ENOENT: file deleted mid-read')),
    })
    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

    // Before the fix this hangs forever on the connecting checklist — no composer, no message
    // list, no error — strictly worse than the pre-spec-0018 behaviour.
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    expect(screen.queryByTestId('connecting-checklist')).toBeNull()
    expect(screen.getByText('ENOENT: file deleted mid-read')).toBeTruthy()
  })
})

describe('ChatPanel — findings #3 and #4: connectingSteps\' "Loading <file>" and "Reading <project>" steps', () => {
  it('"Reading <project>" never reads done when readiness resolved but failed (finding #4 — follows currentDocumentTitle\'s own `.ok` guard)', () => {
    const failed: StageReadiness = { ...emptyReadiness(), ok: false, error: 'boom' }
    const steps = connectingSteps(emptyState(), failed, false, status(), null)
    expect(steps[1].done).toBe(false)
  })

  it('"Loading <file>" is never done while the chat flow (including any needed first turn) has not fully settled, even once readiness has (finding #3 — it must not depend on the always-true `initializing` flag)', () => {
    const steps = connectingSteps(emptyState(), emptyReadiness(), /* chatSettled */ false, status(), null)
    expect(steps[2].done).toBe(false)
  })

  it('"Loading <file>" becomes done once the chat flow has fully settled and readiness succeeded — the case the old `!initializing` condition could never reach', () => {
    const steps = connectingSteps(emptyState(), emptyReadiness(), /* chatSettled */ true, status(), null)
    expect(steps[2].done).toBe(true)
  })

  it('"Loading <file>" stays not-done once the chat flow has settled if readiness itself failed (finding #4\'s own follow-on: never silently done despite a failed read)', () => {
    const failed: StageReadiness = { ...emptyReadiness(), ok: false, error: 'boom' }
    const steps = connectingSteps(emptyState(), failed, /* chatSettled */ true, status(), null)
    expect(steps[2].done).toBe(false)
  })
})

describe('ChatPanel — spec 0018: the header names which document it is helping with', () => {
  it('shows "Helping with: <document>" once readiness names a current document, in place of the generic subtitle', async () => {
    const readiness: StageReadiness = {
      ok: true, stageId: '0', name: 'requirements', display: 'Requirements', isCurrent: true,
      documents: [{
        name: 'epics.md', path: 'epics.md', exists: false, folder: false, shaped: true,
        description: undefined, findingCount: 0, ready: false,
      }],
      findings: [], judgement: [],
      signOff: { status: 'pending', signedOffBy: null, completedAt: null },
      ready: false,
    }
    installStudioMock({ getStageReadiness: vi.fn().mockResolvedValue(readiness) })
    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByText('Helping with: epics.md')).toBeTruthy())
  })

  it('falls back to the generic "Can see" subtitle when the current step is Sign-off, not a document', async () => {
    installStudioMock() // default readiness has no documents -> the trailing Sign-off step is current
    render(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy())
    expect(screen.queryByText(/Helping with:/)).toBeNull()
  })
})
