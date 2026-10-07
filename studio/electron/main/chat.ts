// The chat-turn driver (spec 0016) — a real, multi-turn `claude` conversation that authors a
// stage's documents. Every acceptance check in the spec traces back to a handful of design
// choices, each measured against the real CLI on this machine before being committed to. This
// file is the IPC/orchestration layer — one `claude` turn, and folding its result into the
// persisted ChatState; the CLI-argument construction lives in chatArgs.ts, the --mcp-config
// generation in chatMcpConfig.ts, and stream-json parsing in chatStreamParse.ts (this file was
// over this repo's 400-line convention with all four in one place). See chatArgs.ts's own
// header for the measurements behind the launch arguments, and chatMcpServer.ts's for why
// production spawns a generated inline script rather than that file itself.
//
//  * MEASURED (2026-09-29): --session-id on the first turn and --resume on every later one,
//    each a SEPARATE `claude` process, correctly preserves the full conversation across
//    process boundaries — a fact stated in turn 1's own reply was correctly recalled by a
//    freshly-spawned process in turn 2. A plain next-turn text message (not a formal
//    tool_result block) is all --resume needs; no pending native tool_use ever needs one here
//    because both custom tools ack synchronously within their own turn (see
//    chatMcpServer.ts's header for why that sidesteps the original tool_result question).
//  * Every `claude` invocation goes through commandRunner's runCommand() — the single choke
//    point that makes "every command Studio runs is visible in the console" true by
//    construction (spec 0008) — extended with runCommand's own streaming hook rather than
//    bypassed.

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { rawStdout, runCommand } from './commandRunner'
import { ensureDocumentFromTemplate, openDocument, setField } from './documents'
import { recordDraftOutcome } from './drafts'
import { getChatState, saveChatState } from './settings'
import { matchesSection, sectionInstanceKey } from '../../shared/sections'
import { buildChatArgs } from './chatArgs'
import { mcpConfigPath } from './chatMcpConfig'
import { describeLatestActivity, parseStreamJsonToMessages } from './chatStreamParse'
import { readPluginName } from './chatArgs'
import type { ChatMessage, ChatState, ChatTurnResult, DraftOutcome } from '../../shared/types'
import type { HostName } from '../../shared/codeHostModel'

export { CHAT_TOOLS, buildChatArgs, buildSystemPrompt, readPluginName } from './chatArgs'
export type { ChatArgsOptions } from './chatArgs'
export { mcpConfigPath } from './chatMcpConfig'
export { parseStreamJsonToMessages } from './chatStreamParse'

// --- running one turn ------------------------------------------------------------------------

export interface RunTurnContext {
  claudePath: string
  projectPath: string
  pluginRoot: string
  pluginName: string
  stageId: string
  stageDisplay: string
  execPath: string
  /** The project's code host, for the system prompt's "read GitHub / Azure DevOps" sentence. */
  host?: HostName
  /** Called with a plain-words label each time what the model is doing changes mid-turn. */
  onActivity?: (label: string) => void
}

export interface RunTurnResult {
  ok: boolean
  sessionId: string
  messages: ChatMessage[]
  error?: string
}

/** Runs exactly one `claude` process for exactly one turn, through runCommand() (spec 0008's
 * console-visibility choke point, extended with its own streaming hook — never bypassed). */
export async function runChatTurn(
  ctx: RunTurnContext,
  prompt: string,
  priorSessionId: string | null,
): Promise<RunTurnResult> {
  const sessionId = priorSessionId ?? randomUUID()
  const { command, args, cwd } = buildChatArgs({
    prompt,
    projectPath: ctx.projectPath,
    pluginRoot: ctx.pluginRoot,
    pluginName: ctx.pluginName,
    stageId: ctx.stageId,
    stageDisplay: ctx.stageDisplay,
    mcpConfig: mcpConfigPath(ctx.execPath),
    resume: priorSessionId !== null,
    sessionId,
    host: ctx.host,
  })
  // claudePath overrides the resolved binary name only — args/cwd already fully built above.
  const resolvedCommand = ctx.claudePath || command

  let lastLabel: string | null = null
  const entry = await runCommand(resolvedCommand, args, cwd, {
    // A truthy onChunk is what turns on runCommand's own live "pending" broadcast
    // (commandRunner.ts) — the SAME channel (commandRunner's onConsoleEntry, forwarded by
    // index.ts to 'studio:consoleEntry') every other command's entries reach the renderer
    // through, carrying the real id/command/args/cwd. The console half needs nothing from the
    // chunks: a second, bespoke broadcast used to live in index.ts (ChatContext.onConsoleStream),
    // duplicating that path with a hardcoded 'chat-stream' id that runCommand's own finish()
    // never resolves — a permanent "still running" ghost entry in the console. Deleted; this is
    // the one channel now. What the chunks ARE read for is the chat panel's "what is it doing"
    // label, sent only when it changes (chunks arrive far more often than the activity does).
    onChunk: (stdoutSoFar) => {
      const label = describeLatestActivity(stdoutSoFar)
      if (label && label !== lastLabel) {
        lastLabel = label
        ctx.onActivity?.(label)
      }
    },
  })

  if (!entry.ok) {
    return { ok: false, sessionId, messages: [], error: entry.stderr || 'The assistant could not respond.' }
  }

  // Read as DATA (a proposed document field can legitimately contain text that matches one of
  // commandRunner's redaction patterns), the same reason drafts.ts and documents.ts's callers
  // read Claude's own output through rawStdout() rather than the console-safe entry.stdout.
  const lines = rawStdout(entry).split('\n')
  const messages = parseStreamJsonToMessages(lines)
  return { ok: true, sessionId, messages }
}

// --- persisted chat state -------------------------------------------------------------------

export function emptyChatState(): ChatState {
  return { sessionId: null, messages: [] }
}

// --- project-level orchestration --------------------------------------------------------

export interface ChatContext {
  projectPath: string
  pluginScriptsDir: string
  stageId: string
  stageDisplay: string
  claudePath: string
  execPath: string
  host?: HostName
  onActivity?: (label: string) => void
}

function pluginRootFromScriptsDir(pluginScriptsDir: string): string {
  return join(pluginScriptsDir, '..')
}

function turnContext(ctx: ChatContext): RunTurnContext {
  const pluginRoot = pluginRootFromScriptsDir(ctx.pluginScriptsDir)
  return {
    claudePath: ctx.claudePath,
    projectPath: ctx.projectPath,
    pluginRoot,
    pluginName: readPluginName(pluginRoot),
    stageId: ctx.stageId,
    stageDisplay: ctx.stageDisplay,
    execPath: ctx.execPath,
    host: ctx.host,
    onActivity: ctx.onActivity,
  }
}

/** The assistant opens the conversation itself (spec's own acceptance check) — called only
 * when the caller has already confirmed the stage has a document not yet started AND this
 * chat has no history yet; a no-op otherwise, never a second greeting. */
export async function maybeGreet(ctx: ChatContext, state: ChatState): Promise<RunTurnResult | null> {
  if (state.messages.length > 0) return null
  const kickoff = 'Begin this stage\'s interview now. Read the phase guidance and the '
    + 'project\'s current state as instructed, then open with your first question or action '
    + `for the "${ctx.stageDisplay}" stage. Do not wait for the person to speak first.`
  return runChatTurn(turnContext(ctx), kickoff, null)
}

/** One ordinary next turn — the person's own words, or (from answering a structured question)
 * the option label they picked. Resumes the prior session when one exists; starts a fresh one
 * otherwise (a stage whose documents are complete has no prior session until someone actually
 * asks something — spec's own "available and useful, but does not restart the interview"
 * check). */
export async function sendTurn(ctx: ChatContext, state: ChatState, text: string): Promise<RunTurnResult> {
  return runChatTurn(turnContext(ctx), text, state.sessionId)
}

/** Folds a turn's result into the persisted state and saves it. On success, the leading
 * messages (e.g. the person's own just-submitted text) and the turn's own replies are both
 * appended. On FAILURE, the session id is left untouched — so a retry still resumes (or
 * starts) the right session — but `leading` is still appended and saved: whatever the person
 * actually submitted already left the input box, and losing it a second time (once from the
 * input, once from the record) on top of a failed turn is its own, separate bug from the turn
 * having failed at all. A caller with no leading messages (answering a question, whose own
 * state mutation already rode in on `state` itself) sees no behavioural change. */
function applyTurnResult(
  ctx: ChatContext, state: ChatState, result: RunTurnResult, leading: ChatMessage[],
): ChatTurnResult {
  if (!result.ok) {
    if (leading.length === 0) return { ok: false, state, error: result.error }
    const updated: ChatState = { sessionId: state.sessionId, messages: [...state.messages, ...leading] }
    saveChatState(ctx.projectPath, ctx.stageId, updated)
    return { ok: false, state: updated, error: result.error }
  }
  const updated: ChatState = { sessionId: result.sessionId, messages: [...state.messages, ...leading, ...result.messages] }
  saveChatState(ctx.projectPath, ctx.stageId, updated)
  return { ok: true, state: updated }
}

/** Reads the stage's persisted chat state — the IPC layer's read half, with no model call. */
export function readChatState(projectPath: string, stageId: string): ChatState {
  return getChatState(projectPath, stageId)
}

/** The auto-greet IPC entry point. The caller (index.ts) has already decided whether this
 * stage qualifies (a document not yet started) — this function's own job is only "have we
 * already greeted", so it is never called from two places with different rules for the same
 * question. */
export async function ipcEnsureChatStarted(ctx: ChatContext): Promise<ChatTurnResult> {
  const state = getChatState(ctx.projectPath, ctx.stageId)
  const result = await maybeGreet(ctx, state)
  if (!result) return { ok: true, state } // already greeted — no-op, per this function's own contract
  return applyTurnResult(ctx, state, result, [])
}

export async function ipcSendChatMessage(ctx: ChatContext, text: string): Promise<ChatTurnResult> {
  const state = getChatState(ctx.projectPath, ctx.stageId)
  const userMessage: ChatMessage = {
    id: randomUUID(), role: 'user', text, questions: [], proposals: [], at: new Date().toISOString(),
  }
  const result = await sendTurn(ctx, state, text)
  return applyTurnResult(ctx, state, result, [userMessage])
}

export async function ipcAnswerChatQuestion(
  ctx: ChatContext, questionId: string, optionLabel: string,
): Promise<ChatTurnResult> {
  const state = getChatState(ctx.projectPath, ctx.stageId)
  const target = state.messages.find((m) => m.questions.some((q) => q.id === questionId))
  const question = target?.questions.find((q) => q.id === questionId)
  if (!question) return { ok: false, state, error: 'No pending question with that id.' }
  if (question.answeredWith) return { ok: false, state, error: 'This question was already answered.' }
  if (!question.options.includes(optionLabel)) {
    return { ok: false, state, error: 'That is not one of this question\'s options.' }
  }

  const answered: ChatState = {
    ...state,
    messages: state.messages.map((m) => (
      m === target
        ? { ...m, questions: m.questions.map((q) => (q.id === questionId ? { ...q, answeredWith: optionLabel } : q)) }
        : m
    )),
  }
  const result = await sendTurn(ctx, answered, optionLabel)
  return applyTurnResult(ctx, answered, result, [])
}

/** Resolves a proposed write: accept, edit-then-accept, or discard. Reuses documents.setField
 * for the one and only write path, and drafts.recordDraftOutcome for the one and only ledger —
 * chat gets no write path or ledger of its own (spec's own acceptance checks). Section
 * addressing goes through matchesSection, the SAME loose match readiness.ts already uses to
 * join a plugin-reported section name to the document's own key, since the model names a
 * section the way it read it in the document (heading text), not by Studio's internal key
 * format. `proposalId` addresses the PROPOSAL itself (not its message) — a message may carry
 * more than one proposal, each independently resolvable. */
export async function ipcResolveChatProposal(
  ctx: ChatContext, proposalId: string, outcome: DraftOutcome, finalValue: string, actor: string,
): Promise<ChatTurnResult> {
  const state = getChatState(ctx.projectPath, ctx.stageId)
  const target = state.messages.find((m) => m.proposals.some((p) => p.id === proposalId))
  const proposal = target?.proposals.find((p) => p.id === proposalId)
  if (!proposal) return { ok: false, state, error: 'No pending proposal with that id.' }
  if (proposal.outcome) return { ok: false, state, error: 'This proposal was already resolved.' }

  const { document: relPath, section: reportedSection, field, value: offeredValue } = proposal
  let instance: string | undefined

  if (outcome !== 'discarded') {
    // A stage's documents are authored through chat, so the first accepted proposal for one that
    // has not been started has to start it — from the plugin's own template — or that write could
    // never land. A no-op for a document that already exists.
    const started = ensureDocumentFromTemplate(ctx.projectPath, ctx.pluginScriptsDir, relPath)
    if (!started.ok) return { ok: false, state, error: started.error ?? `Could not start ${relPath}.` }
    const doc = await openDocument(ctx.projectPath, ctx.pluginScriptsDir, relPath)
    if (!doc.ok) return { ok: false, state, error: doc.error ?? `Could not open ${relPath}.` }
    const section = doc.sections.find((s) => matchesSection(s.key, s.heading, reportedSection))
    if (!section) {
      return { ok: false, state, error: `Could not find a section matching "${reportedSection}" in ${relPath}.` }
    }
    // The SAME mapping DocumentView.tsx's structured editor uses (shared/sections.ts) — a
    // bare String(section.number) here, distinct from DocumentView's section.heading, used to
    // split the same requirement's draft-ledger audit trail across two different keys
    // depending on which UI made the edit.
    instance = sectionInstanceKey(section)
    const write = await setField(ctx.projectPath, ctx.pluginScriptsDir, relPath, section.key, field, finalValue)
    if (!write.ok) return { ok: false, state, error: write.error ?? `Could not write ${field}.` }
  }

  await recordDraftOutcome(
    ctx.projectPath, ctx.pluginScriptsDir, relPath, field, outcome, actor || 'unknown',
    offeredValue.length, outcome === 'discarded' ? 0 : finalValue.length, instance,
  )

  const updated: ChatState = {
    ...state,
    messages: state.messages.map((m) => (
      m === target
        ? { ...m, proposals: m.proposals.map((p) => (p.id === proposalId ? { ...p, outcome } : p)) }
        : m
    )),
  }
  saveChatState(ctx.projectPath, ctx.stageId, updated)
  return { ok: true, state: updated }
}
