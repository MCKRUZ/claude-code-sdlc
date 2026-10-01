import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatProposal, ChatQuestion, ChatState, ProjectStatus } from '../../shared/types'
import { connectingSteps } from '../chatConnectingSteps'
import { computeWorkflowSteps } from '../workflowSteps'
import { AiProposalCard } from './AiProposalCard'
import { ConnectingChecklist } from './ConnectingChecklist'
import { useStageReadiness } from './StageReadinessContext'

/** Present on every screen (spec 0008's own requirement) — spec 0016 wires the actual
 * conversation up, and spec 0018 scopes it to the stage's current document and makes the wait
 * before it is ready legible instead of looking identical to "ready and idle". A real, multi-turn
 * `claude` session drives a stage's documents: the assistant opens on a stage with a document not
 * yet started, structured questions render as real buttons alongside a message in the thread
 * (never gating the box below), and every proposed write is a card the person accepts, edits, or
 * discards — never a silent write. */
export function ChatPanel({
  status, projectPath, actor, stageId,
}: {
  status: ProjectStatus | null
  projectPath: string | null
  actor: string
  /** The stage this chat is scoped to — the viewed stage, or the project's current one. Null
   * when no project is open, or the project has no stages yet. */
  stageId: string | null
}) {
  const [state, setState] = useState<ChatState | null>(null)
  // The one shared getStageReadiness read for this stage (spec 0019's StageReadinessProvider,
  // which Frame.tsx wraps this panel in) — not a fetch of its own. Used only to label which
  // document this conversation is helping with (computeWorkflowSteps' own "current" rule) and
  // to gate the connecting checklist's "Reading" step; never written to.
  const { readiness: sharedReadiness, loading: readinessLoading, error: readinessError } = useStageReadiness()
  // `connectingSteps()` reads "not yet known" as `null` (see chatConnectingSteps.ts) — while the
  // shared fetch is in flight for THIS stage, present it as not-yet-known even if it still holds
  // an older stage's data (the Provider does not clear `readiness` to null on a stage switch,
  // only after the new fetch resolves), so the checklist never shows "Reading" as done before
  // the CURRENT stage's data has actually arrived.
  const readiness = readinessLoading ? null : sharedReadiness
  const [busy, setBusy] = useState(false)
  // True from mount until the connecting sequence below has fully settled for THIS stage —
  // distinct from `busy`, which also flips true/false for every ordinary turn afterward. Gates
  // which of the two states spec 0018 asks for (Connecting vs Ready) is on screen; once it drops
  // to false for a stage it never goes true again for that same stage.
  const [initializing, setInitializing] = useState(true)
  // Independent of `initializing` on purpose (finding #3): this function is only ever called
  // from INSIDE the `initializing` branch below, so `initializing` itself is always true at the
  // point it would be read — a condition built on it can never observe its own completion. This
  // flips true once the chat flow (including the model's own first turn, when one was needed)
  // has actually finished, strictly before the `Promise.all` below also flips `initializing`.
  const [chatSettled, setChatSettled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  // What stage is actually on screen right now, readable from inside a handler's async
  // continuation — a plain closure variable would only ever hold the stage the handler was
  // CALLED for, which is exactly the bug this guards: switching stages while submit/answer/
  // resolveProposal is still awaiting its reply must not apply that stale reply's state to
  // whatever stage is on screen by the time it comes back, or send the next message to the
  // session the person already navigated away from believing they're on a different one.
  const currentStageId = useRef(stageId)
  useEffect(() => { currentStageId.current = stageId }, [stageId])

  useEffect(() => {
    if (!projectPath || !stageId) {
      setState(null)
      setBusy(false)
      setInitializing(false)
      setChatSettled(false)
      return
    }
    let cancelled = false
    setState(null)
    setError(null)
    // Reset synchronously on every stage switch, not just state/error — otherwise navigating
    // away from a stage while its auto-greet is still in flight (busy=true, awaiting
    // ensureChatStarted below) leaves the NEW stage's composer permanently disabled: that
    // in-flight call's own `if (cancelled) return` guard (below) correctly skips setBusy(false)
    // for the stage it was actually for, but nothing else was ever going to reset it back.
    setBusy(false)
    setInitializing(true)
    setChatSettled(false)

    // The readiness half of "ready" is now the shared read spec 0019's StageReadinessProvider
    // already owns (see `sharedReadiness`/`readinessLoading` above) — Frame.tsx wraps this panel
    // in it alongside StageHome, so this effect only drives the CHAT half. This used to also run
    // its own independent getStageReadiness() call in parallel (a 3rd/4th redundant read for the
    // same stage on one screen, alongside StageHome's and ensureChatStarted's own internal one) —
    // that duplication is exactly what spec 0019 removed; see StageReadinessContext.tsx.
    window.studio.getChatState(projectPath, stageId).then(async (loaded) => {
      if (cancelled) return
      setState(loaded)
      if (loaded.messages.length === 0) {
        setBusy(true)
        const result = await window.studio.ensureChatStarted(projectPath, stageId)
        if (cancelled) return // a stale reply for a stage the person already navigated away from
        setBusy(false)
        if (!result.ok) setError(result.error ?? 'The assistant could not start.')
        setState(result.state)
      }
      if (!cancelled) setChatSettled(true)
    }).catch((err: unknown) => {
      // A real IPC round trip into the main process and can reject outright — the same
      // TOCTOU-class gap StageReadinessContext.tsx's own `refresh()` guards against. Surface it
      // through the same error banner an ordinary turn failure already renders, and still let
      // `chatSettled` flip so this half can't get stuck — the checklist's "Loading" step depends
      // on BOTH halves below, so a readiness-side failure (handled separately, in the context
      // itself) still correctly keeps that step from reading done.
      if (cancelled) return
      setError(err instanceof Error ? err.message : 'The assistant could not start.')
      setChatSettled(true)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actor changing mid-conversation should not re-greet
  }, [projectPath, stageId])

  // "Ready" only once BOTH halves have settled — the chat flow above (including the model's own
  // first turn, when one was needed) AND the shared readiness read — so the checklist's third
  // item can never read as done before the other two. `chatSettled` is reset to false at the top
  // of the effect above on every stage switch, and `readinessLoading` already reflects the
  // CURRENT stage (StageReadinessProvider is keyed the same way), so this needs no stage guard
  // of its own — it can only read both true once both genuinely belong to the stage on screen.
  useEffect(() => {
    if (chatSettled && !readinessLoading) setInitializing(false)
  }, [chatSettled, readinessLoading])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [state?.messages.length])

  if (!projectPath || !stageId) {
    return <ChatPlaceholder status={status} />
  }

  // The current step's document, by the SAME rule the Workflow tab uses to pick it — null while
  // readiness has not answered yet, or when the current step is Sign-off (nothing to name).
  const currentDocumentTitle = readiness?.ok
    ? computeWorkflowSteps(readiness).find((s) => s.status === 'current' && s.kind === 'document')?.title ?? null
    : null

  const hasPendingProposal = state?.messages.some((m) => m.proposals.some((p) => !p.outcome)) ?? false

  const submit = async () => {
    const text = draft.trim()
    if (!text || busy) return
    const forStage = stageId
    setDraft('')
    setBusy(true)
    setError(null)
    const result = await window.studio.sendChatMessage(projectPath, stageId, text)
    if (currentStageId.current !== forStage) return // the person moved on; this reply is now stale
    setBusy(false)
    // Always render the result, success or failure: on failure, `result.state` still carries
    // the message the person just sent (chat.ts persists it even when the turn itself fails) —
    // skipping this on failure was how that message used to vanish, shown nowhere at all
    // despite having been genuinely submitted.
    setState(result.state)
    if (!result.ok) setError(result.error ?? 'The assistant could not respond.')
  }

  const answer = async (questionId: string, option: string) => {
    const forStage = stageId
    setBusy(true)
    setError(null)
    const result = await window.studio.answerChatQuestion(projectPath, stageId, questionId, option)
    if (currentStageId.current !== forStage) return
    setBusy(false)
    setState(result.state)
    if (!result.ok) setError(result.error ?? 'The assistant could not respond.')
  }

  const resolveProposal = async (proposalId: string, outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => {
    const forStage = stageId
    setBusy(true)
    setError(null)
    const result = await window.studio.resolveChatProposal(projectPath, stageId, proposalId, outcome, finalValue, actor || 'unknown')
    if (currentStageId.current !== forStage) return
    setBusy(false)
    setState(result.state)
    if (!result.ok) setError(result.error ?? 'That could not be saved.')
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-slate-200 bg-white sm:w-80">
      <ChatHeader status={status} projectOpen currentDocumentTitle={currentDocumentTitle} />
      {initializing ? (
        <ConnectingChecklist steps={connectingSteps(state, readiness, chatSettled, status, currentDocumentTitle)} />
      ) : (
        <>
          <ChatMessageList listRef={listRef} state={state} busy={busy} onAnswer={answer} onResolveProposal={resolveProposal} />
          {/* A chat-turn failure takes priority when both are set — it's the more recent, more
              actionable one; the shared readiness error is what proves this panel isn't silently
              stuck with no document scoping after that fetch failed outright (PR #76 finding #2,
              now owned by StageReadinessContext.tsx — see its own error field). */}
          {(error ?? readinessError) && (
            <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-command-error)]">
              {error ?? readinessError}
            </div>
          )}
          <ChatComposer draft={draft} setDraft={setDraft} busy={busy} hasPendingProposal={hasPendingProposal} onSubmit={submit} />
        </>
      )}
    </aside>
  )
}

/** `status` can be null in two DIFFERENT situations, which used to read identically (or, for
 * the main project view, as a bare "Can see: " with nothing after it — the fallback for that
 * branch had been dropped entirely): no project is open at all, versus a project (and stage)
 * IS open but its status has not finished loading yet. `projectOpen` tells them apart so each
 * gets its own honest message rather than a blank line or the wrong explanation.
 *
 * The heading itself stays the literal word "Chat" (spec 0016's own e2e test locates the panel
 * by it) — spec 0018's "scoped to the current document" shows up in the SUBTITLE instead, naming
 * the document this conversation is helping with once readiness has answered which one that is. */
function ChatHeader({
  status, projectOpen, currentDocumentTitle,
}: {
  status: ProjectStatus | null
  projectOpen: boolean
  currentDocumentTitle?: string | null
}) {
  const subtitle = !projectOpen
    ? 'Can see: nothing yet — open a project first.'
    : !status
      ? 'Can see: loading…'
      : currentDocumentTitle
        ? `Helping with: ${currentDocumentTitle}`
        : `Can see: ${status.project_name}, ${status.current_phase.display}.`
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

function ChatPlaceholder({ status }: { status: ProjectStatus | null }) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-slate-200 bg-white sm:w-80">
      <ChatHeader status={status} projectOpen={false} />
      <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-400">
        Open a stage to start a conversation.
      </div>
    </aside>
  )
}

function ChatMessageList({
  listRef, state, busy, onAnswer, onResolveProposal,
}: {
  listRef: React.RefObject<HTMLDivElement | null>
  state: ChatState | null
  busy: boolean
  onAnswer: (questionId: string, option: string) => void
  onResolveProposal: (proposalId: string, outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => void
}) {
  return (
    <div ref={listRef} className="flex-1 space-y-3 overflow-auto px-3 py-3">
      {state === null || (state.messages.length === 0 && busy) ? (
        <p className="text-xs text-slate-400">Starting the conversation…</p>
      ) : state.messages.length === 0 ? (
        <p className="text-xs text-slate-400">
          This stage's documents are already started. Ask a question, or open a document to edit it directly.
        </p>
      ) : (
        state.messages.map((message) => (
          <MessageBubble key={message.id} message={message} busy={busy} onAnswer={onAnswer} onResolveProposal={onResolveProposal} />
        ))
      )}
      {busy && state !== null && state.messages.length > 0 && (
        <p className="text-xs text-slate-400">Thinking…</p>
      )}
    </div>
  )
}

/** Free text stays usable at all times once the conversation is ready (spec 0018) — a pending
 * structured question is answered by its own quick-reply chips, rendered inline in the thread
 * (see `QuestionPrompt`), never by gating this box. Typing something that is NOT an answer to
 * that question is just the next ordinary turn, exactly as spec 0016's chat already works. */
function ChatComposer({
  draft, setDraft, busy, hasPendingProposal, onSubmit,
}: {
  draft: string
  setDraft: (value: string) => void
  busy: boolean
  hasPendingProposal: boolean
  onSubmit: () => void
}) {
  return (
    <div className="border-t border-slate-200 p-3">
      <div className="flex gap-2">
        <textarea
          data-testid="chat-composer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
          }}
          disabled={busy}
          placeholder="Type a message…"
          rows={2}
          className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !draft.trim()}
          className="shrink-0 self-end rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Send
        </button>
      </div>
      {hasPendingProposal && (
        <p className="mt-1 text-xs text-slate-400">A proposal above is waiting on you.</p>
      )}
    </div>
  )
}

function MessageBubble({
  message, busy, onAnswer, onResolveProposal,
}: {
  message: ChatMessage
  busy: boolean
  onAnswer: (questionId: string, option: string) => void
  onResolveProposal: (proposalId: string, outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => void
}) {
  const isUser = message.role === 'user'
  const isSubagent = message.role === 'subagent'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
        isUser ? 'bg-brand-600 text-white' : isSubagent ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-700' : 'bg-slate-100 text-slate-800'
      }`}
      >
        {isSubagent && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {message.subagentType ?? 'sub-agent'}
          </p>
        )}
        {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}

        {/* A single reply may ask more than one structured question, or propose more than one
            write — each renders as its own card rather than only the last one reaching the
            person (see chatStreamParse.ts's own header for why that used to happen). */}
        {message.questions.map((question) => (
          <QuestionPrompt key={question.id} question={question} busy={busy} onAnswer={(option) => onAnswer(question.id, option)} />
        ))}

        {message.proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            busy={busy}
            onResolve={(outcome, finalValue) => onResolveProposal(proposal.id, outcome, finalValue)}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionPrompt({
  question, busy, onAnswer,
}: {
  question: ChatQuestion
  busy: boolean
  onAnswer: (option: string) => void
}) {
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-slate-500">{question.question}</p>
      {question.answeredWith ? (
        <p className="text-xs text-slate-500">You picked: <span className="font-semibold">{question.answeredWith}</span></p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => onAnswer(option)}
              className="rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProposalCard({
  proposal, busy, onResolve,
}: {
  proposal: ChatProposal
  busy: boolean
  onResolve: (outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(proposal.value)

  if (proposal.outcome) {
    const label = proposal.outcome === 'discarded' ? 'Discarded' : proposal.outcome === 'edited' ? 'Accepted (edited)' : 'Accepted'
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {proposal.document} — {proposal.section} — {proposal.field}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-600">{label}</p>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <AiProposalCard
        label={`Proposed write — ${proposal.document} — ${proposal.section} — ${proposal.field}`}
        busy={busy}
        onAccept={() => onResolve(editing && value.trim() !== proposal.value.trim() ? 'edited' : 'accepted', value)}
        onDiscard={() => onResolve('discarded', '')}
        middleActions={!editing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
          >
            Edit
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => { setEditing(false); setValue(proposal.value) }}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
          >
            Cancel edit
          </button>
        )}
      >
        {editing ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={Math.min(10, Math.max(3, value.split('\n').length + 1))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
          />
        ) : (
          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-800">{proposal.value}</pre>
        )}
      </AiProposalCard>
    </div>
  )
}
