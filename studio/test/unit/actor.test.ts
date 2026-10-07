/** One identity, resolved once (togo-command-center.md §2.1): the roster's `@handle` wins, then
 * the host's identity, then a typed name; nobody identified is null, never a blank `--by`. */
import { describe, expect, it } from 'vitest'
import { actorFromConnection, forcedActor, resolveActor } from '../../electron/main/actor'

const info = (over: { account?: string | null; accountSource?: 'roster' | 'host' | 'typed' | null; rosterHandle?: string | null }) =>
  ({ account: null, accountSource: null, rosterHandle: null, ...over })

describe('actorFromConnection', () => {
  it('a roster match is the roster handle in the roster\'s own form (with its @)', () => {
    expect(actorFromConnection(info({ account: 'sam-k', accountSource: 'roster', rosterHandle: '@sam-k' }))).toEqual({ name: '@sam-k', source: 'roster' })
  })
  it('a host identity the roster does not know is reported as the host gave it', () => {
    expect(actorFromConnection(info({ account: 'sam@corp.com', accountSource: 'host' }))).toEqual({ name: 'sam@corp.com', source: 'host' })
  })
  it('a typed name is labelled typed', () => {
    expect(actorFromConnection(info({ account: 'Priya N', accountSource: 'typed' }))).toEqual({ name: 'Priya N', source: 'typed' })
  })
  it('nobody identified is null — not an empty name', () => {
    expect(actorFromConnection(info({}))).toBeNull()
    expect(actorFromConnection(info({ account: '   ', accountSource: 'host' }))).toBeNull()
  })
  it('trims whitespace the host may have left', () => {
    expect(actorFromConnection(info({ account: ' matt ', accountSource: 'host' }))?.name).toBe('matt')
  })
})

describe('resolveActor', () => {
  it('reads through the connection reader it is given', async () => {
    const actor = await resolveActor('/p', '/s', async () => info({ account: 'sam-k', accountSource: 'roster', rosterHandle: '@sam-k' }))
    expect(actor).toEqual({ name: '@sam-k', source: 'roster' })
  })
  it('a connection that cannot be read is no actor, never a guess', async () => {
    expect(await resolveActor('/p', '/s', async () => { throw new Error('no git') })).toBeNull()
  })
})

describe('forcedActor (the e2e hook, togo-command-center.md §7 P7)', () => {
  it('an unpackaged run with STUDIO_TEST_FORCE_BY set forces that name as a typed actor', () => {
    expect(forcedActor({ STUDIO_TEST_FORCE_BY: 'Claude' }, true)).toEqual({ name: 'Claude', source: 'typed' })
  })
  it('a packaged app never reads the hook; an empty value is no actor', () => {
    expect(forcedActor({ STUDIO_TEST_FORCE_BY: 'Claude' }, false)).toBeNull()
    expect(forcedActor({ STUDIO_TEST_FORCE_BY: '  ' }, true)).toBeNull()
    expect(forcedActor({}, true)).toBeNull()
  })
})
