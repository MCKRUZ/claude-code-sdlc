import { describe, expect, it } from 'vitest'
import { parseStreamJsonToMessages } from '../electron/main/chat'

// Fixture lines shaped exactly like `claude --output-format stream-json`'s real stdout,
// captured against the actual CLI during this spec's own spike work (2026-09-29) and
// simplified to the fields parseStreamJsonToMessages actually reads. Testing against a shape
// this close to reality is what makes this "the driver parses structurally" rather than a
// parser that only ever sees hand-invented fixtures.

function assistantLine(content: unknown[], opts: { parentToolUseId?: string; uuid?: string } = {}): string {
  return JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content },
    parent_tool_use_id: opts.parentToolUseId ?? null,
    uuid: opts.uuid ?? `uuid-${Math.random()}`,
    session_id: 'session-1',
  })
}

describe('parseStreamJsonToMessages', () => {
  it('extracts a plain assistant text reply', () => {
    const lines = [assistantLine([{ type: 'text', text: 'Hello, let\'s start with the problem statement.' }], { uuid: 'm1' })]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: 'm1', role: 'assistant', text: 'Hello, let\'s start with the problem statement.' })
  })

  it('ignores non-assistant frames (system, user/tool_result echoes) and malformed lines', () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'hook_started' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
      'not json at all',
      '',
      '   ',
      assistantLine([{ type: 'text', text: 'The only real message.' }], { uuid: 'm1' }),
    ]
    expect(parseStreamJsonToMessages(lines)).toEqual([
      expect.objectContaining({ id: 'm1', text: 'The only real message.' }),
    ])
  })

  it('turns a bare Read/Grep tool_use with no text into nothing shown — it is mechanical bookkeeping, not chat content', () => {
    const lines = [assistantLine([{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'x.md' } }])]
    expect(parseStreamJsonToMessages(lines)).toEqual([])
  })

  // Acceptance check: "A proposed write is a real tool call the driver parses structurally...
  // a test feeds a reply with no such tool call and asserts no proposal card appears, rather
  // than a guessed one." Both directions, in the two tests below.
  it('extracts a ProposeWrite tool_use into a structured proposal', () => {
    const lines = [assistantLine([
      { type: 'text', text: 'Here is a first draft of the problem statement.' },
      {
        type: 'tool_use', id: 't1', name: 'mcp__sdlc-studio-chat__ProposeWrite',
        input: { document: '.sdlc/artifacts/00-discovery/problem-statement.md', section: 'Problem Statement', field: 'Summary', value: 'The team cannot see...' },
      },
    ], { uuid: 'm1' })]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages).toHaveLength(1)
    expect(messages[0].proposal).toEqual({
      id: 'm1',
      document: '.sdlc/artifacts/00-discovery/problem-statement.md',
      section: 'Problem Statement',
      field: 'Summary',
      value: 'The team cannot see...',
    })
  })

  it('a reply with NO ProposeWrite tool call produces NO proposal — never a guess from prose alone', () => {
    const lines = [assistantLine([
      { type: 'text', text: 'I will write "The team cannot see..." into the Summary field.' },
    ])]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages).toHaveLength(1)
    expect(messages[0].proposal).toBeUndefined()
  })

  it('extracts an AskStructuredQuestion tool_use into a structured question with real options', () => {
    const lines = [assistantLine([{
      type: 'tool_use', id: 't1', name: 'mcp__sdlc-studio-chat__AskStructuredQuestion',
      input: { question: 'What type of system is this?', options: ['service', 'app', 'library', 'skill', 'cli'] },
    }], { uuid: 'm1' })]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages).toHaveLength(1)
    expect(messages[0].question).toEqual({
      id: 'm1', question: 'What type of system is this?', options: ['service', 'app', 'library', 'skill', 'cli'],
    })
  })

  it('a reply with NO AskStructuredQuestion tool call produces NO question — plain prose never becomes clickable options', () => {
    const lines = [assistantLine([{ type: 'text', text: 'Is this a service, app, library, skill, or cli?' }])]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages[0].question).toBeUndefined()
  })

  it('labels a forwarded sub-agent message with the agent it actually came from, correlated by parent_tool_use_id', () => {
    const lines = [
      // The orchestrator spawns discovery-analyst via Task.
      assistantLine([
        { type: 'text', text: 'Let me check the intake corpus for contradictions.' },
        { type: 'tool_use', id: 'task-1', name: 'Task', input: { subagent_type: 'claude-code-sdlc:discovery-analyst', description: 'find contradictions', prompt: '...' } },
      ], { uuid: 'orchestrator-1' }),
      // The sub-agent's OWN forwarded text (--forward-subagent-text), not a paraphrase.
      assistantLine([{ type: 'text', text: 'Found 3 contradictions across the corpus.' }], { parentToolUseId: 'task-1', uuid: 'sub-1' }),
    ]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ id: 'orchestrator-1', role: 'assistant' })
    expect(messages[1]).toMatchObject({
      id: 'sub-1', role: 'subagent', subagentType: 'claude-code-sdlc:discovery-analyst',
      text: 'Found 3 contradictions across the corpus.',
    })
  })

  it('labels a forwarded message "unknown" when its parent Task call was not seen in this batch of lines', () => {
    const lines = [assistantLine([{ type: 'text', text: 'orphaned forwarded text' }], { parentToolUseId: 'no-such-task', uuid: 'sub-1' })]
    const messages = parseStreamJsonToMessages(lines)
    expect(messages[0]).toMatchObject({ role: 'subagent', subagentType: 'unknown' })
  })
})
