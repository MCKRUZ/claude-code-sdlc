/** Which pull request Studio is willing to merge on its own.
 *
 * Spec 0010's security pass found this merging `prs[0]` from a name search. A search is not
 * an exact filter and it returns other people's pull requests too — on a public repository,
 * anyone's, opened from a fork. Studio then merged it into the protected default branch with
 * the user's credentials, which is precisely the branch protection and review requirement
 * that sent the save down the pull-request path in the first place, undone.
 *
 * Every case below is a way that could happen. The rule is deliberately all-or-nothing:
 * Studio merges the exact branch it pushed, opened by the signed-in account, from this
 * repository rather than a fork.
 */

import { describe, expect, it } from 'vitest'
import { isOursToMerge, type PrListEntry } from '../electron/main/sync'

const OURS: PrListEntry = {
  number: 7,
  headRefName: 'studio/1758700000000',
  author: { login: 'matt' },
  headRepositoryOwner: { login: 'MCKRUZ' },
}

const pushed = 'studio/1758700000000'

describe('isOursToMerge', () => {
  it('merges the branch this Studio pushed, from this account, in this repository', () => {
    expect(isOursToMerge(OURS, pushed, 'matt', 'MCKRUZ')).toBe(true)
  })

  it('refuses a different branch that merely looks like ours', () => {
    expect(isOursToMerge({ ...OURS, headRefName: 'studio/9999999999999' }, pushed, 'matt', 'MCKRUZ')).toBe(false)
    expect(isOursToMerge({ ...OURS, headRefName: 'studio/1758700000000-evil' }, pushed, 'matt', 'MCKRUZ')).toBe(false)
  })

  it('refuses a pull request somebody else opened', () => {
    expect(isOursToMerge({ ...OURS, author: { login: 'a-stranger' } }, pushed, 'matt', 'MCKRUZ')).toBe(false)
  })

  it('refuses one whose branch lives in a fork', () => {
    expect(isOursToMerge({ ...OURS, headRepositoryOwner: { login: 'a-stranger' } }, pushed, 'matt', 'MCKRUZ')).toBe(false)
  })

  it('refuses everything when Studio has no pull request outstanding', () => {
    expect(isOursToMerge(OURS, null, 'matt', 'MCKRUZ')).toBe(false)
    expect(isOursToMerge(OURS, undefined, 'matt', 'MCKRUZ')).toBe(false)
    expect(isOursToMerge(OURS, '', 'matt', 'MCKRUZ')).toBe(false)
  })

  it('refuses when it cannot tell who is signed in or whose repository this is', () => {
    // Not knowing must never read as "fine" — that is how an unknown becomes a merge.
    expect(isOursToMerge(OURS, pushed, null, 'MCKRUZ')).toBe(false)
    expect(isOursToMerge(OURS, pushed, 'matt', null)).toBe(false)
  })

  it('refuses when the pull request itself reports no author or head owner', () => {
    expect(isOursToMerge({ ...OURS, author: null }, pushed, 'matt', 'MCKRUZ')).toBe(false)
    expect(isOursToMerge({ ...OURS, headRepositoryOwner: null }, pushed, 'matt', 'MCKRUZ')).toBe(false)
    expect(isOursToMerge({ ...OURS, author: {} }, pushed, 'matt', 'MCKRUZ')).toBe(false)
  })
})
