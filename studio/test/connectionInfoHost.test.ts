/** getConnectionInfo through the provider (code-host providers, Wave 6-B).
 *
 * Who is acting is answered in one order — the roster's handle for the signed-in identity, the
 * identity as the host gave it, a name typed for this session — and the last ONLY while the host
 * cannot identify the person (D-OWNER-5). The `cli` block is passed through as the resolver
 * established it, so the renderer's hostFeatureReason reads facts, not guesses. The provider and
 * the roster are faked through sync.ts's seam: no gh, no az, no plugin script is spawned. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostFeatureReason, WORDING, type CliStatus, type HostName, type HostSource } from '../shared/codeHostModel'
import type { RosterPerson } from '../shared/types'
import { CodeHostUnavailable, NullHost, type CodeHost, type Identity, type ResolvedCodeHost } from '../electron/main/codeHost'
import { actorFor, getConnectionInfo, rosterEmailFor, rosterHandleFor, setCodeHostSeam, setTypedActor } from '../electron/main/sync'
import { forgetTypedActor, getTypedActor } from '../electron/main/typedActor'

const made: string[] = []
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }) })
// Not a git repository on purpose: the branch and remote reads fail and are caught, which keeps
// the test about the host half. (git itself is spawned for those two reads; gh and az never.)
const project = () => { const d = mkdtempSync(join(tmpdir(), 'studio-conn-')); made.push(d); return d }

const UPN = 'sam.kay@contoso.com'
const ROSTER: RosterPerson[] = [
  { handle: '@sam-k', name: 'Sam Kay', email: 'Sam.Kay@Contoso.com' },
  { handle: '@priya-n', name: 'Priya N' },
  { handle: '@MCKRUZ', name: 'Matt' },
]
const SIGNED_IN: CliStatus = { name: 'az', found: true, extension: true, signedIn: 'yes' }

function fakeProvider(identity: Identity | Error, protectedBranch: boolean | null = true) {
  const whoAmI = vi.fn(async () => { if (identity instanceof Error) throw identity; return identity })
  const provider = {
    kind: 'azure-devops', cli: 'az', whoAmI,
    repoView: vi.fn(), isBranchProtected: vi.fn(async () => protectedBranch),
    createPullRequest: vi.fn(), listOpenPullRequests: vi.fn(), mergePullRequest: vi.fn(),
  } as unknown as CodeHost
  return { provider, whoAmI }
}

let restore: (() => void) | null = null
let rosterReads = 0
function arrange(resolved: Partial<ResolvedCodeHost> & { provider: CodeHost }, people: RosterPerson[] = ROSTER) {
  restore?.()
  rosterReads = 0
  const full: ResolvedCodeHost = { host: 'azure-devops', source: 'remote', remote: null, detail: 'origin', cli: SIGNED_IN, ...resolved }
  restore = setCodeHostSeam({ resolve: async () => full, readRoster: async () => { rosterReads++; return people } })
}

beforeEach(() => forgetTypedActor())
afterEach(() => { restore?.(); restore = null })

describe('getConnectionInfo — who is acting', () => {
  it('Azure DevOps, signed in, roster knows the UPN: account is the handle (no @), source roster, both halves carried', async () => {
    const { provider, whoAmI } = fakeProvider({ login: UPN, kind: 'upn' })
    arrange({ provider })
    const info = await getConnectionInfo(project(), '/plugin/scripts')
    expect(info).toMatchObject({
      account: 'sam-k', accountSource: 'roster', rosterHandle: '@sam-k',
      host: 'azure-devops', hostSource: 'remote', cli: SIGNED_IN, branchProtected: true,
    })
    expect(whoAmI).toHaveBeenCalledTimes(1)
    expect(rosterReads).toBe(1)
  })

  it('signed in but not in the roster: the UPN itself, source host, no handle invented from it', async () => {
    const { provider } = fakeProvider({ login: 'guest@partner.example', kind: 'upn' })
    arrange({ provider })
    const info = await getConnectionInfo(project(), '/plugin/scripts')
    expect(info).toMatchObject({ account: 'guest@partner.example', accountSource: 'host', rosterHandle: null })
  })

  it('GitHub: a login matches the roster handle case-insensitively and reads as roster', async () => {
    const { provider } = fakeProvider({ login: 'mckruz', kind: 'login' })
    arrange({ provider, host: 'github', cli: { name: 'gh', found: true, extension: null, signedIn: 'yes' } })
    const info = await getConnectionInfo(project(), '/plugin/scripts')
    expect(info).toMatchObject({ account: 'MCKRUZ', accountSource: 'roster', rosterHandle: '@MCKRUZ', host: 'github' })
  })

  it('without the plugin there is no roster: identity as the host gave it, source host, roster never read', async () => {
    const { provider } = fakeProvider({ login: UPN, kind: 'upn' })
    arrange({ provider })
    const info = await getConnectionInfo(project(), null)
    expect(info).toMatchObject({ account: UPN, accountSource: 'host', rosterHandle: null })
    expect(rosterReads).toBe(0)
  })

  it('branch protection the provider could not read is null, never false', async () => {
    const { provider } = fakeProvider({ login: UPN, kind: 'upn' })
    ;(provider.isBranchProtected as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('policies unreadable'))
    arrange({ provider })
    expect((await getConnectionInfo(project(), '/plugin/scripts')).branchProtected).toBeNull()
  })
})

describe('getConnectionInfo — the cli block per §7.1, and what it means for account', () => {
  it('PAT-only: signedIn no with the PAT wording, account null, whoAmI not asked again', async () => {
    const { provider, whoAmI } = fakeProvider(new CodeHostUnavailable(WORDING.azPatOnly, 'pat_only'))
    const cli: CliStatus = { ...SIGNED_IN, signedIn: 'no', reason: WORDING.azPatOnly }
    arrange({ provider, cli })
    const info = await getConnectionInfo(project(), '/plugin/scripts')
    expect(info).toMatchObject({ account: null, accountSource: null, rosterHandle: null, cli })
    expect(whoAmI).not.toHaveBeenCalled()
    expect(rosterReads).toBe(0)
    expect(hostFeatureReason(info, 'signedInAs')).toContain('unavailable')
  })

  it('az missing: NullHost, "not installed" wording (never "not signed in"), nothing probed, protection unknown', async () => {
    const cli: CliStatus = { name: 'az', found: false, extension: null, signedIn: 'unknown', reason: WORDING.azMissing }
    arrange({ provider: new NullHost(WORDING.azMissing, 'az', 'not_installed'), cli })
    const info = await getConnectionInfo(project(), '/plugin/scripts')
    expect(info).toMatchObject({ account: null, accountSource: null, cli, branchProtected: null })
    expect(info.cli.reason).not.toMatch(/sign/i)
    expect(hostFeatureReason(info, 'board')).toBe('Live pull-request status needs the Azure CLI')
  })

  it('extension missing and host none both pass their wording through untouched', async () => {
    const ext: CliStatus = { name: 'az', found: true, extension: false, signedIn: 'unknown', reason: WORDING.azExtensionMissing }
    arrange({ provider: new NullHost(WORDING.azExtensionMissing, 'az', 'extension_missing'), cli: ext })
    expect((await getConnectionInfo(project(), null)).cli).toEqual(ext)

    const none: CliStatus = { name: 'gh', found: true, extension: null, signedIn: 'unknown', reason: WORDING.hostNone }
    arrange({ provider: new NullHost(WORDING.hostNone, 'gh', 'no_host'), host: 'none' as HostName, source: 'default' as HostSource, cli: none })
    const info = await getConnectionInfo(project(), null)
    expect(info).toMatchObject({ host: 'none', hostSource: 'default', cli: none })
  })

  it('a probe that merely failed (unknown) is still asked — not knowing is not "no"', async () => {
    const { provider, whoAmI } = fakeProvider({ login: UPN, kind: 'upn' })
    arrange({ provider, cli: { ...SIGNED_IN, signedIn: 'unknown' } })
    const info = await getConnectionInfo(project(), '/plugin/scripts')
    expect(whoAmI).toHaveBeenCalled()
    expect(info.account).toBe('sam-k')
  })
})

describe('setTypedActor (D-OWNER-5)', () => {
  it('accepted while the host cannot identify the person; held in memory, labelled typed', async () => {
    const { provider } = fakeProvider(new CodeHostUnavailable(WORDING.azPatOnly, 'pat_only'))
    arrange({ provider, cli: { ...SIGNED_IN, signedIn: 'no', reason: WORDING.azPatOnly } })
    const path = project()
    const info = await setTypedActor(path, '/plugin/scripts', '  Sam Kay ')
    expect(info).toMatchObject({ account: 'Sam Kay', accountSource: 'typed', rosterHandle: null })
    expect(getTypedActor(path)).toBe('Sam Kay')
    // A second read keeps it, for this process only.
    expect((await getConnectionInfo(path, '/plugin/scripts')).accountSource).toBe('typed')
  })

  it('refused when the host already identifies the person — a typed name is not a way around sign-in', async () => {
    const { provider } = fakeProvider({ login: UPN, kind: 'upn' })
    arrange({ provider })
    const path = project()
    await expect(setTypedActor(path, '/plugin/scripts', 'Sam Kay')).rejects.toThrow(`Azure DevOps already identifies you as ${UPN}`)
    expect(getTypedActor(path)).toBeNull()
  })

  it('refuses a name that is too short, too long, multi-line, or AI-looking — nothing stored', async () => {
    const { provider } = fakeProvider(new CodeHostUnavailable(WORDING.azSignedOut, 'signed_out'))
    arrange({ provider, cli: { ...SIGNED_IN, signedIn: 'no', reason: WORDING.azSignedOut } })
    const path = project()
    await expect(setTypedActor(path, null, 'S')).rejects.toThrow(/at least 2 characters/)
    await expect(setTypedActor(path, null, 'x'.repeat(81))).rejects.toThrow(/at most 80 characters/)
    await expect(setTypedActor(path, null, 'Sam\nKay')).rejects.toThrow(/one line/)
    for (const bad of ['Claude', 'the build bot', 'Copilot Agent', 'GPT-5 assistant', 'An AI']) {
      await expect(setTypedActor(path, null, bad)).rejects.toThrow(/reads as an AI\/automation/)
    }
    await expect(setTypedActor(path, null, 42)).rejects.toThrow(/at least 2 characters/)
    expect(getTypedActor(path)).toBeNull()
  })

  it('once the host identifies the person, a typed name is forgotten rather than left to shadow them', async () => {
    const path = project()
    const signedOut = fakeProvider(new CodeHostUnavailable(WORDING.azSignedOut, 'signed_out'))
    arrange({ provider: signedOut.provider, cli: { ...SIGNED_IN, signedIn: 'no', reason: WORDING.azSignedOut } })
    await setTypedActor(path, '/plugin/scripts', 'Sam Kay')

    const signedIn = fakeProvider({ login: UPN, kind: 'upn' })
    arrange({ provider: signedIn.provider })
    const info = await getConnectionInfo(path, '/plugin/scripts')
    expect(info).toMatchObject({ account: 'sam-k', accountSource: 'roster' })
    expect(getTypedActor(path)).toBeNull()
  })
})

describe('the pure roster rules', () => {
  it('rosterHandleFor: UPN by email (case-insensitive), login by handle; never a display name or the UPN prefix', () => {
    expect(rosterHandleFor({ login: 'SAM.KAY@CONTOSO.COM', kind: 'upn' }, ROSTER)).toBe('@sam-k')
    expect(rosterHandleFor({ login: 'sam-k', kind: 'upn' }, ROSTER)).toBeNull()
    expect(rosterHandleFor({ login: 'Sam Kay', kind: 'upn' }, ROSTER)).toBeNull()
    expect(rosterHandleFor({ login: 'priya-n', kind: 'login' }, ROSTER)).toBe('@priya-n')
    expect(rosterHandleFor({ login: '', kind: 'login' }, ROSTER)).toBeNull()
  })

  it('rosterEmailFor: the recorded email or null — an exact handle match apart from the @', () => {
    expect(rosterEmailFor('@sam-k', ROSTER)).toBe('Sam.Kay@Contoso.com')
    expect(rosterEmailFor('sam-k', ROSTER)).toBe('Sam.Kay@Contoso.com')
    expect(rosterEmailFor('@priya-n', ROSTER)).toBeNull()
    expect(rosterEmailFor('@SAM-K', ROSTER)).toBeNull()
  })

  it('actorFor: identity beats a typed name and clears it; no identity and no typed name is null all round', () => {
    const path = '/p/actor'
    forgetTypedActor(path)
    expect(actorFor(path, null, ROSTER)).toEqual({ account: null, accountSource: null, rosterHandle: null })
  })
})
