/** runCommand's `signal` option (spec 0027): a running job can be stopped. The process is killed (the
 * whole tree on Windows), the stop is recorded in the console like any other outcome, and the caller
 * can tell "cancelled" from "failed" without the renderer's ConsoleEntry shape changing. */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getConsoleLog, runCommand, wasCancelled } from '../electron/main/commandRunner'

const HANG = 'setInterval(() => {}, 1000)'

async function gone(pid: number, withinMs = 5000): Promise<boolean> {
  const deadline = Date.now() + withinMs
  while (Date.now() < deadline) {
    try { process.kill(pid, 0) } catch { return true }
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

describe('runCommand signal', () => {
  it('kills a running command and records it as cancelled, not as a failure of its own', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'studio-cancel-'))
    try {
      const pidFile = join(dir, 'pid')
      const controller = new AbortController()
      const before = getConsoleLog().length
      const run = runCommand(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${HANG}`], dir, { signal: controller.signal })

      for (let i = 0; i < 100; i++) { try { readFileSync(pidFile); break } catch { await new Promise((r) => setTimeout(r, 50)) } }
      const pid = Number(readFileSync(pidFile, 'utf-8'))
      controller.abort()
      const entry = await run

      expect(wasCancelled(entry)).toBe(true)
      expect(entry.ok).toBe(false)
      expect(entry.exitCode).toBeNull()
      expect(entry.stderr).toContain('Cancelled')
      expect(getConsoleLog().length).toBe(before + 1) // recorded once, with the rest of the console
      expect(await gone(pid)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not start anything when the signal is already aborted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'studio-cancel-'))
    try {
      const marker = join(dir, 'ran')
      const controller = new AbortController()
      controller.abort()
      const entry = await runCommand(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`], dir, { signal: controller.signal })
      expect(wasCancelled(entry)).toBe(true)
      await new Promise((r) => setTimeout(r, 300))
      expect(() => readFileSync(marker)).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves an ordinary failure and an ordinary success unmarked', async () => {
    const controller = new AbortController()
    const failed = await runCommand(process.execPath, ['-e', 'process.exit(3)'], process.cwd(), { signal: controller.signal })
    const ok = await runCommand(process.execPath, ['-e', 'process.exit(0)'], process.cwd(), { signal: controller.signal })
    expect(wasCancelled(failed)).toBe(false)
    expect(failed.ok).toBe(false)
    expect(wasCancelled(ok)).toBe(false)
    expect(ok.ok).toBe(true)
  })

  it('ignores an abort that arrives after the command has finished', async () => {
    const controller = new AbortController()
    const entry = await runCommand(process.execPath, ['-e', 'process.exit(0)'], process.cwd(), { signal: controller.signal })
    controller.abort()
    expect(entry.ok).toBe(true)
    expect(wasCancelled(entry)).toBe(false)
  })

  it('does not put the cancelled marker into what reaches the window', async () => {
    const controller = new AbortController()
    controller.abort()
    const entry = await runCommand(process.execPath, ['-e', ''], process.cwd(), { signal: controller.signal })
    expect(Object.keys(entry).sort()).toEqual(
      ['args', 'command', 'cwd', 'durationMs', 'exitCode', 'id', 'ok', 'startedAt', 'stderr', 'stdout'],
    )
    expect(JSON.parse(JSON.stringify(entry))).not.toHaveProperty('cancelled')
  })
})
