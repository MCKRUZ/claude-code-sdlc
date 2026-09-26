/** runCommand's timeoutMs option — added so tooling.ts's startup probes (claude/uv/git/gh
 * detection) could move onto the same console-logging path as every other command Studio
 * runs, without losing the 5-second ceiling that used to stop a broken PATH entry from
 * hanging the app before a project is even open.
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getConsoleLog, runCommand } from '../electron/main/commandRunner'

describe('runCommand timeoutMs', () => {
  it('kills a hanging command and records it as a timed-out failure, not a hang', async () => {
    const startedAt = Date.now()
    const entry = await runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], process.cwd(), {
      timeoutMs: 300,
    })
    const elapsed = Date.now() - startedAt

    expect(entry.ok).toBe(false)
    expect(entry.stderr).toContain('Timed out')
    // Proves it was actually killed rather than left to run out its own clock — comfortably
    // under the interval's own 1000ms tick, let alone "forever".
    expect(elapsed).toBeLessThan(2000)
  })

  it('does not double-record when a command finishes well within its timeout', async () => {
    const before = getConsoleLog().length
    const entry = await runCommand('node', ['-e', 'process.exit(0)'], process.cwd(), {
      timeoutMs: 5000,
    })
    expect(entry.ok).toBe(true)
    // Exactly one entry. This proves the `settled` guard stops a double-record if the timer
    // ever did fire late — it does NOT by itself prove clearTimeout ran (that only matters for
    // not leaving a stray 5s timer alive, not for correctness of what lands in the log).
    expect(getConsoleLog().length).toBe(before + 1)
  })

  it.skipIf(process.platform !== 'win32')(
    'records a spawn() that throws synchronously as a failure, not an unhandled rejection',
    async () => {
      // Node's CVE-2024-27980 fix makes spawning a Windows .cmd/.bat path directly (without
      // shell:true) throw EINVAL SYNCHRONOUSLY rather than emit it asynchronously via the
      // 'error' event — caught by this session's own correctness review after tooling.ts's old
      // per-call try/catch was removed in favour of trusting runCommand's "never throws"
      // contract. Verified to actually reproduce on this machine before writing this test:
      // spawning a real .cmd file this way throws EINVAL, not merely a plausible guess.
      const cmdPath = join(tmpdir(), `runcommand-throws-${Date.now()}.cmd`)
      writeFileSync(cmdPath, '@echo off\r\necho hi\r\n')

      const entry = await runCommand(cmdPath, ['--version'], process.cwd())
      expect(entry.ok).toBe(false)
      expect(entry.stderr).toContain('EINVAL')
    },
  )
})
