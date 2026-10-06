/** The renderer's one reason helper (code-host-providers.md §7.1): every string comes from
 * shared/codeHostModel.ts, and not knowing ('unknown') is never a reason to disable anything. */
import { describe, expect, it } from 'vitest'
import { WORDING } from '../shared/codeHostModel'
import { connectionBannerText, hostReasons, signedInSentence, type SignedInSlice } from '../src/hostReasons'

const ADO_OK: SignedInSlice = {
  host: 'azure-devops', cli: { name: 'az', found: true, extension: true, signedIn: 'yes' },
  account: 'sam@corp.com', accountSource: 'roster', rosterHandle: '@sam-k',
}
const ADO_NO_AZ: SignedInSlice = {
  host: 'azure-devops', cli: { name: 'az', found: false, extension: null, signedIn: 'unknown', reason: WORDING.azMissing },
  account: null, accountSource: null, rosterHandle: null,
}
const GH_SIGNED_OUT: SignedInSlice = {
  host: 'github', cli: { name: 'gh', found: true, extension: null, signedIn: 'no', reason: WORDING.ghSignedOut },
  account: null, accountSource: null, rosterHandle: null,
}

describe('hostReasons', () => {
  it('az missing on Azure DevOps disables the whole §7.1 set, each with its reason', () => {
    const r = hostReasons(ADO_NO_AZ)
    expect(r.board).toBe('Live pull-request status needs the Azure CLI')
    expect(r.handoff).toBe('The hand-off completes locally; assigning on Azure DevOps needs az')
    expect(r.pipelineEvidence).toContain('Azure CLI (az) with the azure-devops extension')
    expect(r.gateCredential).toBe('Reading the gate credential needs the Azure CLI')
    expect(r.saveWhenProtected).toContain('az is not available to open a pull request')
    expect(r.signedInAs).toBe('unavailable (az not installed)')
  })

  it('everything in order → no reasons at all; no connection → no reasons either', () => {
    expect(Object.values(hostReasons(ADO_OK)).every((v) => v === null)).toBe(true)
    expect(Object.values(hostReasons(null)).every((v) => v === null)).toBe(true)
  })

  it("'unknown' (not probed) is not a reason to disable anything", () => {
    const unknown: SignedInSlice = { ...ADO_OK, cli: { name: 'az', found: true, extension: null, signedIn: 'unknown' }, account: null, accountSource: null, rosterHandle: null }
    expect(hostReasons(unknown).board).toBeNull()
    expect(connectionBannerText(unknown)).toBeNull()
  })

  it('host none reads the hostNone sentence on every feature', () => {
    const none: SignedInSlice = { host: 'none', cli: { name: null, found: false, extension: null, signedIn: 'unknown' }, account: null, accountSource: null, rosterHandle: null }
    expect(hostReasons(none).board).toBe(WORDING.hostNone)
    expect(connectionBannerText(none)).toBeNull()
  })
})

describe('signedInSentence', () => {
  it('shows both halves of an identity: host account and roster handle', () => {
    expect(signedInSentence(ADO_OK)).toBe('az — signed in as sam@corp.com (roster: @sam-k)')
  })
  it('says a typed name is typed, for this session only', () => {
    expect(signedInSentence({ ...ADO_OK, account: 'Sam K', accountSource: 'typed', rosterHandle: null })).toBe('az — typed for this session: Sam K')
  })
  it("uses the main process's own §7.1 reason when nobody is identified", () => {
    expect(signedInSentence(ADO_NO_AZ)).toBe(`az — ${WORDING.azMissing}`)
    expect(signedInSentence(GH_SIGNED_OUT)).toBe(`gh — ${WORDING.ghSignedOut}`)
  })
})

describe('connectionBannerText', () => {
  it('prefers the recorded reason, falls back to WORDING, and is silent when all is well', () => {
    expect(connectionBannerText(ADO_NO_AZ)).toBe(WORDING.azMissing)
    expect(connectionBannerText({ ...GH_SIGNED_OUT, cli: { ...GH_SIGNED_OUT.cli, reason: undefined } })).toBe(WORDING.ghSignedOut)
    expect(connectionBannerText({ ...ADO_OK, cli: { name: 'az', found: true, extension: false, signedIn: 'unknown' } })).toBe(WORDING.azExtensionMissing)
    expect(connectionBannerText(ADO_OK)).toBeNull()
    expect(connectionBannerText(null)).toBeNull()
  })
})
