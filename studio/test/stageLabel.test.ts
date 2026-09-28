/** What the stage list says about a finished stage.
 *
 * The plugin's `stage_state: 'signed_off'` only means the stage's status is `completed` — it is
 * set whether or not anyone signed. On a real project Discovery and Requirements were completed
 * with no name recorded, and the list still said "Signed off". The name is reported separately
 * (`signed_off_by`); the label has to use it, or it claims a signature nobody made.
 */

import { describe, expect, it } from 'vitest'
import { stageStateLabel } from '../shared/stageLabel'

describe('stageStateLabel', () => {
  it('says "Signed off" only when a name was recorded', () => {
    expect(stageStateLabel({ stage_state: 'signed_off', signed_off_by: 'Matt Kruczek' })).toBe('Signed off')
  })

  it('says "Completed" for a finished stage with no recorded name', () => {
    expect(stageStateLabel({ stage_state: 'signed_off', signed_off_by: null })).toBe('Completed')
  })

  it('treats a blank name as no name', () => {
    expect(stageStateLabel({ stage_state: 'signed_off', signed_off_by: '   ' })).toBe('Completed')
  })

  it('leaves the other states as they were', () => {
    expect(stageStateLabel({ stage_state: 'current', signed_off_by: null })).toBe('Current')
    expect(stageStateLabel({ stage_state: 'later', signed_off_by: null })).toBe('Later')
  })
})
