// The chat-turn driver (spec 0016) — a real, multi-turn `claude` conversation that authors a
// stage's documents. Every acceptance check in the spec traces back to a handful of design
// choices, each measured against the real CLI on this machine before being committed to (see
// the header comments below and chatMcpServer.ts):
//
//  * Working directory is ALWAYS claudeWorkingDirectory() (spec 0010's Studio-owned scratch
//    folder) — never the project. Real access to the project and the plugin's own install is
//    granted only through --add-dir, which is a file-tool-access grant and nothing else.
//  * MEASURED (2026-09-29): --add-dir alone does NOT make the plugin's discipline sub-agents
//    spawnable via Task — the CLI's own error lists them absent. --plugin-dir is required, and
//    once it is, an agent is registered under its PLUGIN-NAMESPACED name
//    (`<plugin-name>:<agent-name>`, e.g. `claude-code-sdlc:discovery-analyst`), never the bare
//    name — confirmed by a real Task-tool spawn succeeding only under the namespaced form.
//    Loading the plugin this way also loads its own hooks and commands; measured that the
//    SessionStart hook (hooks/sdlc-session-start.ps1) reads `$PWD/.sdlc/state.yaml`, which is
//    always the scratch working directory here and never contains that file, so it silently
//    no-ops — and its slash commands are unreachable since SlashCommand is not in the tool
//    allow-list. Both side effects are inert by construction, not by luck.
//  * MEASURED (2026-09-29, with a real control run against the CLI's full, unrestricted
//    default tool set): the built-in `AskUserQuestion` tool is NOT available in `-p`
//    (headless/print) mode at all, regardless of --tools — it exists only for an interactive
//    session that can render buttons and block on a click. This directly contradicts the
//    spec's Scope, which names it as part of the intended allow-list. `AskStructuredQuestion`
//    (chatMcpServer.ts) is the substitute: a real, structurally-parsed tool call achieving the
//    same acceptance-check intent (a genuine tool call, never free text), built the same way
//    ProposeWrite already had to be. Flagged in this spec's final report as a deviation from
//    the literal Scope text, closest-match per the task's own instructions.
//  * MEASURED (2026-09-29): --session-id on the first turn and --resume on every later one,
//    each a SEPARATE `claude` process, correctly preserves the full conversation across
//    process boundaries — a fact stated in turn 1's own reply was correctly recalled by a
//    freshly-spawned process in turn 2. A plain next-turn text message (not a formal
//    tool_result block) is all --resume needs; no pending native tool_use ever needs one here
//    because both custom tools ack synchronously within their own turn (see
//    chatMcpServer.ts's header for why that sidesteps the original tool_result question).
//  * MEASURED (2026-09-29): --output-format stream-json requires --verbose alongside it in
//    `-p` mode, or the CLI refuses to start ("When using --print, --output-format=stream-json
//    requires --verbose").
//  * Every `claude` invocation goes through commandRunner's runCommand() — the single choke
//    point that makes "every command Studio runs is visible in the console" true by
//    construction (spec 0008) — extended with runCommand's own streaming hook rather than
//    bypassed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { rawStdout, runCommand } from './commandRunner'
import { claudeWorkingDirectory } from './claudeAssist'
import { openDocument, setField } from './documents'
import { recordDraftOutcome } from './drafts'
import { getChatState, saveChatState } from './settings'
import { matchesSection } from '../../shared/sections'
import {
  ackText, ASK_QUESTION_TOOL as ASK_QUESTION, MCP_SERVER_NAME, PROPOSE_WRITE_TOOL as PROPOSE_WRITE, TOOLS,
} from './chatMcpServer'
import type { ChatMessage, ChatQuestion, ChatState, ChatTurnResult, DraftOutcome } from '../../shared/types'

// --- the fixed tool surface ---------------------------------------------------------------
// An explicit ALLOW-list, not a block-list (spec's own acceptance check: provable by
// asserting the launch arguments equal a fixed list, not by asserting three names are
// missing). Edit, Write and Bash never appear anywhere in this file. PROPOSE_WRITE/ASK_QUESTION
// are imported from chatMcpServer.ts — the single source of truth for this server's own name
// and tool names — rather than re-declared here, where a typo would silently create a tool
// name the server never actually serves.

/** The exact, complete tool list every chat session gets — nothing more, nothing less. A test
 * asserts buildChatArgs() output contains exactly this, comma-joined, as the value that
 * follows --tools (and again after --allowedTools, since --permission-prompts none denies an
 * MCP tool call outright without an explicit allow — measured live; Read/Grep/Glob/Task did
 * not need it, but granting it uniformly is simpler and strictly no wider than --tools already
 * allows). */
export const CHAT_TOOLS = ['Read', 'Grep', 'Glob', 'Task', PROPOSE_WRITE, ASK_QUESTION] as const

// --- locating the plugin's own name -------------------------------------------------------

/** The plugin's own declared name (`.claude-plugin/plugin.json`'s "name" field) — what a
 * Task-tool subagent_type must be prefixed with once --plugin-dir loads it. Never hardcoded:
 * a fork or rename of the plugin must keep working without a source change here. */
export function readPluginName(pluginRoot: string): string {
  const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json')
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    if (typeof parsed.name === 'string' && parsed.name) return parsed.name
  } catch { /* fall through to the fallback below */ }
  return 'claude-code-sdlc' // this plugin's own known name, if the manifest is ever unreadable
}

// --- the MCP config file --------------------------------------------------------------------

/** The MCP server's actual runtime, generated from chatMcpServer.ts's own TOOLS/ackText (the
 * single source of truth — see that file's header for why production spawns THIS generated
 * string rather than a compiled copy of that file). Plain CommonJS (no `import`, no ESM flag
 * needed) so `node -e` runs it with zero ceremony; its only dependency is node:readline. */
function inlineMcpServerSource(): string {
  return [
    'const readline = require("node:readline");',
    `const TOOLS = ${JSON.stringify(TOOLS)};`,
    'function send(obj) { process.stdout.write(JSON.stringify(obj) + "\\n"); }',
    `function ackText(name) { return name === "ProposeWrite" ? ${JSON.stringify(ackText('ProposeWrite'))} : ${JSON.stringify(ackText('AskStructuredQuestion'))}; }`,
    'readline.createInterface({ input: process.stdin, terminal: false }).on("line", (line) => {',
    '  if (!line.trim()) return;',
    '  let msg;',
    '  try { msg = JSON.parse(line); } catch { return; }',
    '  const { id, method, params } = msg;',
    '  if (method === "initialize") {',
    `    send({ jsonrpc: "2.0", id, result: { protocolVersion: (params && params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: ${JSON.stringify(MCP_SERVER_NAME)}, version: "0.0.1" } } });`,
    '    return;',
    '  }',
    '  if (method === "notifications/initialized") return;',
    '  if (method === "tools/list") { send({ jsonrpc: "2.0", id, result: { tools: TOOLS } }); return; }',
    '  if (method === "tools/call") {',
    '    const name = params && params.name;',
    '    const known = TOOLS.some((t) => t.name === name);',
    '    if (!known) { send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool " + name } }); return; }',
    '    send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: ackText(name) }] } });',
    '    return;',
    '  }',
    '  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unhandled method " + method } });',
    '});',
  ].join('\n')
}

let cachedMcpConfigPath: string | null = null

/** Writes (once per process, idempotent thereafter) the --mcp-config JSON naming ONE server:
 * the SAME Electron binary Studio itself is (`process.execPath`) with ELECTRON_RUN_AS_NODE=1
 * — so a packaged Studio needs no system Node.js install — running the inline script above via
 * `-e`. No file of the server's own to resolve or ship: measured that vite-plugin-electron's
 * build bundles chatMcpServer.ts straight into dist-electron/main/index.js rather than its own
 * sibling file, and that `import 'electron'` resolves to an empty object (not the real API,
 * not a throw) under ELECTRON_RUN_AS_NODE — so index.js's own top-level Electron-bootstrap
 * code would crash the instant it ran that way. An inline `-e` script has neither problem: it
 * needs no file of its own to exist, and it never imports 'electron' at all. */
export function mcpConfigPath(execPath: string): string {
  if (cachedMcpConfigPath && existsSync(cachedMcpConfigPath)) return cachedMcpConfigPath
  const dir = join(tmpdir(), 'sdlc-studio-chat')
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'mcp-config.json')
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: execPath,
        args: ['-e', inlineMcpServerSource()],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
    },
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  cachedMcpConfigPath = configPath
  return configPath
}

// --- system prompt ---------------------------------------------------------------------
// Instructs the model WHERE to read this stage's real guidance and HOW to use its tools.
// Never restates phase content itself — that would be exactly the second, hand-authored copy
// the spec forbids. The model reads phases/NN-*.md and agents/*.md itself, at conversation
// time, through the real, granted file access.

export function buildSystemPrompt(opts: {
  projectPath: string
  pluginRoot: string
  pluginName: string
  stageId: string
  stageDisplay: string
}): string {
  return [
    'You are the SDLC assistant inside SDLC Studio\'s chat panel, authoring this project\'s '
      + 'documents through a live conversation. You have no Edit, Write or Bash tool — you '
      + 'cannot and must not write to any file yourself, on this machine or any other, by any '
      + 'means. Never claim a write happened; only ProposeWrite reaches the person, and only '
      + 'they decide whether it is ever saved.',
    '',
    `Project root (real, read-only access granted): ${opts.projectPath}`,
    `Plugin root (real, read-only access granted): ${opts.pluginRoot}`,
    `Current stage: ${opts.stageId} — ${opts.stageDisplay}`,
    '',
    'Before asking anything, locate and fully read this stage\'s own phase guidance file — '
      + `glob for it under ${opts.pluginRoot}/phases/ (its name starts with the stage id above, `
      + 'e.g. "0-*.md" or "01-*.md" — check both patterns) — and read the project\'s own current '
      + `state (${opts.projectPath}/.sdlc/state.yaml and this stage's artifact folder) to see `
      + 'what is already written. Follow that phase file\'s own step order exactly. If the '
      + 'person free-types something the interview has not reached yet, acknowledge it briefly '
      + 'and redirect back to the current step — do not reorder or skip ahead on your own '
      + 'judgement.',
    '',
    'When the phase guidance calls for one of the plugin\'s own discipline sub-agents (for '
      + 'example discovery-analyst), spawn it with the Task tool using '
      + `subagent_type "${opts.pluginName}:<agent-name>" — the bare name will be rejected. `
      + 'Relay its own findings; never paraphrase them as if they were your own.',
    '',
    'To propose writing a field of a document, call the ProposeWrite tool with the document\'s '
      + 'repo-relative path, the section, the field label, and the proposed text. This does '
      + 'NOT write anything — it only shows the person a proposal card.',
    '',
    'To ask a structured, multiple-choice question, call the AskStructuredQuestion tool, then '
      + 'END YOUR TURN immediately — say nothing else after calling it. Never ask a '
      + 'multiple-choice question as plain prose the person has to type an answer to.',
  ].join('\n')
}

// --- building the CLI arguments ------------------------------------------------------------

export interface ChatArgsOptions {
  prompt: string
  projectPath: string
  pluginRoot: string
  pluginName: string
  stageId: string
  stageDisplay: string
  mcpConfig: string
  /** Present to --resume this session; absent (with sessionId still required) to start a new
   * one with --session-id. */
  resume: boolean
  sessionId: string
}

/** Pure: no I/O, no process spawn — every acceptance check about "the session's own launch
 * arguments" (the tool list, the working-directory isolation, Edit/Write/Bash's absence) is
 * provable by calling this and asserting on its output, without spawning a real process. */
export function buildChatArgs(opts: ChatArgsOptions): { command: string; args: string[]; cwd: string } {
  const toolList = CHAT_TOOLS.join(',')
  const args = [
    '-p', opts.prompt,
    '--add-dir', opts.projectPath, opts.pluginRoot,
    '--plugin-dir', opts.pluginRoot,
    '--tools', toolList,
    '--allowedTools', toolList,
    '--mcp-config', opts.mcpConfig,
    '--strict-mcp-config',
    '--permission-prompts', 'none',
    '--output-format', 'stream-json',
    '--input-format', 'text',
    '--verbose',
    '--forward-subagent-text',
    opts.resume ? '--resume' : '--session-id', opts.sessionId,
    '--append-system-prompt', buildSystemPrompt(opts),
  ]
  return { command: 'claude', args, cwd: claudeWorkingDirectory() }
}

// --- parsing stream-json into chat messages -------------------------------------------------

interface RawContentBlock {
  type: string
  text?: string
  name?: string
  id?: string
  input?: Record<string, unknown>
}

interface RawStreamEntry {
  type: string
  message?: { role?: string; content?: RawContentBlock[] }
  parent_tool_use_id?: string | null
  uuid?: string
  session_id?: string
}

/** Turns the raw lines of `claude --output-format stream-json`'s stdout into the chat
 * messages a person actually sees. Pure and independently testable — this is "the driver
 * parses structurally" from the acceptance checks, made into a function with no process, no
 * timing, and no network in it. Ignores anything it does not recognise rather than throwing,
 * since a stream carries plenty of frames (system, user/tool_result echoes) irrelevant here. */
export function parseStreamJsonToMessages(lines: string[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  // Task tool_use id -> subagent_type, so a later forwarded message (parent_tool_use_id set)
  // can be labelled with which sub-agent actually produced it.
  const taskCallers = new Map<string, string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed[0] !== '{') continue
    let entry: RawStreamEntry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (entry.type !== 'assistant' || !entry.message?.content) continue

    for (const block of entry.message.content) {
      if (block.type === 'tool_use' && block.name === 'Task' && block.id) {
        const subagentType = typeof block.input?.subagent_type === 'string' ? block.input.subagent_type : 'unknown'
        taskCallers.set(block.id, subagentType)
      }
    }

    const isSubagent = Boolean(entry.parent_tool_use_id)
    const subagentType = isSubagent ? (taskCallers.get(entry.parent_tool_use_id!) ?? 'unknown') : undefined

    let text = ''
    let question: ChatQuestion | undefined
    let proposal: ChatMessage['proposal']

    for (const block of entry.message.content) {
      if (block.type === 'text' && block.text) {
        text += (text ? '\n' : '') + block.text
      } else if (block.type === 'tool_use' && block.name === PROPOSE_WRITE && block.input) {
        proposal = {
          id: entry.uuid ?? randomUUID(),
          document: String(block.input.document ?? ''),
          section: String(block.input.section ?? ''),
          field: String(block.input.field ?? ''),
          value: String(block.input.value ?? ''),
        }
      } else if (block.type === 'tool_use' && block.name === ASK_QUESTION && block.input) {
        const options = Array.isArray(block.input.options) ? block.input.options.map(String) : []
        question = {
          id: entry.uuid ?? randomUUID(),
          question: String(block.input.question ?? ''),
          options,
        }
      }
    }

    if (!text && !question && !proposal) continue // pure tool_use bookkeeping (e.g. Read/Grep), nothing to show

    messages.push({
      id: entry.uuid ?? randomUUID(),
      role: isSubagent ? 'subagent' : 'assistant',
      text,
      question,
      proposal,
      subagentType,
      at: new Date().toISOString(),
    })
  }

  return messages
}

// --- running one turn ------------------------------------------------------------------------

export interface RunTurnContext {
  claudePath: string
  projectPath: string
  pluginRoot: string
  pluginName: string
  stageId: string
  stageDisplay: string
  execPath: string
  onConsoleStream?: (soFar: string) => void
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
  })
  // claudePath overrides the resolved binary name only — args/cwd already fully built above.
  const resolvedCommand = ctx.claudePath || command

  const entry = await runCommand(resolvedCommand, args, cwd, {
    onChunk: ctx.onConsoleStream,
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
  onConsoleStream?: (soFar: string) => void
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
    onConsoleStream: ctx.onConsoleStream,
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

/** Folds a turn's result into the persisted state and saves it — or, on failure, changes and
 * saves nothing, so a failed turn never corrupts the session id a retry would need. */
function applyTurnResult(
  ctx: ChatContext, state: ChatState, result: RunTurnResult, leading: ChatMessage[],
): ChatTurnResult {
  if (!result.ok) return { ok: false, state, error: result.error }
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
  const userMessage: ChatMessage = { id: randomUUID(), role: 'user', text, at: new Date().toISOString() }
  const result = await sendTurn(ctx, state, text)
  return applyTurnResult(ctx, state, result, [userMessage])
}

export async function ipcAnswerChatQuestion(
  ctx: ChatContext, messageId: string, optionLabel: string,
): Promise<ChatTurnResult> {
  const state = getChatState(ctx.projectPath, ctx.stageId)
  const target = state.messages.find((m) => m.id === messageId)
  if (!target?.question) return { ok: false, state, error: 'No pending question with that id.' }
  if (target.question.answeredWith) return { ok: false, state, error: 'This question was already answered.' }
  if (!target.question.options.includes(optionLabel)) {
    return { ok: false, state, error: 'That is not one of this question\'s options.' }
  }

  const answered: ChatState = {
    ...state,
    messages: state.messages.map((m) => (
      m.id === messageId && m.question ? { ...m, question: { ...m.question, answeredWith: optionLabel } } : m
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
 * format. */
export async function ipcResolveChatProposal(
  ctx: ChatContext, messageId: string, outcome: DraftOutcome, finalValue: string, actor: string,
): Promise<ChatTurnResult> {
  const state = getChatState(ctx.projectPath, ctx.stageId)
  const target = state.messages.find((m) => m.id === messageId)
  if (!target?.proposal) return { ok: false, state, error: 'No pending proposal with that id.' }
  if (target.proposal.outcome) return { ok: false, state, error: 'This proposal was already resolved.' }

  const { document: relPath, section: reportedSection, field, value: offeredValue } = target.proposal
  let instance: string | undefined

  if (outcome !== 'discarded') {
    const doc = await openDocument(ctx.projectPath, ctx.pluginScriptsDir, relPath)
    if (!doc.ok) return { ok: false, state, error: doc.error ?? `Could not open ${relPath}.` }
    const section = doc.sections.find((s) => matchesSection(s.key, s.heading, reportedSection))
    if (!section) {
      return { ok: false, state, error: `Could not find a section matching "${reportedSection}" in ${relPath}.` }
    }
    instance = section.number !== undefined ? String(section.number) : undefined
    const write = await setField(ctx.projectPath, ctx.pluginScriptsDir, relPath, section.key, field, finalValue)
    if (!write.ok) return { ok: false, state, error: write.error ?? `Could not write ${field}.` }
  }

  await recordDraftOutcome(
    ctx.projectPath, ctx.pluginScriptsDir, relPath, field, outcome, actor,
    offeredValue.length, outcome === 'discarded' ? 0 : finalValue.length, instance,
  )

  const updated: ChatState = {
    ...state,
    messages: state.messages.map((m) => (
      m.id === messageId && m.proposal ? { ...m, proposal: { ...m.proposal, outcome } } : m
    )),
  }
  saveChatState(ctx.projectPath, ctx.stageId, updated)
  return { ok: true, state: updated }
}
