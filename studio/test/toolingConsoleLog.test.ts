/** Spec 0008: "every command Studio runs appears in the console... nothing runs that does
 * not appear there." Startup tool detection (claude/uv/git/gh) used to call execFile
 * directly, bypassing the console log entirely — caught in this spec's audit (2026-09-26).
 * Proven here against a real binary (git, which this checkout depends on to exist) rather
 * than a mock, so a regression back to a direct execFile call would show up as a real gap in
 * the log, not just as an assertion against a stub.
 */

import { describe, expect, it } from 'vitest'
import { getConsoleLog } from '../electron/main/commandRunner'
import { detectGit } from '../electron/main/tooling'

describe('tool detection reaches the console log', () => {
  it('detecting git appears in the console log like any other command', async () => {
    const result = await detectGit()
    expect(result.found, 'this checkout has no git on PATH — cannot prove the log capture').toBe(true)

    const logged = getConsoleLog().find((e) => e.command === 'git' && e.args.includes('--version'))
    expect(logged, 'git --version never reached the console log').toBeTruthy()
    expect(logged!.ok).toBe(true)
  })
})
