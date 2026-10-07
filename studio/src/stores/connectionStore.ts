// The renderer's copy of the last ConnectionInfo the main process computed (code-host providers,
// Wave 7). Screens that must explain a disabled CLI-backed control (`hostFeatureReason`) or pick
// the host's name for a sentence read it here, so none of them has to be handed the connection
// through props it does not otherwise need — and none of them makes its own IPC call for it.
//
// No IPC here: `App` owns the `window.studio.getConnectionInfo` call and pushes its result in
// with `connectionStore.set(info)`. Until it has, the snapshot is null and every reader keeps
// today's GitHub wording, so a screen rendered before (or without) a connection is unchanged.
import { useSyncExternalStore } from 'react'
import type { ConnectionInfo } from '../../shared/types'
import type { ExternalStore } from './contract'

let snapshot: ConnectionInfo | null = null
const listeners = new Set<() => void>()

function publish(next: ConnectionInfo | null) {
  snapshot = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): ConnectionInfo | null {
  return snapshot
}

export interface ConnectionStore extends ExternalStore<ConnectionInfo | null> {
  /** Called by App after every `getConnectionInfo` (and by TypedActorForm after a successful
   * `setTypedActor`, whose result IS a fresh ConnectionInfo). */
  set(info: ConnectionInfo | null): void
  /** Called when a project closes, so the next project never reads the last one's host. */
  clear(): void
}

export const connectionStore: ConnectionStore = {
  getSnapshot,
  subscribe,
  set: (info) => publish(info),
  clear: () => publish(null),
}

/** Test-only reset so one file's connection never leaks into the next test's assertions. */
export function resetConnectionStore() {
  publish(null)
}

/** The last connection, or null when none has been computed yet. */
export function useConnection(): ConnectionInfo | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
