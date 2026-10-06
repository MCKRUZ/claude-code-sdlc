/** The renderer's ONE place for "why is this code-host feature off" (code-host-providers.md §7.1).
 *
 * Every string comes from `hostFeatureReason` / `WORDING` in shared/codeHostModel.ts — nothing
 * here hand-types a "needs gh". The renderer never probes anything: it reads the `cli` block
 * the main process established and explains it. 'unknown' (not probed yet) is never a reason
 * to disable a control; only a fact the main process recorded is.
 */

import { WORDING, cliFor, hostFeatureReason, type HostConnection } from '../shared/codeHostModel'

export interface HostReasons {
  board: string | null
  handoff: string | null
  pipelineEvidence: string | null
  gateCredential: string | null
  saveWhenProtected: string | null
  /** The Settings "Signed in as" value when nobody could be identified: "unavailable (…)". */
  signedInAs: string | null
}

/** The disabled-reason text for each CLI-backed feature, or null where nothing stands in its way. */
export function hostReasons(connection: HostConnection | null | undefined): HostReasons {
  if (!connection) {
    return { board: null, handoff: null, pipelineEvidence: null, gateCredential: null, saveWhenProtected: null, signedInAs: null }
  }
  return {
    board: hostFeatureReason(connection, 'board'),
    handoff: hostFeatureReason(connection, 'handoff'),
    pipelineEvidence: hostFeatureReason(connection, 'pipelineEvidence'),
    gateCredential: hostFeatureReason(connection, 'gateCredential'),
    saveWhenProtected: hostFeatureReason(connection, 'saveWhenProtected'),
    signedInAs: hostFeatureReason(connection, 'signedInAs'),
  }
}

/** The slice of ConnectionInfo the "signed in as" sentence reads. */
export interface SignedInSlice extends HostConnection {
  account: string | null
  accountSource: 'roster' | 'host' | 'typed' | null
  rosterHandle: string | null
}

/** One sentence for the Settings CLI row: "az — signed in as sam@corp.com (roster: @sam-k)",
 * "gh — typed for this session: Sam K", or the §7.1 reason when the CLI cannot say. Honest
 * about the three states: identified, not identified (with why), or not probed yet. */
export function signedInSentence(connection: SignedInSlice): string {
  const cliName = connection.cli.name ?? cliFor(connection.host)
  if (connection.account) {
    if (connection.accountSource === 'typed') return `${cliName} — typed for this session: ${connection.account}`
    const roster = connection.rosterHandle && connection.rosterHandle !== connection.account
      ? ` (roster: ${connection.rosterHandle})`
      : ''
    return `${cliName} — signed in as ${connection.account}${roster}`
  }
  if (connection.cli.reason) return `${cliName} — ${connection.cli.reason}`
  const reason = hostFeatureReason(connection, 'signedInAs')
  if (reason) return `${cliName} — ${reason}`
  if (connection.cli.signedIn === 'unknown') return `${cliName} — sign-in not checked yet`
  return `${cliName} — nobody is signed in`
}

/** The non-blocking banner text when a project opened without its CLI ready, or null when
 * there is nothing to say. The exact §7.1 sentence the main process recorded wins; the
 * WORDING fallbacks cover a `cli` block that arrived without one. */
export function connectionBannerText(connection: HostConnection | null | undefined): string | null {
  if (!connection) return null
  const { host, cli } = connection
  // No code host is a legitimate state (a local-only or other-host origin), not a problem to
  // announce on every screen: the features that need a host say WORDING.hostNone where they sit.
  if (host === 'none') return null
  if (cli.found && cli.signedIn === 'yes' && cli.extension !== false) return null
  if (cli.reason) return cli.reason
  if (!cli.found) return host === 'azure-devops' ? WORDING.azMissing : WORDING.ghMissing
  if (cli.extension === false) return WORDING.azExtensionMissing
  if (cli.signedIn === 'no') return host === 'azure-devops' ? WORDING.azSignedOut : WORDING.ghSignedOut
  // signedIn 'unknown': not probed is not a problem to announce.
  return null
}
