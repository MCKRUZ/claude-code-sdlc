/** The pure maps (hosts/adoMap.ts) on the captured az documents, with every expectation DERIVED
 * from the document under test: the rule is restated here in plain terms (a vote of +5 or more
 * is an approval, a build-validation record is a check, a trial merge is not a merge, …) and
 * applied to whatever rows this capture holds. A row a capture happens not to contain — an
 * abandoned PR, a -5 vote, a label — is skipped BY NAME rather than faked, so the skip list in
 * the run output is the honest coverage report for that capture. Shared loading and the
 * fixture-derived selectors live in test/adoFixtures.ts; the host-level tests are in
 * test/codeHostProviders.test.ts. */

import { describe, expect, it } from 'vitest'
import { AdoShapeError, mapChecks, mapPolicies, mapPr, stripRef } from '../electron/main/hosts/azureDevOpsHost'
import {
  APPROVERS_TYPE, configOf, contextOf, isCheckType, isDict, policyList, policyRecords, prDocs, prList, remote, REPO_GUID,
  reviewersOf, settingsOf, str, typeIdOf, upn, voteOf, votersOf, type Dict,
} from './adoFixtures'

const SHA = /^[0-9a-f]{40}$/
const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const STATE: Record<string, string> = { active: 'OPEN', completed: 'MERGED', abandoned: 'CLOSED' }
// PolicyEvaluationRecord.status → gh (status, conclusion): the documented values, pinned here so
// a capture that shows a new one fails this table rather than being read however the code likes.
const STATUS_PIN: Record<string, [string, string | null]> = {
  queued: ['IN_PROGRESS', null], running: ['IN_PROGRESS', null],
  approved: ['COMPLETED', 'SUCCESS'], notApplicable: ['COMPLETED', 'SUCCESS'],
  rejected: ['COMPLETED', 'FAILURE'], broken: ['COMPLETED', 'FAILURE'],
}

/** What mapPr must say about a row, restated from the rules rather than read back from mapPr. */
function expectedPr(pr: Dict) {
  const voters = votersOf(pr)
  const decided = voters.filter((r) => voteOf(r) >= 5 || voteOf(r) <= -5)
  const pending = voters.filter((r) => voteOf(r) > -5 && voteOf(r) < 5)
  const reviews = decided.map((r) => ({ state: voteOf(r) >= 5 ? 'APPROVED' : 'CHANGES_REQUESTED', author: { login: upn(r) }, submittedAt: null }))
  const completed = pr.status === 'completed'
  const trial = isDict(pr.lastMergeCommit) ? str(pr.lastMergeCommit.commitId) : ''
  return {
    number: pr.pullRequestId, state: STATE[str(pr.status)], headRefName: stripRef(pr.sourceRefName),
    url: `${remote.webUrl}/pullrequest/${pr.pullRequestId}`, isDraft: pr.isDraft === true,
    author: { login: upn(pr.createdBy) }, headRepositoryOwner: { login: isDict(pr.repository) ? str(pr.repository.id) : '' },
    reviews,
    reviewRequests: [...pending.filter((r) => r.isRequired === true), ...pending.filter((r) => r.isRequired !== true)].map((r) => ({ login: upn(r) })),
    reviewDecision: reviews.some((r) => r.state === 'APPROVED') ? 'APPROVED' : reviews.length ? 'CHANGES_REQUESTED' : 'REVIEW_REQUIRED',
    labels: (Array.isArray(pr.labels) ? pr.labels : []).filter(isDict).map((lb) => ({ name: str(lb.name) })),
    mergedAt: completed ? pr.closedDate : null, mergeCommit: completed && trial ? { oid: trial } : null,
    createdAt: pr.creationDate, updatedAt: null, files: null, statusCheckRollup: [], _notes: [],
  }
}

/** What mapPolicies must say about a configuration list, restated from the rule. */
function expectedPolicies(configs: Dict[]) {
  const enabled = configs.filter((c) => c.isEnabled === true)
  return { enforcing: enabled.some((c) => c.isBlocking === true), requiredContexts: enabled.filter((c) => isCheckType(typeIdOf(c))).map(contextOf) }
}

const find = (pred: (p: Dict) => boolean): Dict | null => prDocs.find(pred) ?? null
const active = find((p) => p.status === 'active' && isDict(p.lastMergeCommit))
const completed = find((p) => p.status === 'completed' && isDict(p.lastMergeCommit))
const abandoned = find((p) => p.status === 'abandoned')
const approved = find((p) => votersOf(p).some((r) => voteOf(r) >= 5))
const rejected = find((p) => votersOf(p).some((r) => voteOf(r) <= -5))
const labelled = find((p) => Array.isArray(p.labels) && p.labels.length > 0)
const anyRow = prDocs[0]!

describe('mapPr on every captured pull request', () => {
  it('reads a capture that can prove something', () => {
    expect(prDocs.length).toBeGreaterThan(0)
    expect(REPO_GUID).toMatch(GUID)
    expect(remote.host).toBe('azure-devops')
    // Only this capture's own listing is compared to its `repos show` — a `pr show` kept from an
    // earlier capture numbers its GUIDs independently (CAPTURE-NOTES.md).
    for (const pr of prList) expect(isDict(pr.repository) ? pr.repository.id : null).toBe(REPO_GUID)
  })

  it('every row: state, head branch, author UPN, repository GUID, URL from the remote, votes → reviews; files is null', () => {
    for (const pr of prDocs) expect(mapPr(pr, remote.webUrl)).toEqual(expectedPr(pr))
  })

  it.skipIf(!approved)('a vote of +5 or above is APPROVED and decides the review', () => {
    const got = mapPr(approved!, remote.webUrl)
    expect(got.reviews.map((r) => r.state)).toContain('APPROVED')
    expect(got.reviewDecision).toBe('APPROVED')
  })

  it.skipIf(!active)('an active row carries lastMergeCommit — the trial merge — and it is NOT a merge commit', () => {
    expect(str((active!.lastMergeCommit as Dict).commitId)).toMatch(SHA)
    expect(mapPr(active!, remote.webUrl)).toMatchObject({ state: 'OPEN', mergedAt: null, mergeCommit: null })
  })

  it.skipIf(!completed)('a completed row is MERGED at closedDate, with lastMergeCommit as the merge commit', () => {
    const got = mapPr(completed!, remote.webUrl)
    expect(got).toMatchObject({ state: 'MERGED', mergedAt: completed!.closedDate, mergeCommit: { oid: (completed!.lastMergeCommit as Dict).commitId } })
    expect(typeof got.mergedAt).toBe('string')
    expect(got.mergeCommit?.oid).toMatch(SHA)
  })

  it.skipIf(!abandoned)('an abandoned row is CLOSED and lends no merge', () => {
    expect(mapPr(abandoned!, remote.webUrl)).toMatchObject({ state: 'CLOSED', mergedAt: null, mergeCommit: null })
  })

  it.skipIf(!rejected)('a vote of -5 or below is CHANGES_REQUESTED', () => {
    const got = mapPr(rejected!, remote.webUrl)
    expect(got.reviews.map((r) => r.state)).toContain('CHANGES_REQUESTED')
    expect(got.reviewDecision).toBe(got.reviews.some((r) => r.state === 'APPROVED') ? 'APPROVED' : 'CHANGES_REQUESTED')
  })

  it.skipIf(!labelled)('labels ride through by name', () => {
    expect(mapPr(labelled!, remote.webUrl).labels).toEqual((labelled!.labels as Dict[]).map((lb) => ({ name: lb.name })))
  })

  it("the author's own +10 is never a non-author approval, and a group (isContainer) never votes", () => {
    const base = mapPr(anyRow, remote.webUrl)
    const author = { ...(anyRow.createdBy as Dict), vote: 10, isRequired: true }
    const group = { displayName: 'Team', uniqueName: 'vstfs:///Classification/TeamProject/x', vote: 10, isContainer: true }
    const padded = mapPr({ ...anyRow, reviewers: [...reviewersOf(anyRow), author, group] }, remote.webUrl)
    expect(padded.reviews).toEqual(base.reviews)
    expect(padded.reviewRequests).toEqual(base.reviewRequests)
    expect(padded.reviewDecision).toBe(base.reviewDecision)
  })

  it('an unknown status reads OPEN with a note; a missing key is AdoShapeError, never a default; no remote, no URL', () => {
    const odd = mapPr({ ...anyRow, status: 'mystery' }, remote.webUrl)
    expect(odd.state).toBe('OPEN')
    expect(odd._notes.join('\n')).toContain('mystery')
    const { createdBy: _dropped, ...noAuthor } = anyRow
    expect(() => mapPr(noAuthor, remote.webUrl)).toThrow(AdoShapeError)
    expect(() => mapPr(noAuthor, remote.webUrl)).toThrow(/missing GitPullRequest.createdBy/)
    expect(mapPr(anyRow, null).url).toBeNull()
  })
})

describe('mapChecks on the captured policy evaluations', () => {
  const checkRecords = policyRecords.filter((r) => isCheckType(typeIdOf(configOf(r))))
  const otherRecords = policyRecords.filter((r) => !isCheckType(typeIdOf(configOf(r))))
  const approverRecord = otherRecords.find((r) => typeIdOf(configOf(r)) === APPROVERS_TYPE) ?? null

  it.skipIf(policyRecords.length === 0)('every build/status record is a check named from its settings, blocking from isBlocking, status from the pin; nothing else is', () => {
    const checks = mapChecks(policyRecords)
    expect(checks).toHaveLength(checkRecords.length)
    expect(checks).toEqual(checkRecords.map((r) => {
      const cfg = configOf(r)
      const base = { name: settingsOf(cfg).displayName, blocking: cfg.isBlocking }
      const pin = STATUS_PIN[str(r.status)]
      return pin ? { ...base, status: pin[0], conclusion: pin[1] } : { ...base, status: 'COMPLETED', conclusion: null, _note: expect.stringContaining(str(r.status)) }
    }))
    expect(mapChecks(otherRecords)).toEqual([])
  })

  it.skipIf(!approverRecord)('the minimum-approver-count policy (fa4e907d…) is the approval rung, not a check', () => {
    expect(mapChecks([approverRecord!])).toEqual([])
  })

  it.skipIf(checkRecords.length === 0)('an unseen status reads completed with no conclusion and says so; a record without configuration is a shape error', () => {
    const [odd] = mapChecks([{ ...checkRecords[0]!, status: 'mystery' }])
    expect(odd).toMatchObject({ status: 'COMPLETED', conclusion: null, _note: expect.stringContaining('mystery') })
    expect(() => mapChecks([{ status: 'approved' }])).toThrow(AdoShapeError)
    expect(() => mapChecks([{ status: 'approved' }])).toThrow(/missing PolicyEvaluationRecord.configuration/)
    expect(mapChecks([])).toEqual([])
  })
})

describe('mapPolicies on the captured configurations', () => {
  // The default-branch `repos policy list` answer may legitimately be `[]`; the evaluation records
  // carry the same PolicyConfiguration shape, so they stand in when it is.
  const configs = policyList.length > 0 ? policyList : policyRecords.map(configOf)

  it('the default-branch list: enforcing iff any enabled policy blocks', () => {
    expect(mapPolicies(policyList)).toEqual(expectedPolicies(policyList))
  })

  it.skipIf(configs.length === 0)('enforcing iff any enabled policy blocks; requiredContexts = the enabled build/status names in fixture order; an optional check is still a context', () => {
    expect(configs.some((c) => c.isEnabled === true && c.isBlocking === true)).toBe(true) // or the next line proves nothing
    expect(mapPolicies(configs)).toEqual(expectedPolicies(configs))
    expect(mapPolicies(configs).requiredContexts.length).toBeGreaterThan(0)
    const optional = configs.map((c) => ({ ...c, isBlocking: false }))
    expect(mapPolicies(optional)).toEqual({ enforcing: false, requiredContexts: expectedPolicies(configs).requiredContexts })
    expect(mapPolicies(configs.map((c) => ({ ...c, isEnabled: false })))).toEqual({ enforcing: false, requiredContexts: [] })
    expect(mapPolicies([])).toEqual({ enforcing: false, requiredContexts: [] })
  })
})
