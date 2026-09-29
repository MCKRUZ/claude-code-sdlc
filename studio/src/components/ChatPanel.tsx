import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatState, ProjectStatus } from '../../shared/types'

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
      return
    }
    let cancelled = false
    setState(null)
    setError(null)
    window.studio.getChatState(projectPath, stageId).then(async (loaded) => {
      if (cancelled) return
      setState(loaded)
      if (loaded.messages.length === 0) {
        setBusy(true)
        const result = await window.studio.ensureChatStarted(projectPath, stageId, actor)
        if (cancelled) return
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
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
          <p className="mt-1 text-xs text-slate-500">
            {status ? `Can see: ${status.project_name}.` : 'Can see: nothing yet — open a project first.'}
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-400">
          Open a stage to start a conversation.
        </div>
      </aside>
    )
  }

  const hasPendingQuestion = state?.messages.some((m) => m.question && !m.question.answeredWith) ?? false
  const hasPendingProposal = state?.messages.some((m) => m.proposal && !m.proposal.outcome) ?? false

  const submit = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    setError(null)
    const result = await window.studio.sendChatMessage(projectPath, stageId, text, actor)
    setBusy(false)
    if (!result.ok) { setError(result.error ?? 'The assistant could not respond.'); return }
    setState(result.state)
  }

  const answer = async (messageId: string, option: string) => {
    setBusy(true)
    setError(null)
    const result = await window.studio.answerChatQuestion(projectPath, stageId, messageId, option, actor)
    setBusy(false)
    if (!result.ok) { setError(result.error ?? 'The assistant could not respond.'); return }
    setState(result.state)
  }

  const resolveProposal = async (messageId: string, outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => {
    setBusy(true)
    setError(null)
    const result = await window.studio.resolveChatProposal(projectPath, stageId, messageId, outcome, finalValue, actor)
    setBusy(false)
    if (!result.ok) { setError(result.error ?? 'That could not be saved.'); return }
    setState(result.state)
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
        <p className="mt-1 text-xs text-slate-500">
          {status ? `Can see: ${status.project_name}, ${status.current_phase.display}.` : ''}
        </p>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-auto px-3 py-3">
        {state === null || (state.messages.length === 0 && busy) ? (
          <p className="text-xs text-slate-400">Starting the conversation…</p>
        ) : state.messages.length === 0 ? (
          <p className="text-xs text-slate-400">
            This stage's documents are already started. Ask a question, or open a document to edit it directly.
          </p>
        ) : (
          state.messages.map((message) => <MessageBubble key={message.id} message={message} busy={busy} onAnswer={answer} onResolveProposal={resolveProposal} />)
        )}
        {busy && state !== null && state.messages.length > 0 && (
          <p className="text-xs text-slate-400">Thinking…</p>
        )}
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-command-error)]">
          {error}
        </div>
      )}

      <div className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            disabled={busy || hasPendingQuestion}
            placeholder={hasPendingQuestion ? 'Answer the question above first…' : 'Type a message…'}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            type="button"
            onClick={submit}
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
    </aside>
  )
}

function MessageBubble({
  message, busy, onAnswer, onResolveProposal,
}: {
  message: ChatMessage
  busy: boolean
  onAnswer: (messageId: string, option: string) => void
  onResolveProposal: (messageId: string, outcome: 'accepted' | 'edited' | 'discarded', finalValue: string) => void
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

        {message.question && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-medium text-slate-500">{message.question.question}</p>
            {message.question.answeredWith ? (
              <p className="text-xs text-slate-500">You picked: <span className="font-semibold">{message.question.answeredWith}</span></p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {message.question.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => onAnswer(message.id, option)}
                    className="rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {message.proposal && (
          <ProposalCard proposal={message.proposal} busy={busy} onResolve={(outcome, finalValue) => onResolveProposal(message.id, outcome, finalValue)} />
        )}
      </div>
    </div>
  )
}

function ProposalCard({
  proposal, busy, onResolve,
}: {
  proposal: NonNullable<ChatMessage['proposal']>
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
    <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
        Proposed write — {proposal.document} — {proposal.section} — {proposal.field}
      </p>
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
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve(editing && value.trim() !== proposal.value.trim() ? 'edited' : 'accepted', value)}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Accept
        </button>
        {!editing ? (
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
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('discarded', '')}
          className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40"
        >
          Discard
        </button>
      </div>
    </div>
  )
}
