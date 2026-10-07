// Who `ConnectionInfo` says is acting, in the form the plugin records (togo-command-center.md §2.1).
// Pure and shared: the main process fills every `--by` from it, and the renderer uses the SAME
// mapping to show who a write will be recorded against before the command center has re-read —
// a name typed a moment ago in Settings is the actor at once, not after the next refresh.

import type { ActorInfo, ConnectionInfo } from './types'

/** Pure: who `ConnectionInfo` says is acting, in the form the plugin should record. Null when
 * nobody is identified — the caller shows `reasons.NO_ACTOR`, never a blank `--by`. */
export function actorFromConnection(info: Pick<ConnectionInfo, 'account' | 'accountSource' | 'rosterHandle'>): ActorInfo | null {
  if (info.accountSource === 'roster' && info.rosterHandle?.trim()) {
    return { name: info.rosterHandle.trim(), source: 'roster' }
  }
  const account = info.account?.trim()
  if (!account) return null
  if (info.accountSource === 'host') return { name: account, source: 'host' }
  if (info.accountSource === 'typed') return { name: account, source: 'typed' }
  // A roster source without a roster handle is a shape the sync layer never produces; the
  // account is still a real identity, so it is reported as the host's rather than dropped.
  if (info.accountSource === 'roster') return { name: account, source: 'host' }
  return null
}
