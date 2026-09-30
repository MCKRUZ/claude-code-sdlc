/** Spec 0017's fix pass, bug #2: the exact scenario the review found — `viewedStageId` reads
 * `undefined` in project A (nobody picked a specific stage) and reads `undefined` again in
 * project B for the same reason. A reset effect keyed on `stageId` alone cannot tell those two
 * `undefined`s apart, so it never re-fires and the reader keeps whatever tab they were last on.
 * This is the core logic that has to change to fix it, extracted so it is provable without
 * needing a `useEffect` to actually run (this project's test suite has no jsdom/DOM environment
 * wired up — see workflowTab.test.ts's own note on the same limitation).
 */

import { describe, expect, it } from 'vitest'
import { stageHomeKey } from '../src/stageHomeKey'

describe('stageHomeKey', () => {
  it('differs across a project switch even when stageId is undefined in both', () => {
    // The exact reported scenario: never picked a stage in either project.
    expect(stageHomeKey('/projects/a', undefined)).not.toBe(stageHomeKey('/projects/b', undefined))
  })

  it('differs when only the stage changes, project held constant', () => {
    expect(stageHomeKey('/projects/a', '1')).not.toBe(stageHomeKey('/projects/a', '2'))
  })

  it('differs when only the project changes, stage id held constant', () => {
    expect(stageHomeKey('/projects/a', '1')).not.toBe(stageHomeKey('/projects/b', '1'))
  })

  it('is stable when neither changes', () => {
    expect(stageHomeKey('/projects/a', '1')).toBe(stageHomeKey('/projects/a', '1'))
    expect(stageHomeKey('/projects/a', undefined)).toBe(stageHomeKey('/projects/a', undefined))
  })
})
