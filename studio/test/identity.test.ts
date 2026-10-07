/** One identity module (togo-command-center.md §2.1): the "you" ring, the Mine filter and
 * needs-you all compare through `samePerson`, so they cannot disagree. Pure; nothing here looks
 * anything up. `boardModel.samePerson` is the same function, re-exported. */
import { describe, expect, it } from 'vitest'
import { samePerson as fromBoardModel } from '../shared/boardModel'
import { identityLabel, looksLikeUpn, normalizeHandle, rolesHeld, samePerson, UNMAPPED } from '../shared/identity'

describe('samePerson', () => {
  it('matches the roster form against the bare handle, any case, with stray whitespace', () => {
    expect(samePerson('@Sam-K', 'sam-k')).toBe(true)
    expect(samePerson(' sam-k ', '@SAM-K')).toBe(true)
    expect(samePerson('@arjun', '@arjun')).toBe(true)
  })

  it('never matches nobody: null, undefined, blank and a lone @ are not people', () => {
    expect(samePerson(null, 'sam')).toBe(false)
    expect(samePerson('sam', undefined)).toBe(false)
    expect(samePerson('', '')).toBe(false)
    expect(samePerson('@', '@')).toBe(false)
    expect(samePerson('  ', 'sam')).toBe(false)
  })

  it('does not match a prefix or a different handle', () => {
    expect(samePerson('sam', 'sam-k')).toBe(false)
    expect(samePerson('@priya', '@priyan')).toBe(false)
  })

  it('is the one function boardModel re-exports', () => {
    expect(fromBoardModel).toBe(samePerson)
  })

  it('normalises as the roster does', () => {
    expect(normalizeHandle(' @Sam-K ')).toBe('sam-k')
  })
})

describe('rolesHeld', () => {
  const row = { owner: '@sam', developer: '@sam', checker: '@priya', nextOwner: '' }
  it('is a set: owner and developer may be the same person', () => {
    expect(rolesHeld(row, 'sam')).toEqual(['owner', 'developer'])
    expect(rolesHeld(row, '@PRIYA')).toEqual(['checker'])
  })
  it('is empty with no actor, and a blank field names nobody', () => {
    expect(rolesHeld(row, null)).toEqual([])
    expect(rolesHeld({ owner: '', developer: undefined, checker: null, nextOwner: '@lee' }, 'lee')).toEqual(['nextOwner'])
  })
})

describe('identityLabel — a UPN the roster does not know reads "unmapped"', () => {
  it('prefers the roster handle', () => {
    expect(identityLabel('sam@corp.com', '@sam-k')).toBe('@sam-k')
  })
  it('marks an unmapped UPN, leaves a GitHub login or typed name alone, and is null for nobody', () => {
    expect(looksLikeUpn('sam@corp.com')).toBe(true)
    expect(looksLikeUpn('sam-k')).toBe(false)
    expect(identityLabel('sam@corp.com', null)).toBe(`sam@corp.com · ${UNMAPPED}`)
    expect(identityLabel('sam-k', null)).toBe('sam-k')
    expect(identityLabel('Sam Kaur', null)).toBe('Sam Kaur')
    expect(identityLabel(null, null)).toBeNull()
    expect(identityLabel('  ', '')).toBeNull()
  })
})
