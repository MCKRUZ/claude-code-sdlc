import { describe, expect, it } from 'vitest'
import { killLiveChildren, liveChildCount, runCommand } from '../electron/main/commandRunner'

/** Quitting must not wait on a child that outlived the window. A hanging child is registered
 * while it runs, `killLiveChildren` ends it, its run settles, and the registry empties. */
describe('live children at quit', () => {
  it('kills every running child and forgets it', async () => {
    const before = liveChildCount()
    const hang = runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], process.cwd())
    await new Promise((r) => setTimeout(r, 300))
    expect(liveChildCount()).toBe(before + 1)
    expect(killLiveChildren()).toBeGreaterThanOrEqual(1)
    expect(liveChildCount()).toBe(0)
    const entry = await hang
    expect(entry.ok).toBe(false)
  })

  it('a finished child leaves the registry on its own', async () => {
    await runCommand(process.execPath, ['-e', 'process.exit(0)'], process.cwd())
    expect(liveChildCount()).toBe(0)
  })
})
