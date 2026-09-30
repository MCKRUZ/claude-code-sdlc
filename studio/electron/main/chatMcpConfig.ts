// The chat-turn driver (spec 0016) — the --mcp-config generation half. Split out of chat.ts
// (over this repo's 400-line convention) so "how the in-process MCP server is spawned and
// configured" is a self-contained unit. See chatMcpServer.ts's own header for why production
// spawns an inline `node -e "<script>"` generated FROM that file's TOOLS/ackText, rather than
// that compiled file itself.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ackText, MCP_SERVER_NAME, TOOLS } from './chatMcpServer'

/** The MCP server's actual runtime, generated from chatMcpServer.ts's own TOOLS/ackText (the
 * single source of truth — see that file's header for why production spawns THIS generated
 * string rather than a compiled copy of that file). Plain CommonJS (no `import`, no ESM flag
 * needed) so `node -e` runs it with zero ceremony; its only dependency is node:readline.
 *
 * The `initialize` handler's protocolVersion fallback uses `??`, matching chatMcpServer.ts's
 * own reference implementation exactly (`params?.protocolVersion ?? '2024-11-05'`) — an
 * earlier version of this generated script used `||` here, which is a real behavioral drift
 * from the reference: `||` would replace an explicitly-empty-but-defined protocolVersion with
 * the default, where `??` (correctly) only replaces a genuinely absent one. */
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
    `    send({ jsonrpc: "2.0", id, result: { protocolVersion: (params && params.protocolVersion) ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: ${JSON.stringify(MCP_SERVER_NAME)}, version: "0.0.1" } } });`,
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

/** Keyed by execPath — a second call with a DIFFERENT execPath must not silently return the
 * first call's stale config naming the wrong binary. Today's single production call site
 * always passes the same value (process.execPath), so this is correctness-in-depth rather
 * than a bug reachable in practice, but the whole point of keying it is that "reachable in
 * practice today" is not something this cache can see. */
const cachedMcpConfigPaths = new Map<string, string>()

/** Writes (once per execPath, idempotent thereafter) the --mcp-config JSON naming ONE server:
 * the SAME Electron binary Studio itself is (`process.execPath`) with ELECTRON_RUN_AS_NODE=1
 * — so a packaged Studio needs no system Node.js install — running the inline script above via
 * `-e`. No file of the server's own to resolve or ship: measured that vite-plugin-electron's
 * build bundles chatMcpServer.ts straight into dist-electron/main/index.js rather than its own
 * sibling file, and that `import 'electron'` resolves to an empty object (not the real API,
 * not a throw) under ELECTRON_RUN_AS_NODE — so index.js's own top-level Electron-bootstrap
 * code would crash the instant it ran that way. An inline `-e` script has neither problem: it
 * needs no file of its own to exist, and it never imports 'electron' at all. */
export function mcpConfigPath(execPath: string): string {
  const cached = cachedMcpConfigPaths.get(execPath)
  if (cached && existsSync(cached)) return cached
  const dir = join(tmpdir(), 'sdlc-studio-chat')
  mkdirSync(dir, { recursive: true })
  // Filename keyed by execPath too, not just the in-memory cache lookup above — two DIFFERENT
  // execPaths must never write the same file, or the second call's write would silently
  // invalidate the first execPath's own cache entry (its cached path would still exist on
  // disk, but now hold the wrong binary's config).
  const execPathHash = createHash('sha256').update(execPath).digest('hex').slice(0, 16)
  const configPath = join(dir, `mcp-config-${execPathHash}.json`)
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
  cachedMcpConfigPaths.set(execPath, configPath)
  return configPath
}
