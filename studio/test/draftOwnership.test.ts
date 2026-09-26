/** Whether a save must be refused because a pending draft belongs to someone else.
 *
 * Spec 0010's last open acceptance check: "while a draft waits for approval, only the person
 * who created it can change it — everyone else is refused, with a clear reason." Nothing
 * enforced this before — Studio's pending-pull-request tracking is a single slot per project,
 * so a second save while one was outstanding silently opened a competing pull request and
 * forgot the first one. This is the rule that closes that gap: fail closed on an unknown
 * caller, but never block a legacy project that has a pending branch with no recorded owner
 * (there is nothing to compare against, so nobody is refused).
 */

import { describe, expect, it } from 'vitest'
import { blocksSave } from '../electron/main/sync'

describe('blocksSave', () => {
  it('lets the owner keep changing their own draft', () => {
    expect(blocksSave('matt', 'matt')).toBe(false)
  })

  it('refuses anyone else while a draft is pending', () => {
    expect(blocksSave('matt', 'priya')).toBe(true)
  })

  it('refuses a caller Studio cannot identify', () => {
    expect(blocksSave('matt', undefined)).toBe(true)
    expect(blocksSave('matt', null)).toBe(true)
    expect(blocksSave('matt', '')).toBe(true)
  })

  it('blocks nobody when there is no pending draft', () => {
    expect(blocksSave(null, 'priya')).toBe(false)
    expect(blocksSave(undefined, 'priya')).toBe(false)
  })

  it('blocks nobody when a pending draft has no recorded owner (state from before this existed)', () => {
    expect(blocksSave(null, 'priya')).toBe(false)
  })
})
