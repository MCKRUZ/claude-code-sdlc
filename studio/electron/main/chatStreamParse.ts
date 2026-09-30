// The chat-turn driver (spec 0016) — turning `claude --output-format stream-json`'s raw stdout
// lines into the chat messages a person actually sees. Split out of chat.ts (over this repo's
// 400-line convention) so "how the stream is parsed" is a self-contained, independently
// readable and testable unit — pure, no process, no timing, no network.

import { randomUUID } from 'node:crypto'
import { ASK_QUESTION_TOOL as ASK_QUESTION, PROPOSE_WRITE_TOOL as PROPOSE_WRITE } from './chatMcpServer'
import type { ChatMessage, ChatProposal, ChatQuestion } from '../../shared/types'

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
 * since a stream carries plenty of frames (system, user/tool_result echoes) irrelevant here.
 *
 * A single reply may call ProposeWrite or AskStructuredQuestion more than once — each call is
 * its own tool_use block with its OWN id, so each becomes its own entry in `proposals`/
 * `questions` rather than later calls silently overwriting earlier ones (a real drift this
 * function used to have: a single `proposal`/`question` variable reassigned per block, so only
 * the LAST call of a turn ever reached the person, even though the MCP server had already
 * acknowledged every earlier one). The block's own tool_use `id` seeds the proposal/question's
 * id — distinct from the MESSAGE's id (`entry.uuid`) — falling back to a fresh uuid only if the
 * CLI ever omits it, which the real stream-json format does not do in practice. */
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
    const questions: ChatQuestion[] = []
    const proposals: ChatProposal[] = []

    for (const block of entry.message.content) {
      if (block.type === 'text' && block.text) {
        text += (text ? '\n' : '') + block.text
      } else if (block.type === 'tool_use' && block.name === PROPOSE_WRITE && block.input) {
        proposals.push({
          id: block.id ?? randomUUID(),
          document: String(block.input.document ?? ''),
          section: String(block.input.section ?? ''),
          field: String(block.input.field ?? ''),
          value: String(block.input.value ?? ''),
        })
      } else if (block.type === 'tool_use' && block.name === ASK_QUESTION && block.input) {
        const options = Array.isArray(block.input.options) ? block.input.options.map(String) : []
        questions.push({
          id: block.id ?? randomUUID(),
          question: String(block.input.question ?? ''),
          options,
        })
      }
    }

    if (!text && questions.length === 0 && proposals.length === 0) continue // pure tool_use bookkeeping (e.g. Read/Grep), nothing to show

    messages.push({
      id: entry.uuid ?? randomUUID(),
      role: isSubagent ? 'subagent' : 'assistant',
      text,
      questions,
      proposals,
      subagentType,
      at: new Date().toISOString(),
    })
  }

  return messages
}
