/** runCommand's timeoutMs option — added so tooling.ts's startup probes (claude/uv/git/gh
 * detection) could move onto the same console-logging path as every other command Studio
 * runs, without losing the 5-second ceiling that used to stop a broken PATH entry from
 * hanging the app before a project is even open.
 */

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
    // Exactly one entry — the timeout being cleared, not just not-yet-fired, is what stops a
    // stray second finish() from a leftover timer landing in the log later.
    expect(getConsoleLog().length).toBe(before + 1)
  })
})
