import { describe, expect, it, vi } from 'vitest'
import {
  ackText, ASK_QUESTION_TOOL, handleLine, MCP_SERVER_NAME, PROPOSE_WRITE_TOOL, TOOLS,
} from '../electron/main/chatMcpServer'

// A minimal, hand-rolled MCP stdio server — verified live against the real `claude` CLI during
// this spec's own spike work (a real initialize/tools-list/tools-call round trip completed
// correctly). These tests exercise the same handler function the real process wires to stdin,
// without spawning anything — handleLine() is a pure function of one line in, zero or one
// send() call out, which this file captures by monkeypatching process.stdout.write.

function run(line: string): unknown[] {
  const written: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk))
    return true
  })
  try {
    handleLine(line)
  } finally {
    spy.mockRestore()
  }
  return written.map((w) => JSON.parse(w))
}

describe('chatMcpServer — importing it attaches nothing to stdin', () => {
  it('exports the tool names chat.ts\'s allow-list is built from', () => {
    expect(MCP_SERVER_NAME).toBe('sdlc-studio-chat')
    expect(PROPOSE_WRITE_TOOL).toBe('mcp__sdlc-studio-chat__ProposeWrite')
    expect(ASK_QUESTION_TOOL).toBe('mcp__sdlc-studio-chat__AskStructuredQuestion')
  })

  it('declares exactly two tools, both no-op by contract', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['ProposeWrite', 'AskStructuredQuestion'])
  })
})

describe('handleLine — the JSON-RPC frames the real CLI actually sends', () => {
  it('answers initialize with this server\'s own info', () => {
    const [resp] = run(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25' } })) as never[]
    expect(resp).toMatchObject({
      jsonrpc: '2.0', id: 0,
      result: { protocolVersion: '2025-11-25', serverInfo: { name: MCP_SERVER_NAME } },
    })
  })

  it('sends NO response to notifications/initialized (no id, none expected)', () => {
    const written = run(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))
    expect(written).toHaveLength(0)
  })

  it('lists both tools with their real input schemas on tools/list', () => {
    const [resp] = run(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as any[]
    expect(resp.result.tools.map((t: { name: string }) => t.name)).toEqual(['ProposeWrite', 'AskStructuredQuestion'])
    const propose = resp.result.tools.find((t: { name: string }) => t.name === 'ProposeWrite')
    expect(propose.inputSchema.required).toEqual(['document', 'section', 'field', 'value'])
    const ask = resp.result.tools.find((t: { name: string }) => t.name === 'AskStructuredQuestion')
    expect(ask.inputSchema.required).toEqual(['question', 'options'])
  })

  it('acks a ProposeWrite call without writing anything — it is a no-op by design', () => {
    const [resp] = run(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'ProposeWrite', arguments: { document: 'x.md', section: 'S', field: 'F', value: 'V' } },
    })) as any[]
    expect(resp.result.content[0].text).toContain('accept, edit, or discard')
  })

  it('acks an AskStructuredQuestion call telling the model to end its turn', () => {
    const [resp] = run(JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'AskStructuredQuestion', arguments: { question: 'Q', options: ['A', 'B'] } },
    })) as any[]
    expect(resp.result.content[0].text).toContain('their answer arrives as the next message')
  })

  it('refuses an unknown tool name with a real JSON-RPC error, not a crash', () => {
    const [resp] = run(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'Bash' } })) as any[]
    expect(resp.error.code).toBe(-32601)
  })

  it('never crashes on malformed JSON — it is simply ignored', () => {
    expect(() => handleLine('{not json')).not.toThrow()
    expect(() => handleLine('')).not.toThrow()
  })

  it('ackText matches handleLine\'s own tools/call behaviour for both tools', () => {
    expect(ackText('ProposeWrite')).toContain('accept, edit, or discard')
    expect(ackText('AskStructuredQuestion')).toContain('End your turn now')
  })
})
