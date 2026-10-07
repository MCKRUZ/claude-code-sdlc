// One identity, resolved once (togo-command-center.md §2.1). Every `--by` / `--to` / `--developer`
// / `--owner` the command center sends to the plugin is filled HERE, from `ConnectionInfo`, in
// order of trust: the roster's handle for the signed-in identity → the host's identity as-is →
// the name a person typed for this session (`typedActor.ts` already refuses AI-looking names).
// The renderer never assembles an actor; with none, every write IPC refuses before spawning with
// `reasons.NO_ACTOR`, and the dialog opens the typed-name form.
//
// The roster form is used verbatim (`@sam-k`, with its `@`) because that is what the plugin
// itself compares: `sprint.py ack` warns when the acker's `--by` differs from the hand-off's
// `--to` by a case-insensitive string compare, so the form that went in must be the form that
// comes back.

import { getConnectionInfo } from './sync'
import type { ActorInfo, ConnectionInfo } from '../../shared/types'
import { actorFromConnection } from '../../shared/actor'

export { actorFromConnection }


/** The e2e test hook (togo-command-center.md §7 P7): a DEVELOPMENT run may force the `--by` name so
 * a test can show the plugin's own exit-2 refusal of an AI-looking name — the one identity
 * `typedActor.ts` rightly refuses to let a person sign in as, so no form can reach it. Read only
 * when Electron is running unpackaged (`process.defaultApp`, i.e. `electron .`) or under
 * NODE_ENV=development; a packaged app never consults it. Pure for the unit test. */
export function forcedActor(
  env: Record<string, string | undefined> = process.env,
  unpackaged: boolean = Boolean((process as { defaultApp?: boolean }).defaultApp) || process.env.NODE_ENV === 'development',
): ActorInfo | null {
  const name = env.STUDIO_TEST_FORCE_BY?.trim()
  if (!unpackaged || !name) return null
  return { name, source: 'typed' }
}

export type ConnectionReader = (projectPath: string, pluginScriptsDir: string | null) => Promise<Pick<ConnectionInfo, 'account' | 'accountSource' | 'rosterHandle'>>

/** The actor for a project, resolved through the same `getConnectionInfo` the connection
 * screen reads — one source, so the name on screen and the name in the ledger agree. A
 * connection that cannot be read (no git, no host) is "no actor", never a guess. */
export async function resolveActor(
  projectPath: string,
  pluginScriptsDir: string | null,
  read: ConnectionReader = getConnectionInfo,
): Promise<ActorInfo | null> {
  const forced = forcedActor()
  if (forced) return forced
  try {
    return actorFromConnection(await read(projectPath, pluginScriptsDir))
  } catch {
    return null
  }
}
