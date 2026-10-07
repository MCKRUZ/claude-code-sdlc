import { describe, expect, it } from 'vitest'
import { runCommand } from '../electron/main/commandRunner'

/** Every spawned command speaks UTF-8 on its pipes. Python on Windows otherwise encodes a piped
 * stdout in the console code page, and the plugin prints '→' and '·' — `sprint.py new` died with
 * UnicodeEncodeError on the Windows runner. A caller's own env still wins over the defaults. */
describe('runCommand spawn environment', () => {
  it('sets PYTHONUTF8 and PYTHONIOENCODING for the child', async () => {
    const entry = await runCommand(process.execPath, ['-e', 'console.log(process.env.PYTHONUTF8 + "|" + process.env.PYTHONIOENCODING)'], process.cwd())
    expect(entry.stdout.trim()).toBe('1|utf-8')
  })

  it('lets a caller override them', async () => {
    const entry = await runCommand(process.execPath, ['-e', 'console.log(process.env.PYTHONUTF8)'], process.cwd(), { env: { PYTHONUTF8: '0' } })
    expect(entry.stdout.trim()).toBe('0')
  })
})
