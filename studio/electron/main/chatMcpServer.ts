// A minimal, hand-rolled MCP stdio server, verified live against the real `claude` CLI.
//
// This FILE is a reference implementation, a type-checked source of truth for the tool
// schemas (TOOLS/ackText, exported below), and what chatMcpServer.test.ts exercises directly —
// but production never spawns IT. chat.ts's mcpConfigPath() spawns a small inline
// `node -e "<script>"` generated FROM this file's own TOOLS/ackText, run as plain Node (not
// Electron) via `ELECTRON_RUN_AS_NODE=1` so a packaged Studio needs no separate system Node.js
// install. See runChatMcpServer()'s own comment, below, for why: this file's protocol logic
// gets bundled straight into dist-electron/main/index.js rather than its own sibling file
// (measured), and `import 'electron'` resolves to an empty object rather than the real API
// under ELECTRON_RUN_AS_NODE (also measured) — either one on its own would have made "spawn
// this same compiled file" break in production the first time someone actually ran it.
//
// WHY HAND-ROLLED, NOT THE OFFICIAL SDK: this app deliberately carries no runtime
// dependencies beyond react-markdown/remark-gfm (see documents.ts's shapeFieldMeta, which
// hand-scans YAML for the same reason). The surface needed here is two fixed tools with no
// resources, no prompts, and no server-initiated messages — small enough to hand-roll
// correctly and verify against the real CLI, which this spec's own Checking Plan already
// requires doing for the mechanism questions. Verified live on this machine (2026-09-29):
// a probe server built exactly this way completed a real initialize/tools-list/tools-call
// round trip with `claude -p ... --mcp-config <this> --strict-mcp-config --tools
// "mcp__<server>__<Tool>" --allowedTools "mcp__<server>__<Tool>"` — note --allowedTools is
// required alongside --tools: --permission-mode dontAsk denies an MCP tool call outright
// without it, since tool AVAILABILITY (--tools) and permission to actually call it
// (--allowedTools) are two separate gates.
//
// WHY THIS EXISTS AT ALL, NOT THE BUILT-IN AskUserQuestion: measured live on this machine
// (2026-09-29, with a real control run against the CLI's full, unrestricted default tool
// set) that `AskUserQuestion` is not available in `-p` (headless/print) mode at all — the
// CLI's own words: "It isn't in my tool list or the deferred tool list." That tool exists
// only for an interactive TUI session that can render buttons and block on a click, which a
// spawned-per-turn `-p` process is not. `AskStructuredQuestion` below is this spec's
// substitute, built the same way `ProposeWrite` already had to be (Scope: "a dedicated,
// no-op tool ... that the model calls with the document, section, field and value — not a
// hope that the model reliably formats a fenced text block"): a REAL tool call the driver
// parses structurally out of the CLI's own stream-json output, not free text.
//
// BOTH TOOLS ARE NO-OPS BY DESIGN. Calling either one only acknowledges the call and ends
// the model's turn (the system prompt chat.ts builds instructs it to stop immediately after
// calling one) — it writes nothing and blocks on nothing. Studio's chat driver reads the
// structured call straight out of the CLI's own stdout, renders it, and the person's answer
// (an accepted/edited/discarded proposal, or a picked option) becomes the NEXT turn's plain
// text via --resume — the mechanism spec 0016's second spike measured actually works.
// Neither tool ever touches a document; the only write path remains documents.setField.

import { createInterface } from 'node:readline'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

/** This server's own name in the --mcp-config JSON — chat.ts imports this (rather than
 * re-declaring it) so the two can never drift, and so importing this module is enough to pull
 * it into the same build graph as chat.ts/index.ts under vite-plugin-electron's notBundle(),
 * which compiles a .ts file to its own sibling .js only when something reaches it — this file
 * is otherwise never imported for its own sake, only spawned as a standalone process. */
export const MCP_SERVER_NAME = 'sdlc-studio-chat'
export const PROPOSE_WRITE_TOOL = `mcp__${MCP_SERVER_NAME}__ProposeWrite`
export const ASK_QUESTION_TOOL = `mcp__${MCP_SERVER_NAME}__AskStructuredQuestion`

const TOOLS = [
  {
    name: 'ProposeWrite',
    description:
      'Propose writing ONE field of ONE document. This does NOT write anything — it only '
      + 'shows the person a proposal card (document, section, field, value) that they accept, '
      + 'edit, or discard. Call this instead of describing a write in prose.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'The document\'s repo-relative path, e.g. .sdlc/artifacts/01-requirements/requirements.md' },
        section: { type: 'string', description: 'The section key, e.g. a heading or "FR-003" for a repeating instance' },
        field: { type: 'string', description: 'The field label within that section' },
        value: { type: 'string', description: 'The proposed text for that field' },
      },
      required: ['document', 'section', 'field', 'value'],
    },
  },
  {
    name: 'AskStructuredQuestion',
    description:
      'Ask the person a structured, multiple-choice question. This renders as clickable '
      + 'options, never as prose they have to answer by typing. After calling this, END YOUR '
      + 'TURN immediately — do not keep talking. Their pick arrives as your next turn.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2 },
      },
      required: ['question', 'options'],
    },
  },
] as const

function send(obj: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function ackText(toolName: string): string {
  return toolName === 'ProposeWrite'
    ? 'Recorded. The person will accept, edit, or discard it — do not assume it was accepted.'
    : 'Presented to the person. End your turn now; their answer arrives as the next message.'
}

function handleLine(line: string): void {
  if (!line.trim()) return
  let msg: JsonRpcRequest
  try {
    msg = JSON.parse(line)
  } catch {
    return // not a frame this server can answer; never crash the process over malformed input
  }
  const { id, method, params } = msg

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: (params?.protocolVersion as string | undefined) ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version: '0.0.1' },
      },
    })
    return
  }

  if (method === 'notifications/initialized') return // no response expected

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    return
  }

  if (method === 'tools/call') {
    const name = params?.name as string | undefined
    const known = TOOLS.some((t) => t.name === name)
    if (!known || !name) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool ${name}` } })
      return
    }
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: ackText(name) }] } })
    return
  }

  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unhandled method ${method}` } })
  }
}

/** Attaches the stdin listener. NOT called anywhere in production — chat.ts's mcpConfigPath()
 * does not spawn this file at all. Measured that vite-plugin-electron's build bundles this
 * file's code straight into dist-electron/main/index.js rather than producing a separate
 * sibling file (a plain "does chatMcpServer.js exist next to index.js" assumption was wrong),
 * and that under ELECTRON_RUN_AS_NODE, `import 'electron'` resolves to an empty object rather
 * than throwing or providing the real API — so index.ts's own top-level code (which calls
 * `app.disableHardwareAcceleration()` and similar unconditionally) would crash the instant it
 * ran in that mode. The actual spawned server is a small inline `node -e "<script>"` string
 * chat.ts generates from TOOLS/ackText below (see chat.ts's mcpConfigPath), needing no file of
 * its own and no Electron import at all. This function — and this whole file — remains the
 * single source of truth for the tool schemas and the protocol handling: chat.ts imports
 * TOOLS/ackText/the tool-name constants from here rather than re-declaring them, and this
 * function stays for direct standalone debugging (`node chatMcpServer.js`) and so
 * chatMcpServer.test.ts can exercise handleLine/TOOLS/ackText with no side effect from the
 * import alone. */
export function runChatMcpServer(): void {
  createInterface({ input: process.stdin, terminal: false }).on('line', handleLine)
}

export { handleLine, TOOLS, ackText }
