/** runCommand's streaming extension (spec 0016) — a chat turn is a real model call, slow
 * enough that a console showing nothing until the whole thing finishes would be
 * indistinguishable from a hang. Extends runCommand() itself rather than giving chat its own
 * side channel, per the spec's own Delegation Plan ("a design that routes chat's calls
 * outside runCommand() does not meet the console-visibility acceptance check").
 */

import { describe, expect, it } from 'vitest'
import { getConsoleLog, onConsoleEntry, runCommand } from '../electron/main/commandRunner'

describe('runCommand — streaming (onChunk)', () => {
  it('calls onChunk with the accumulated stdout as it arrives, before the command finishes', async () => {
    const seen: string[] = []
    const script = [
      'process.stdout.write("first ");',
      'setTimeout(() => { process.stdout.write("second "); }, 200);',
      'setTimeout(() => { process.stdout.write("third"); }, 400);',
    ].join('')

    const entry = await runCommand('node', ['-e', script], process.cwd(), {
      onChunk: (soFar) => seen.push(soFar),
    })

    expect(entry.ok).toBe(true)
    expect(entry.stdout).toBe('first second third')
    // At least one interim call happened, and interim calls only ever grow — never truncate or
    // reorder what has already streamed in.
    expect(seen.length).toBeGreaterThan(0)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].startsWith(seen[i - 1])).toBe(true)
    }
  })

  it('broadcasts a live, pending ConsoleEntry (same id as the final one) through the SAME listeners onConsoleEntry uses — no separate channel', async () => {
    const broadcasts: Array<{ id: string; pending?: boolean; stdout: string }> = []
    const unsubscribe = onConsoleEntry((e) => broadcasts.push({ id: e.id, pending: e.pending, stdout: e.stdout }))

    try {
      const script = 'process.stdout.write("a"); setTimeout(() => process.stdout.write("b"), 200);'
      const entry = await runCommand('node', ['-e', script], process.cwd(), {
        onChunk: () => { /* also exercised by the test above; this test is about the broadcast */ },
      })

      // At least one pending broadcast (the immediate placeholder, or a streamed update) and
      // exactly one final, non-pending broadcast, all sharing the real entry's id.
      const forThisCommand = broadcasts.filter((b) => b.id === entry.id)
      expect(forThisCommand.length).toBeGreaterThanOrEqual(2) // placeholder + final, at minimum
      expect(forThisCommand.some((b) => b.pending === true)).toBe(true)
      const final = forThisCommand[forThisCommand.length - 1]
      expect(final.pending).toBeUndefined()
      expect(final.stdout).toBe('ab')
    } finally {
      unsubscribe()
    }
  })

  it('a live placeholder is NEVER pushed into getConsoleLog() — only the finished entry is', async () => {
    const before = getConsoleLog().length
    await runCommand('node', ['-e', 'process.stdout.write("x")'], process.cwd(), { onChunk: () => {} })
    const after = getConsoleLog()
    expect(after.length).toBe(before + 1) // exactly one entry recorded, not a placeholder plus a final
    expect(after[after.length - 1].pending).toBeUndefined()
  })

  it('a command with no onChunk behaves exactly as before — no placeholder, no streaming overhead', async () => {
    const broadcasts: string[] = []
    const unsubscribe = onConsoleEntry((e) => broadcasts.push(e.id))
    try {
      const entry = await runCommand('node', ['-e', 'process.stdout.write("x")'], process.cwd())
      const forThisCommand = broadcasts.filter((id) => id === entry.id)
      expect(forThisCommand).toHaveLength(1) // exactly the final broadcast, no placeholder
    } finally {
      unsubscribe()
    }
  })
})
