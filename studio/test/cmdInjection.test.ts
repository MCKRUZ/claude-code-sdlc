/** Arguments must not become commands.
 *
 * On Windows, git and gh installed by scoop, npm or Chocolatey are batch shims, which can
 * only be started through the command interpreter — so Studio routes those through
 * `cmd.exe /c <shim>`. The interpreter then re-reads the arguments. Node quotes an argument
 * only when it contains a space or a quote, so a value with neither arrives unquoted and its
 * `&` starts a second command.
 *
 * That is not a theory here. It was measured with a control before this guard was written:
 * through the shim, an argument of `main&echo>FILE` reached the shim as just `main` and the
 * injected command ran; spawned directly against an executable the same value arrived intact
 * and nothing ran. Git permits those characters in a branch name, and a cloned repository
 * chooses its own branch name.
 *
 * The end-to-end case below re-runs that measurement against the real runCommand, so this
 * stays proven rather than remembered.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runCommand } from '../electron/main/commandRunner'

const onWindows = process.platform === 'win32'
const dir = mkdtempSync(join(tmpdir(), 'studio-cmdinject-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('runCommand refuses interpreter metacharacters on the shim path', () => {
  it('refuses a branch name carrying a command separator', async () => {
    const entry = await runCommand('cmd.exe', ['/c', 'gh.cmd', 'pr', 'create', '--base', 'main&calc.exe'], dir)
    expect(entry.ok).toBe(false)
    expect(entry.stderr).toContain('Refused to run')
  })

  it.each(['a&b', 'a|b', 'a>b', 'a<b', 'a^b', 'a%PATH%b', 'a\nb', 'a"b'])(
    'refuses %j',
    async (value) => {
      const entry = await runCommand('cmd.exe', ['/c', 'gh.cmd', '--base', value], dir)
      expect(entry.ok).toBe(false)
      expect(entry.stderr).toContain('Refused to run')
    },
  )

  it('leaves ordinary values alone — the guard must not break normal use', async () => {
    // Runs for real; `cmd.exe /c echo` is harmless and proves the guard let it through.
    const entry = await runCommand('cmd.exe', ['/c', 'echo', 'studio/1758700000000'], dir)
    expect(entry.stderr).not.toContain('Refused to run')
    expect(entry.stdout).toContain('studio/1758700000000')
  })

  it('does not interfere with commands that are not the interpreter', async () => {
    const entry = await runCommand(process.execPath, ['-e', 'console.log(process.argv[1])', 'a&b'], dir)
    expect(entry.ok).toBe(true)
    expect(entry.stdout.trim()).toBe('a&b') // arrives intact, and nothing ran
  })

  it.skipIf(!onWindows)('and the attack it blocks really did work before', async () => {
    const marker = join(dir, 'PWNED.txt')
    const shim = join(dir, 'fakegh.cmd')
    writeFileSync(shim, '@echo off\r\necho shim got: %*\r\n')

    const entry = await runCommand('cmd.exe', ['/c', shim, '--base', `main&echo>${marker}`], dir)
    expect(entry.ok).toBe(false)
    expect(existsSync(marker), 'the injected command ran — the guard did not hold').toBe(false)
  })
})
