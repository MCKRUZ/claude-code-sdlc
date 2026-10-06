/** detectAz: the Azure CLI is found by running it, never required, and honestly tri-state about
 * its extension (code-host providers, §7 tooling row).
 *
 * az is a Python program: `az version` takes seconds cold, so it gets its own 15 s ceiling where
 * every other probe gets 5 s. Every spawn carries the two AZURE_* vars and the two output flags
 * (az.ts has the why) — pinned here because detection runs BEFORE az.ts knows how to invoke az,
 * so it cannot go through runAz and could silently drift. No az is spawned: runCommand is faked. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleEntry, RunCommandOptions } from '../electron/main/commandRunner'

type Call = { command: string; args: string[]; opts: RunCommandOptions | undefined }
const calls: Call[] = []
let script: (command: string, args: string[]) => Partial<ConsoleEntry>

vi.mock('../electron/main/commandRunner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../electron/main/commandRunner')>()
  return {
    ...actual,
    runCommand: vi.fn(async (command: string, args: string[], cwd: string, opts?: RunCommandOptions): Promise<ConsoleEntry> => {
      calls.push({ command, args, opts })
      const over = script(command, args)
      return {
        id: String(calls.length), command, args, cwd, startedAt: '', durationMs: 1,
        exitCode: 0, stdout: '', stderr: '', ok: true, ...over,
      }
    }),
  }
})

const { AZ_PROBE_TIMEOUT_MS, detectAz } = await import('../electron/main/tooling')
const { AZ_ENV } = await import('../electron/main/az')

const VERSION_JSON = '{\n  "azure-cli": "2.67.0",\n  "azure-cli-core": "2.67.0",\n  "extensions": { "azure-devops": "1.0.1" }\n}\n'
const azCalls = () => calls.filter((c) => c.command === 'az')

beforeEach(() => {
  calls.length = 0
  script = () => ({})
})

describe('detectAz', () => {
  it('found, extension present: version read from the JSON, not the first line, and both calls carry the az rules', async () => {
    script = (_cmd, args) => (args[0] === 'version' ? { stdout: VERSION_JSON } : {})
    const status = await detectAz()
    expect(status).toMatchObject({ found: true, path: 'az', version: '2.67.0', extension: true })
    expect(status.resolved).toEqual({ command: 'az', prefixArgs: [] })

    expect(azCalls().map((c) => c.args)).toEqual([
      ['version', '-o', 'json', '--only-show-errors'],
      ['extension', 'show', '--name', 'azure-devops', '-o', 'json', '--only-show-errors'],
    ])
    for (const c of azCalls()) {
      expect(c.opts?.env).toMatchObject(AZ_ENV)
      expect(c.opts?.env).toMatchObject({ AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no', AZURE_CORE_COLLECT_TELEMETRY: 'no' })
      expect(c.opts?.timeoutMs).toBe(AZ_PROBE_TIMEOUT_MS)
    }
    expect(AZ_PROBE_TIMEOUT_MS).toBe(15_000)
  })

  it('not found: says so with the PATH wording, extension unknown — and never "not signed in"', async () => {
    script = (cmd) => (cmd === 'az' ? { ok: false, exitCode: null, stderr: 'spawn az ENOENT' } : { ok: false, exitCode: 1 })
    const status = await detectAz()
    expect(status.found).toBe(false)
    expect(status.error).toContain("'az' was not found on PATH")
    expect(status.extension).toBeNull()
    expect(status.error).not.toMatch(/sign/i)
    // The extension is not looked for on a CLI that is not there.
    expect(azCalls().some((c) => c.args[0] === 'extension')).toBe(false)
  })

  it('extension missing: az ran and said no, so false — not null', async () => {
    script = (_cmd, args) => args[0] === 'version'
      ? { stdout: VERSION_JSON }
      : { ok: false, exitCode: 1, stderr: "The extension azure-devops is not installed." }
    const status = await detectAz()
    expect(status).toMatchObject({ found: true, extension: false })
  })

  it('extension probe itself died (timeout): null, because not knowing is not "missing"', async () => {
    script = (_cmd, args) => args[0] === 'version'
      ? { stdout: VERSION_JSON }
      : { ok: false, exitCode: null, stderr: `Timed out after ${AZ_PROBE_TIMEOUT_MS}ms with no response.` }
    const status = await detectAz()
    expect(status).toMatchObject({ found: true, extension: null })
  })

  it('version probe timed out on both the direct and the resolved path: not found, with the timeout as the reason', async () => {
    script = (cmd, args) => {
      if (cmd === 'which' || cmd === 'where') return { stdout: '/usr/local/bin/az\n' }
      if (args[0] === 'version') return { ok: false, exitCode: null, stderr: `Timed out after ${AZ_PROBE_TIMEOUT_MS}ms with no response.` }
      return {}
    }
    const status = await detectAz()
    expect(status.found).toBe(false)
    expect(status.error).toContain('Timed out after 15000ms')
    expect(status.extension).toBeNull()
  })

  it('an override path is what gets run, and is what the report names', async () => {
    script = (_cmd, args) => (args[0] === 'version' ? { stdout: VERSION_JSON } : {})
    const status = await detectAz('/opt/az/bin/az')
    expect(status).toMatchObject({ found: true, path: '/opt/az/bin/az' })
    expect(calls[0]!.command).toBe('/opt/az/bin/az')
  })

  it('an older az printing plain text keeps its first line as the version', async () => {
    script = (_cmd, args) => (args[0] === 'version' ? { stdout: 'azure-cli 2.40.0\ncore 2.40.0\n' } : {})
    const status = await detectAz()
    expect(status.version).toBe('azure-cli 2.40.0')
  })
})
