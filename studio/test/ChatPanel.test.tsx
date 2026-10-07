// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectingSteps } from '../src/chatConnectingSteps'
import { ChatPanel, errorNamesTheFailure } from '../src/components/ChatPanel'
import { StageReadinessProvider } from '../src/components/StageReadinessContext'
import type { ChatState, ChatTurnResult, ProjectStatus, StageReadiness } from '../shared/types'

/** ChatPanel now reads its readiness from spec 0019's shared context (Frame.tsx wraps it in
 * `StageReadinessProvider` in the real app) rather than fetching its own — so every render here
 * needs the same wrapper. Takes the `<ChatPanel .../>` element as-is (so every existing call site
 * below only needed `render(` -> `renderChatPanel(` / `rerender(` -> stays the same, since the
 * returned `rerender` wraps itself) and keys the Provider off the SAME projectPath/stageId props
 * the element itself was given, falling back to a harmless default only for the one test that
 * renders with `projectPath={null}` (the placeholder path, which never reads the context's
 * value — see ChatPanel.tsx's own early return, right after its unconditional `useStageReadiness()`
 * call). `window.studio.getStageReadiness` is whatever `installStudioMock()` already set up per
 * test, same mock, just now called by the Provider instead of by ChatPanel directly. */
function renderChatPanel(element: ReactElement<{ projectPath: string | null; stageId: string | null }>) {
  const wrap = (el: typeof element) => (
    <StageReadinessProvider projectPath={el.props.projectPath ?? '/p'} stageId={el.props.stageId ?? undefined}>
      {el}
    </StageReadinessProvider>
  )
  const result = render(wrap(element))
  return {
    ...result,
    rerender: (nextElement: typeof element) => result.rerender(wrap(nextElement)),
  }
}

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
    onChatActivity: vi.fn().mockReturnValue(() => {}),
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
    renderChatPanel(<ChatPanel status={null} projectPath={null} actor="" stageId={null} />)
    expect(screen.getByText('Can see: nothing yet — open a project first.')).toBeTruthy()
  })

  it('shows a "loading" message, never a blank line, when a project/stage ARE open but status has not arrived yet', () => {
    installStudioMock()
    renderChatPanel(<ChatPanel status={null} projectPath="/p" actor="" stageId="0" />)
    expect(screen.getByText('Can see: loading…')).toBeTruthy()
    // The literal bug this regresses: an empty string after "Can see: ".
    expect(screen.queryByText('Can see:')).toBeNull()
  })

  it('shows the project and stage once status has loaded', () => {
    installStudioMock()
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy()
  })

  it('finding #2: shows the real status line when status HAS loaded even though no stage is current (e.g. every stage signed off) — status takes precedence over projectOpen, never the "open a project first" placeholder for a project that is demonstrably already open', () => {
    installStudioMock()
    // Frame.tsx's currentStageId can be undefined once every stage is signed off, so stageId
    // reaches ChatPanel as null even though `status` is fully loaded — the exact FeatureComplete
    // scenario this regresses.
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId={null} />)
    expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy()
    expect(screen.queryByText('Can see: nothing yet — open a project first.')).toBeNull()
  })
})

describe('ChatPanel — item 7: actor is dropped from the three calls that never used it, kept (and normalized) on resolveChatProposal', () => {
  it('ensureChatStarted, sendChatMessage and answerChatQuestion are called with NO actor argument', async () => {
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()), // no messages -> ensureChatStarted runs
      ensureChatStarted: vi.fn().mockResolvedValue({ ok: true, state: emptyState() }),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)
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
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
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

    const { rerender } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="old" />)
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

    const { rerender } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="old" />)
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
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)
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
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)

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
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="matt" stageId="0" />)

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

    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

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
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

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
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

    // Before the fix this hangs forever on the connecting checklist — no composer, no message
    // list, no error — strictly worse than the pre-spec-0018 behaviour.
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    expect(screen.queryByTestId('connecting-checklist')).toBeNull()
    expect(screen.getByText('ENOENT: file deleted mid-read')).toBeTruthy()
  })
})

describe('ChatPanel — finding #4 (PR #76 round 2): getChatState() itself rejecting outright reaches a sane, non-contradictory terminal UI', () => {
  it('does not show "Starting the conversation…" forever once settled, and shows the error', async () => {
    installStudioMock({
      getChatState: vi.fn().mockRejectedValue(new Error('disk read failed mid-request')),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

    await waitFor(() => expect(screen.getByText('disk read failed mid-request')).toBeTruthy())
    // The literal bug: `state` stayed null forever, so ChatMessageList's unconditional
    // `state === null` check kept rendering this — permanently, right next to the error banner
    // saying the assistant could not start, with no way to tell it had actually, definitively
    // failed rather than still being in progress.
    expect(screen.queryByText('Starting the conversation…')).toBeNull()
  })
})

describe('ChatPanel — finding (PR #76 round 3, CI correctness-review): ensureChatStarted() rejecting leaves `busy` stuck, keeping the composer disabled forever', () => {
  it('re-enables the composer and shows the error when ensureChatStarted rejects', async () => {
    installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()), // no messages -> ensureChatStarted runs
      ensureChatStarted: vi.fn().mockRejectedValue(new Error('the model call timed out')),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)

    // Before the fix: `busy` was set true right before awaiting ensureChatStarted, and the
    // catch block that handles its rejection never reset it — the composer (disabled={busy})
    // stayed disabled forever, even once the error below was showing.
    await waitFor(() => expect(screen.getByText('the model call timed out')).toBeTruthy())
    expect((screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement).disabled).toBe(false)
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

  it('finding #3: "Reading <project>" becomes done as soon as readiness resolves successfully, even when chat state has NOT arrived yet — the opposite resolution order from the mixed-order component test above, which always resolves chat state first and so could never discriminate this', () => {
    const steps = connectingSteps(/* state */ null, emptyReadiness(), /* chatSettled */ false, status(), null)
    expect(steps[1].done).toBe(true)
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
    const { container } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    // S9: the filename is a Chip (an identifier, once), the label is the sentence around it.
    await waitFor(() => expect(screen.getByTestId('chat-helping-with').textContent).toBe('epics.md'))
    expect(screen.getByText(/^Helping with:/).textContent).toBe('Helping with: epics.md')
    expect(screen.getByTestId('chat-helping-with').className).toContain('rounded-full')
    const aside = container.querySelector('aside')!
    expect(aside.textContent!.split('epics.md').length - 1).toBe(1)
  })

  it('falls back to the generic "Can see" subtitle when the current step is Sign-off, not a document', async () => {
    installStudioMock() // default readiness has no documents -> the trailing Sign-off step is current
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy())
    expect(screen.queryByText(/Helping with:/)).toBeNull()
  })
})

function readinessWithDoc(stageId: string, docName: string): StageReadiness {
  return {
    ok: true, stageId, name: stageId, display: stageId, isCurrent: true,
    documents: [{
      name: docName, path: docName, exists: false, folder: false, shaped: true,
      description: undefined, findingCount: 0, ready: false,
    }],
    findings: [], judgement: [],
    signOff: { status: 'pending', signedOffBy: null, completedAt: null },
    ready: false,
  }
}

describe('ChatPanel — finding #1: cross-panel agreement during a stage switch', () => {
  it('keeps showing the OLD stage\'s document name while the NEW stage\'s own readiness fetch is still in flight, instead of resetting to a neutral subtitle (matches StageHome/WorkflowTab\'s own stale-but-valid convention)', async () => {
    let resolveNewReadiness: (r: StageReadiness) => void = () => {}
    const newReadinessPromise = new Promise<StageReadiness>((resolve) => { resolveNewReadiness = resolve })

    installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()),
      getStageReadiness: vi.fn().mockImplementation((_projectPath: string, stageId?: string) => (
        stageId === 'new' ? newReadinessPromise : Promise.resolve(readinessWithDoc('old', 'old-doc.md'))
      )),
    })

    const { rerender } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="old" />)
    const helpingWith = () => screen.getByTestId('chat-helping-with').textContent
    await waitFor(() => expect(helpingWith()).toBe('old-doc.md'))

    rerender(<ChatPanel status={status()} projectPath="/p" actor="" stageId="new" />)

    // StageReadinessContext never nulls `readiness` on a switch (by design) — the document panel
    // (StageHome/WorkflowTab) keeps showing the OLD stage's content until the new fetch resolves.
    // The chat header must agree, not revert to the generic "Can see" line while the real document
    // panel beside it is still showing `old-doc.md`.
    expect(helpingWith()).toBe('old-doc.md')

    await act(async () => { resolveNewReadiness(readinessWithDoc('new', 'new-doc.md')) })
    await waitFor(() => expect(helpingWith()).toBe('new-doc.md'))
  })
})

describe('ChatPanel — S9: the empty and the failed conversation read from the top of the list', () => {
  it('an already-started stage renders the sentence, then the hint, then stage · read-only, as the FIRST thing in the list region, above the composer', async () => {
    installStudioMock({ getStageReadiness: vi.fn().mockResolvedValue(readinessWithDoc('0', 'constitution.md')) })
    const { container } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    const empty = screen.getByTestId('chat-empty-state')
    // At the top: the first child of the scrolling list, not pinned to its floor.
    expect(empty.parentElement!.firstElementChild).toBe(empty)
    // Above the composer in DOM order.
    const composer = screen.getByPlaceholderText('Type a message…')
    expect(empty.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The pinned sentence pair reads as one run (chatAuthoring's regex), the hint directly after.
    expect(empty.textContent).toMatch(/already started\. Ask a question/)
    expect(screen.getByTestId('chat-empty-facts').textContent).toBe('0 · read-only until you accept a proposal')
    // The document's name appears once in the whole aside — in the header's Chip.
    expect(container.querySelector('aside')!.textContent!.split('constitution.md').length - 1).toBe(1)
    expect(container.querySelectorAll('aside li')).toHaveLength(0)
  })

  /** v13 fixer round: every screen with the chat open led with "The assistant could not start.
   * The assistant could not respond. Type a message…" — the fixed title AND a host sentence that
   * already named the failure. One failure sentence: a host error that names it stands alone (in
   * ink-2); a raw host message keeps the title before it (the pinned case below). Retry re-runs
   * the start, so the hint is still true and the button is quicker. */
  it('a host error that already names the failure is said once, and Retry re-runs the start', async () => {
    const studio = installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()),
      ensureChatStarted: vi.fn().mockResolvedValue({ ok: false, state: emptyState(), error: 'The assistant could not respond.' } satisfies ChatTurnResult),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByTestId('chat-start-error')).toBeTruthy())
    const empty = screen.getByTestId('chat-empty-state')
    const text = empty.textContent ?? ''
    expect(text.split('The assistant could not').length - 1).toBe(1)
    expect(text).not.toContain('could not start')
    expect(text).toContain('The assistant could not respond. Type a message to try again')
    expect(screen.getByTestId('chat-start-error').className).toContain('text-ink-2')
    expect(errorNamesTheFailure('The assistant could not respond.')).toBe(true)
    expect(errorNamesTheFailure('claude: not signed in')).toBe(false)
    expect(studio.ensureChatStarted).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('chat-retry-start'))
    await waitFor(() => expect(studio.ensureChatStarted).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failed start states the failure, the host\'s words in their own span, and the retry hint — once, inside the card', async () => {
    installStudioMock({
      getChatState: vi.fn().mockResolvedValue(emptyState()),
      ensureChatStarted: vi.fn().mockResolvedValue({ ok: false, state: emptyState(), error: 'claude: not signed in' } satisfies ChatTurnResult),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByText('claude: not signed in')).toBeTruthy())
    const empty = screen.getByTestId('chat-empty-state')
    expect(empty.textContent).toContain('The assistant could not start.')
    expect(empty.textContent).toContain('Type a message to try again')
    expect(screen.getByText('claude: not signed in').closest('[data-testid="chat-empty-state"]')).toBe(empty)
    // No second red strip under an empty thread.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the Stop reason is said in plain words and the quick replies use the accent-text tokens', async () => {
    const pending: ChatState = {
      sessionId: 's',
      messages: [{ id: 'm1', role: 'assistant', text: 'Pick one:', questions: [{ id: 'q1', question: 'Which?', options: ['A'] }], proposals: [], at: new Date().toISOString() }],
    }
    let resolveSend: (r: ChatTurnResult) => void = () => {}
    installStudioMock({
      getChatState: vi.fn().mockResolvedValue(pending),
      sendChatMessage: vi.fn().mockImplementation(() => new Promise<ChatTurnResult>((r) => { resolveSend = r })),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'A' })).toBeTruthy())
    const pill = screen.getByRole('button', { name: 'A' })
    expect(pill.className).toContain('text-accent-text')
    expect(pill.className).not.toContain('bg-white')
    expect(pill.className).toContain('rounded-full')
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send' })) })
    const stop = screen.getByRole('button', { name: /^Stop/ })
    expect(stop.textContent).toContain('Stopping a reply is not available yet')
    expect(stop.textContent).not.toMatch(/Batch|F15/)
    await act(async () => { resolveSend({ ok: true, state: pending }) })
  })
})

describe('ChatPanel — finding #5 (PR #76 round 2): the same mobile height cap Sidebar.tsx already has', () => {
  it('bounds its own height below `sm` (two stacked siblings now share the budget with Sidebar\'s own 50vh cap), and lifts the bound again at `sm:`+', () => {
    installStudioMock()
    const { container } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    const aside = container.querySelector('aside')
    expect(aside).not.toBeNull()
    // Sidebar.tsx's own fix used `max-h-[50vh] sm:max-h-none` for a SINGLE capped sibling. With
    // ChatPanel now also capped, giving it the same 50vh would let Sidebar (50vh) + ChatPanel
    // (50vh) sum to the full viewport height in the worst case, squeezing the main document panel
    // — spec 0018's actual reason for existing on this screen — down to nothing. ChatPanel gets a
    // smaller share (35vh) so the two capped siblings can never together exceed 85vh, always
    // leaving the document panel real room.
    expect(aside!.className).toMatch(/\bmax-h-\[35vh\]/)
    expect(aside!.className).toMatch(/\bsm:max-h-none\b/)
  })
})

describe('ChatPanel — a running turn shows what the assistant is doing, not a bare "Thinking…"', () => {
  it('shows the live activity line (with a running clock) while a turn is in flight, and removes it when the reply lands', async () => {
    let resolveSend: (r: ChatTurnResult) => void = () => {}
    const sendPromise = new Promise<ChatTurnResult>((resolve) => { resolveSend = resolve })
    const existing: ChatState = {
      sessionId: 's', messages: [{ id: 'a1', role: 'assistant', text: 'hi', questions: [], proposals: [], at: '' }],
    }
    let emit: (a: { projectPath: string; stageId: string; label: string }) => void = () => {}
    installStudioMock({
      getChatState: vi.fn().mockResolvedValue(existing),
      sendChatMessage: vi.fn().mockImplementation(() => sendPromise),
      onChatActivity: vi.fn().mockImplementation((cb: typeof emit) => { emit = cb; return () => {} }),
    })
    renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    expect(screen.queryByTestId('chat-activity')).toBeNull()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello')
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Send' })) })

    expect(screen.getByTestId('chat-activity').textContent).toBe('Thinking… 0s')
    act(() => emit({ projectPath: '/p', stageId: '0', label: 'Reading requirements.md' }))
    expect(screen.getByTestId('chat-activity').textContent).toMatch(/^Reading requirements\.md… \d+s$/)

    await act(async () => { resolveSend({ ok: true, state: existing }) })
    expect(screen.queryByTestId('chat-activity')).toBeNull()
  })
})

describe('ChatPanel — replies are drawn as formatted text, and the panel can be widened', () => {
  const at = new Date().toISOString()
  const markdownReply = "**It's cheaper.** About $11.68/month.\n\n- first point\n- second point"

  function stateWith(messages: Array<{ role: 'assistant' | 'user' | 'subagent'; text: string }>): ChatState {
    return {
      sessionId: 's',
      messages: messages.map((m, i) => ({ id: `m${i}`, role: m.role, text: m.text, questions: [], proposals: [], at })),
    }
  }

  async function renderWith(messages: Array<{ role: 'assistant' | 'user' | 'subagent'; text: string }>) {
    installStudioMock({ getChatState: vi.fn().mockResolvedValue(stateWith(messages)) })
    const view = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
    await waitFor(() => expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy())
    return view
  }

  it('shows an assistant reply\'s bold and bullets as formatting, never as raw asterisks and dashes', async () => {
    const { container } = await renderWith([{ role: 'assistant', text: markdownReply }])
    expect(container.querySelector('strong')?.textContent).toBe("It's cheaper.")
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.textContent).not.toContain('**')
  })

  it('formats a sub-agent\'s reply the same way', async () => {
    const { container } = await renderWith([{ role: 'subagent', text: markdownReply }])
    expect(container.querySelector('strong')).not.toBeNull()
  })

  it('leaves what the PERSON typed exactly as typed — their asterisks are theirs', async () => {
    const { container } = await renderWith([{ role: 'user', text: '**not bold**' }])
    expect(container.querySelector('strong')).toBeNull()
    expect(screen.getByText('**not bold**')).toBeTruthy()
  })

  it('treats model output as untrusted: raw HTML is dropped and a link never becomes an anchor', async () => {
    const { container } = await renderWith([{ role: 'assistant', text: 'hi <script>window.pwned = 1</script><img src="http://evil.example/x.png"> [click](http://evil.example)' }])
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('click')).toBeTruthy()
  })

  it('starts at the default width, and a resize by keyboard changes it and is remembered', async () => {
    localStorage.clear()
    const { container } = await renderWith([{ role: 'assistant', text: 'hello' }])
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.getPropertyValue('--chat-width')).toBe('380px')

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect(aside.style.getPropertyValue('--chat-width')).toBe('404px')
    expect(localStorage.getItem('studio.chatWidth')).toBe('404')
    localStorage.clear()
  })

  it('opens at the width the person left it at', async () => {
    localStorage.setItem('studio.chatWidth', '520')
    const { container } = await renderWith([{ role: 'assistant', text: 'hello' }])
    expect((container.querySelector('aside') as HTMLElement).style.getPropertyValue('--chat-width')).toBe('520px')
    localStorage.clear()
  })
})

describe('ChatPanel — Rules of Hooks across the placeholder boundary', () => {
  it('survives stageId → null → stageId on the same fiber without a hook-order error (useRegisterDirty sits above the early return)', async () => {
    installStudioMock()
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => { errors.push(e.error ?? e.message); e.preventDefault() }
    window.addEventListener('error', onError)
    try {
      // Frame renders `<MemoChatPanel stageId={stageId ?? null}>` with no key, so this is the
      // exact transition the app performs when `currentStageId` becomes undefined and back.
      const { rerender } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" />)
      expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy()
      rerender(<ChatPanel status={status()} projectPath="/p" actor="" stageId={null} />)
      expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy()
      rerender(<ChatPanel status={status()} projectPath="/p" actor="" stageId="1" />)
      await waitFor(() => expect(screen.getByText('Can see: demo, Discovery.')).toBeTruthy())
      expect(errors).toEqual([])
    } finally {
      window.removeEventListener('error', onError)
    }
  })
})

describe('ChatPanel — collapsed to its rail (owner\'s v12 item 1)', () => {
  it('stays an <aside> with one "Open the chat" control, the thread hidden but mounted, and no Chat heading in the rail', async () => {
    installStudioMock()
    const onExpand = vi.fn()
    const { container } = renderChatPanel(<ChatPanel status={status()} projectPath="/p" actor="" stageId="0" collapsed onExpand={onExpand} />)
    await waitFor(() => expect(window.studio.getChatState).toHaveBeenCalled())
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.hasAttribute('data-chat-collapsed')).toBe(true)
    expect(aside.className).toMatch(/\bsm:!w-10\b/)
    expect(aside.className).toMatch(/\bmax-h-\[35vh\]/)
    // The inner wrapper is hidden, never gone: the composer and thread survive the fold.
    const inner = aside.querySelector('[data-chat-inner]') as HTMLElement
    expect(inner.className).toContain('hidden')
    expect(container.querySelector('[role="separator"]')).toBeNull()
    const open = screen.getByRole('button', { name: 'Open the chat' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(open)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('without a project the placeholder folds the same way; open again, the handle and the heading return', () => {
    installStudioMock()
    const { container, rerender } = renderChatPanel(<ChatPanel status={null} projectPath={null} actor="" stageId={null} collapsed onExpand={vi.fn()} />)
    expect(container.querySelector('aside')?.hasAttribute('data-chat-collapsed')).toBe(true)
    expect(screen.getByRole('button', { name: 'Open the chat' })).toBeTruthy()
    rerender(<ChatPanel status={null} projectPath={null} actor="" stageId={null} collapsed={false} />)
    expect(container.querySelector('aside')?.hasAttribute('data-chat-collapsed')).toBe(false)
    expect(container.querySelector('aside')?.className).toMatch(/sm:w-\[var\(--chat-width\)\]/)
    expect(screen.queryByRole('button', { name: 'Open the chat' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy()
  })
})
