/** The az transport's rules, each a pitfall met in practice (code-host-providers.md §4.3):
 * the two AZURE_* vars on EVERY spawn, `--only-show-errors` and `-o json` appended, empty
 * stdout read as [] (az prints nothing when a list matches nothing), and a failure named for
 * what it is. runCommand is faked — nothing here spawns a real az. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../electron/main/commandRunner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/commandRunner')>()),
  runCommand: vi.fn(),
}))

import { runCommand, type ConsoleEntry } from '../electron/main/commandRunner'
import { AZ_ENV, AzError, azJson, EXTENSION_HINT, MATERIALIZED_HINT, runAz, setAzBinary } from '../electron/main/az'

const fakeRun = vi.mocked(runCommand)

function entry(partial: Partial<ConsoleEntry>): ConsoleEntry {
  return { id: '1', command: 'az', args: [], cwd: '/p', startedAt: '', durationMs: 1, exitCode: 0, stdout: '', stderr: '', ok: true, ...partial }
}

beforeEach(() => {
  fakeRun.mockReset()
  setAzBinary({ command: 'az', prefixArgs: [] })
})

describe('runAz / azJson', () => {
  it('carries both AZURE_* vars and appends -o json then --only-show-errors, in that order', async () => {
    fakeRun.mockResolvedValue(entry({ stdout: '[{"id": 1}]' }))
    await expect(azJson(['repos', 'pr', 'list', '--detect', 'false'], '/p')).resolves.toEqual([{ id: 1 }])
    const [command, args, cwd, opts] = fakeRun.mock.calls[0]!
    expect(command).toBe('az')
    expect(args).toEqual(['repos', 'pr', 'list', '--detect', 'false', '-o', 'json', '--only-show-errors'])
    expect(cwd).toBe('/p')
    expect(opts?.env).toMatchObject({ AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no', AZURE_CORE_COLLECT_TELEMETRY: 'no' })
    expect(AZ_ENV.AZURE_EXTENSION_USE_DYNAMIC_INSTALL).toBe('no')
  })

  it('merges the vars onto a caller env rather than replacing it, and never lets a caller unset them', async () => {
    fakeRun.mockResolvedValue(entry({ stdout: '{}' }))
    await runAz(['account', 'show'], '/p', { env: { FOO: 'bar', AZURE_CORE_COLLECT_TELEMETRY: 'yes' } })
    expect(fakeRun.mock.calls[0]![3]?.env).toEqual({ FOO: 'bar', AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no', AZURE_CORE_COLLECT_TELEMETRY: 'no' })
  })

  it('routes through a Windows .cmd shim when tooling resolved one', async () => {
    setAzBinary({ command: 'cmd.exe', prefixArgs: ['/c', 'C:\\az\\az.cmd'] })
    fakeRun.mockResolvedValue(entry({ stdout: '' }))
    await runAz(['version'], '/p')
    expect(fakeRun.mock.calls[0]![0]).toBe('cmd.exe')
    expect(fakeRun.mock.calls[0]![1]).toEqual(['/c', 'C:\\az\\az.cmd', 'version', '--only-show-errors'])
  })

  it('empty stdout is [] — "nothing matched", not an error', async () => {
    fakeRun.mockResolvedValue(entry({ stdout: '  \n' }))
    await expect(azJson(['boards', 'query'], '/p')).resolves.toEqual([])
  })

  it('unparseable JSON is an error that names the command', async () => {
    fakeRun.mockResolvedValue(entry({ stdout: 'WARNING: not json' }))
    await expect(azJson(['repos', 'show'], '/p')).rejects.toThrow(/az repos show returned unparseable JSON/)
  })

  it('a spawn failure is "not installed"; a missing extension and a sign-out are named', async () => {
    fakeRun.mockResolvedValue(entry({ ok: false, exitCode: null, stderr: 'spawn az ENOENT' }))
    await expect(runAz(['version'], '/p')).rejects.toMatchObject({ name: 'AzError', failure: 'not_installed' })

    fakeRun.mockResolvedValue(entry({ ok: false, exitCode: 1, stderr: "ERROR: The command requires the extension azure-devops. Unable to prompt for extension install confirmation as no tty available." }))
    const ext = await runAz(['repos', 'show'], '/p').catch((e: unknown) => e)
    expect(ext).toBeInstanceOf(AzError)
    expect((ext as AzError).failure).toBe('extension_missing')
    expect((ext as AzError).message).toContain(EXTENSION_HINT)

    fakeRun.mockResolvedValue(entry({ ok: false, exitCode: 1, stderr: "ERROR: Please run 'az login' to setup account." }))
    await expect(runAz(['account', 'show'], '/p')).rejects.toMatchObject({ failure: 'signed_out' })
  })

  it('the materialized-identity 403 gets the hint the raw text lacks', async () => {
    fakeRun.mockResolvedValue(entry({ ok: false, exitCode: 1, stderr: 'ERROR: TF400813: Identity x has not been materialized.' }))
    const err = await runAz(['repos', 'pr', 'list'], '/p').catch((e: unknown) => e)
    expect((err as AzError).failure).toBe('exit')
    expect((err as AzError).message).toContain(MATERIALIZED_HINT)
    expect((err as AzError).entry.stderr).toContain('materialized')
  })
})
