import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mcpConfigPath } from '../electron/main/chatMcpConfig'

// Two real drifts found between this generated inline script and chatMcpServer.ts's own
// reference implementation (handleLine), both regression-tested here.

describe('mcpConfigPath', () => {
  it('writes a real JSON file naming exactly one MCP server: the Electron binary, run as plain node, given an inline script', () => {
    const path = mcpConfigPath('C:/fake/electron-a.exe')
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    const servers = Object.keys(parsed.mcpServers)
    expect(servers).toHaveLength(1)
    const server = parsed.mcpServers[servers[0]]
    expect(server.command).toBe('C:/fake/electron-a.exe')
    expect(server.args[0]).toBe('-e')
    expect(server.args[1]).toContain('ProposeWrite') // the generated script embeds the real TOOLS schema
    expect(server.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
  })

  it('the generated inline script is syntactically valid JS (a Function constructor parses it without throwing)', () => {
    const path = mcpConfigPath('C:/fake/electron-b.exe')
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    const script = Object.values(parsed.mcpServers)[0] as { args: string[] }
    expect(() => new Function(script.args[1])).not.toThrow()
  })

  // Regression: the inline script's initialize handler used `||` for the protocolVersion
  // fallback, where chatMcpServer.ts's own reference implementation (the single source of
  // truth this script is generated from) correctly uses `??`. `||` replaces ANY falsy value
  // (including a genuinely-sent, merely empty string) with the default; `??` replaces only a
  // truly absent one — a real behavioral drift between the two, not just a style difference.
  it('the initialize handler uses ?? (nullish coalescing), not || , for the protocolVersion fallback — matching chatMcpServer.ts\'s own reference', () => {
    const path = mcpConfigPath('C:/fake/electron-c.exe')
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    const script = Object.values(parsed.mcpServers)[0] as { args: string[] }
    expect(script.args[1]).toContain('(params && params.protocolVersion) ?? "2024-11-05"')
    expect(script.args[1]).not.toContain('(params && params.protocolVersion) || "2024-11-05"')
  })

  // Regression: the module-level cache used to be a single `string | null`, ignoring its
  // execPath argument entirely — a second call with a DIFFERENT execPath silently returned the
  // first call's stale config, naming the wrong binary.
  it('a DIFFERENT execPath gets its OWN config file, naming ITS OWN command — not the first execPath\'s stale one', () => {
    const pathA = mcpConfigPath('C:/fake/electron-first.exe')
    const pathB = mcpConfigPath('C:/fake/electron-second.exe')
    expect(pathA).not.toBe(pathB)

    const configA = JSON.parse(readFileSync(pathA, 'utf-8'))
    const configB = JSON.parse(readFileSync(pathB, 'utf-8'))
    const serverA = Object.values(configA.mcpServers)[0] as { command: string }
    const serverB = Object.values(configB.mcpServers)[0] as { command: string }
    expect(serverA.command).toBe('C:/fake/electron-first.exe')
    expect(serverB.command).toBe('C:/fake/electron-second.exe')
  })

  it('the SAME execPath called twice returns the SAME cached path — idempotent, not rewritten every call', () => {
    const first = mcpConfigPath('C:/fake/electron-same.exe')
    const second = mcpConfigPath('C:/fake/electron-same.exe')
    expect(first).toBe(second)
  })
})
