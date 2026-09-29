import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatProposal, ChatQuestion, ChatState, ProjectStatus } from '../../shared/types'
import { AiProposalCard } from './AiProposalCard'

/** Present on every screen (spec 0008's own requirement) — spec 0016 wires the actual
 * conversation up. A real, multi-turn `claude` session drives a stage's documents: the
 * assistant opens on a stage with a document not yet started, structured questions render as
 * real buttons, and every proposed write is a card the person accepts, edits, or discards —
 * never a silent write. */
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!projectPath || !stageId) {
      setState(null)
      setBusy(false)
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
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actor changing mid-conversation should not re-greet
  }, [projectPath, stageId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [state?.messages.length])

  if (!projectPath || !stageId) {
    return <ChatPlaceholder status={status} />
  }

  const hasPendingQuestion = state?.messages.some((m) => m.questions.some((q) => !q.answeredWith)) ?? false
  const hasPendingProposal = state?.messages.some((m) => m.proposals.some((p) => !p.outcome)) ?? false

  const submit = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    setError(null)
    const result = await window.studio.sendChatMessage(projectPath, stageId, text)
    setBusy(false)
    // Always render the result, success or failure: on failure, `result.state` still carries
    // the message the person just sent (chat.ts persists it even when the turn itself fails) —
    // skipping this on failure was how that message used to vanish, shown nowhere at all
    // despite having been genuinely submitted.
    setState(result.state)
    if (!result.ok) setError(result.error ?? 'The assistant could not respond.')
  }

  const answer = async (questionId: string, option: string) => {
    setBusy(true)
    setError(null)
    const result = await window.studio.answerChatQuestion(projectPath, stageId, questionId, option)
    setBusy(false)
    setState(result.state)
    if (!result.ok) setError(result.error ?? 'The assistant could not respond.')
  }

  const resolveProposal = async (proposalId: string, outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => {
    setBusy(true)
    setError(null)
    const result = await window.studio.resolveChatProposal(projectPath, stageId, proposalId, outcome, finalValue, actor || 'unknown')
    setBusy(false)
    setState(result.state)
    if (!result.ok) setError(result.error ?? 'That could not be saved.')
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <ChatHeader status={status} projectOpen />
      <ChatMessageList listRef={listRef} state={state} busy={busy} onAnswer={answer} onResolveProposal={resolveProposal} />
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-command-error)]">
          {error}
        </div>
      )}
      <ChatComposer
        draft={draft}
        setDraft={setDraft}
        busy={busy}
        hasPendingQuestion={hasPendingQuestion}
        hasPendingProposal={hasPendingProposal}
        onSubmit={submit}
      />
    </aside>
  )
}

/** `status` can be null in two DIFFERENT situations, which used to read identically (or, for
 * the main project view, as a bare "Can see: " with nothing after it — the fallback for that
 * branch had been dropped entirely): no project is open at all, versus a project (and stage)
 * IS open but its status has not finished loading yet. `projectOpen` tells them apart so each
 * gets its own honest message rather than a blank line or the wrong explanation. */
function ChatHeader({ status, projectOpen }: { status: ProjectStatus | null; projectOpen: boolean }) {
  const subtitle = status
    ? `Can see: ${status.project_name}, ${status.current_phase.display}.`
    : projectOpen
      ? 'Can see: loading…'
      : 'Can see: nothing yet — open a project first.'
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

function ChatPlaceholder({ status }: { status: ProjectStatus | null }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
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

function ChatComposer({
  draft, setDraft, busy, hasPendingQuestion, hasPendingProposal, onSubmit,
}: {
  draft: string
  setDraft: (value: string) => void
  busy: boolean
  hasPendingQuestion: boolean
  hasPendingProposal: boolean
  onSubmit: () => void
}) {
  return (
    <div className="border-t border-slate-200 p-3">
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
          }}
          disabled={busy || hasPendingQuestion}
          placeholder={hasPendingQuestion ? 'Answer the question above first…' : 'Type a message…'}
          rows={2}
          className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || hasPendingQuestion || !draft.trim()}
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
