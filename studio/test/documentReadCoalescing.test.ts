/** Spec 0017's fix pass, bug #7: `getStageReadiness()`'s own `locate()` (readiness.ts) and the
 * Workflow tab's live panel both call `openDocument()` for the current step's file — moments
 * apart on initial load, and potentially at once on a sign-off toggle. Before this fix, that
 * meant two subprocess round trips for the exact same read.
 *
 * `readShapeFromBytes` is mocked the same way `pluginContract.test.ts` already does it — it is
 * the one line in `openDocument()` that actually spawns a subprocess, so replacing it with a
 * controllable stand-in proves the COALESCING behaviour directly, without needing real
 * subprocess timing to race correctly on a slow CI machine.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../electron/main/sectionMerge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/sectionMerge')>()),
  readShapeFromBytes: vi.fn(),
}))

import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDocument, setField } from '../electron/main/documents'
import * as sectionMerge from '../electron/main/sectionMerge'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const DOC = '.sdlc/artifacts/00-discovery/constitution.md'

describe.skipIf(!PLUGIN.available)('openDocument coalesces concurrent reads of the same file', () => {
  let project = ''
  let realRead: typeof sectionMerge.readShapeFromBytes

  beforeEach(async () => {
    project = mkdtempSync(join(tmpdir(), 'studio-coalesce-'))
    mkdirSync(join(project, '.sdlc', 'artifacts', '00-discovery'), { recursive: true })
    cpSync(join(PLUGIN.scriptsDir, 'tests', 'fixtures', 'documents', 'constitution.md'), join(project, DOC))
    realRead = (await vi.importActual<typeof import('../electron/main/sectionMerge')>(
      '../electron/main/sectionMerge',
    )).readShapeFromBytes
    return () => rmSync(project, { recursive: true, force: true })
  })

  it('runs the underlying read only once for two callers asking for the same file at once', async () => {
    let calls = 0
    vi.mocked(sectionMerge.readShapeFromBytes).mockImplementation(async (...args) => {
      calls += 1
      await new Promise((r) => setTimeout(r, 30)) // stand-in for the real subprocess's latency
      return realRead(...args)
    })

    const [a, b] = await Promise.all([
      openDocument(project, PLUGIN.scriptsDir, DOC),
      openDocument(project, PLUGIN.scriptsDir, DOC),
    ])

    expect(calls).toBe(1)
    expect(a.ok).toBe(true)
    expect(a).toEqual(b)
  })

  it('still does a fresh read for a call that starts after the previous one has already finished', async () => {
    let calls = 0
    vi.mocked(sectionMerge.readShapeFromBytes).mockImplementation(async (...args) => {
      calls += 1
      return realRead(...args)
    })

    await openDocument(project, PLUGIN.scriptsDir, DOC)
    await openDocument(project, PLUGIN.scriptsDir, DOC)

    // NOT coalesced into a single call — that would make this a content cache, which is the
    // one thing it must never become: the polling this exists for depends on every tick doing
    // a real read.
    expect(calls).toBe(2)
  })

  it('a write-then-reread (setField) never shares its read with a concurrent, unrelated poll', async () => {
    // An ordinary, unhindered read first, just to find a field this fixture actually has.
    vi.mocked(sectionMerge.readShapeFromBytes).mockImplementation((...args) => realRead(...args))
    const before = await openDocument(project, PLUGIN.scriptsDir, DOC)
    const section = before.sections.find((s) => Object.values(s.fields).some((f) => f && !f.empty))!
    const [label] = Object.entries(section.fields).find(([, f]) => f && !f.empty)!

    // Make exactly the NEXT read hang — that is the poll's read below, started before setField
    // runs at all, so it is guaranteed to be the one that gets stuck. Everything in
    // openDocument()'s prelude up to the subprocess call runs synchronously, so by the time
    // `openDocument(...)` (unawaited) returns control here, this mock has already flipped
    // `firstCall` — setField's own two reads, issued after, see it already false.
    let releasePoll: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { releasePoll = resolve })
    let firstCall = true
    vi.mocked(sectionMerge.readShapeFromBytes).mockImplementation(async (...args) => {
      if (firstCall) { firstCall = false; await gate }
      return realRead(...args)
    })

    const pollPromise = openDocument(project, PLUGIN.scriptsDir, DOC) // in flight, stuck on `gate`

    // If setField's pre-write or post-write read were routed through the same coalescing cache
    // as the poll above (the bug this test would catch), this would hang on `gate` too and
    // never resolve before `releasePoll()` below — timing this test out as a clear failure.
    const setFieldResult = await setField(project, PLUGIN.scriptsDir, DOC, section.key, label, 'EDITED CONCURRENTLY')
    expect(setFieldResult.ok, setFieldResult.error).toBe(true)
    // Proves the write actually reached the returned content (not just that the call resolved)
    // — a stray exact-boundary assertion on this fixture's own field layout is not this test's
    // concern, so this checks containment rather than exact equality.
    const editedField = setFieldResult.sections.find((s) => s.key === section.key)!.fields[label]!
    expect(editedField.value).toContain('EDITED CONCURRENTLY')

    releasePoll?.()
    await pollPromise
  })
})
