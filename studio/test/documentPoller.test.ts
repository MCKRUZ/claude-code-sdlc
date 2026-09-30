/** Spec 0017's fix pass, bugs #4 and #5 — proven with fake scheduling and fake visibility, no
 * real timers and no real `document`, so these run in milliseconds and never flake on timing.
 */

import { describe, expect, it, vi } from 'vitest'
import { startDocumentPolling } from '../src/documentPoller'
import type { DocumentSnapshot } from '../src/documentSnapshot'
import type { OpenDocumentResult } from '../shared/types'

/** `fetchDocumentSnapshot` chains an `await` on top of the poller's own `.then`, so settling a
 * fetch takes a few microtask hops before `onSnapshot` actually runs — a single
 * `await flush()` is not always enough. A real macrotask tick is generous and never
 * flaky. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function ok(marker: string): OpenDocumentResult {
  return { ok: true, path: 'a.md', shaped: true, warnings: [], sections: [{
    kind: 'free_text', key: `free_text@0`, heading: '', start: 0, end: marker.length, text: marker, fields: {},
  }] }
}

/** A fake `setInterval`/`onVisibilityChange` harness: `tick()` fires the interval callback
 * exactly as a real timer firing would, and `becomeVisible()`/`becomeHidden()` drive
 * `isHidden()` and the visibility-change subscriber — all synchronously, under the caller's own
 * control, with no real clock or `document` involved. */
function fakeScheduler() {
  let intervalCb: (() => void) | null = null
  let visibilityCb: (() => void) | null = null
  let hidden = false
  return {
    isHidden: () => hidden,
    setInterval: vi.fn((cb: () => void) => { intervalCb = cb; return 1 }),
    clearInterval: vi.fn(),
    onVisibilityChange: vi.fn((cb: () => void) => { visibilityCb = cb; return () => { visibilityCb = null } }),
    tick: () => intervalCb?.(),
    becomeHidden: () => { hidden = true },
    becomeVisible: () => { hidden = false; visibilityCb?.() },
  }
}

describe('startDocumentPolling — bug #4, pausing while hidden', () => {
  it('does not fetch on a tick that fires while hidden, and catches up immediately on becoming visible', async () => {
    const scheduler = fakeScheduler()
    let calls = 0
    const openDocument = async () => { calls += 1; return ok(`call ${calls}`) }

    const stop = startDocumentPolling({
      openDocument, projectPath: '/p', relPath: 'a.md', intervalMs: 2000, onSnapshot: () => {},
      ...scheduler,
    })
    await flush() // let the initial, unconditional first tick's fetch resolve
    expect(calls).toBe(1)

    scheduler.becomeHidden()
    scheduler.tick() // due, but hidden
    scheduler.tick() // due again, still hidden
    await flush()
    expect(calls).toBe(1) // neither ran a fetch

    scheduler.becomeVisible() // fires the catch-up tick immediately, not on the next interval
    await flush()
    expect(calls).toBe(2)

    stop()
  })

  it('polls normally while visible the whole time', async () => {
    const scheduler = fakeScheduler()
    let calls = 0
    const stop = startDocumentPolling({
      openDocument: async () => { calls += 1; return ok('x') },
      projectPath: '/p', relPath: 'a.md', intervalMs: 2000, onSnapshot: () => {}, ...scheduler,
    })
    await flush()
    scheduler.tick()
    await flush()
    scheduler.tick()
    await flush()
    expect(calls).toBe(3) // initial + two ticks
    stop()
  })

  it('stopping clears the interval and unsubscribes from visibility', () => {
    const scheduler = fakeScheduler()
    const stop = startDocumentPolling({
      openDocument: async () => ok('x'),
      projectPath: '/p', relPath: 'a.md', intervalMs: 2000, onSnapshot: () => {}, ...scheduler,
    })
    stop()
    expect(scheduler.clearInterval).toHaveBeenCalledTimes(1)
    // A tick or a visibility change after stopping must not fetch again.
    scheduler.becomeVisible()
    scheduler.tick()
  })
})

describe('startDocumentPolling — bug #5, discarding a stale response', () => {
  it('applies only the result of the most recently STARTED fetch, discarding an earlier one that resolves later', async () => {
    const scheduler = fakeScheduler()
    const snapshots: DocumentSnapshot[] = []
    const resolvers: Array<(doc: OpenDocumentResult) => void> = []
    const openDocument = () => new Promise<OpenDocumentResult>((resolve) => { resolvers.push(resolve) })

    const stop = startDocumentPolling({
      openDocument, projectPath: '/p', relPath: 'a.md', intervalMs: 2000,
      onSnapshot: (s) => snapshots.push(s), ...scheduler,
    })
    // The initial tick starts fetch #1 (pending). A second tick starts fetch #2 before #1
    // has resolved — the exact "each tick fires independent of whether the previous one
    // resolved" scenario the finding names.
    scheduler.tick()
    expect(resolvers).toHaveLength(2)

    // #2 (started LATER) resolves FIRST — the faster, fresher poll.
    resolvers[1](ok('fresh'))
    await flush()
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ kind: 'ok', doc: { sections: [{ text: 'fresh' }] } })

    // #1 (started EARLIER, slower) resolves AFTER #2 — its result must be discarded, not
    // applied on top of the fresher one already shown.
    resolvers[0](ok('stale'))
    await flush()
    expect(snapshots).toHaveLength(1) // unchanged — the stale result never reached onSnapshot

    stop()
  })

  it('a response that arrives after stop() is discarded too', async () => {
    const scheduler = fakeScheduler()
    const snapshots: DocumentSnapshot[] = []
    let resolve!: (doc: OpenDocumentResult) => void
    const openDocument = () => new Promise<OpenDocumentResult>((r) => { resolve = r })

    const stop = startDocumentPolling({
      openDocument, projectPath: '/p', relPath: 'a.md', intervalMs: 2000,
      onSnapshot: (s) => snapshots.push(s), ...scheduler,
    })
    stop()
    resolve(ok('too late'))
    await flush()
    expect(snapshots).toHaveLength(0)
  })
})
