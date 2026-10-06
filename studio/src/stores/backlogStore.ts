// The last Board rows and Sprint slate the screens fetched, held so the command palette's "#"
// specs group and the dependency constellation can read them without a second subprocess
// (studio-observatory.md §5.0, §6.1). Nothing here does IPC: BuildBoard and SprintBoard write
// what they already fetched for themselves; everyone else reads. Both lists start empty, and the
// palette says "Open the Board once to index specs" rather than fetching on its own.
import { useSyncExternalStore } from 'react'
import type { BoardRow, SprintSlateRow } from '../../shared/types'
import type { BacklogSnapshot, BacklogStore } from './contract'

const EMPTY_SNAPSHOT: BacklogSnapshot = {
  rows: [],
  slate: [],
  rowsFetchedAt: null,
  slateFetchedAt: null,
  projectPath: null,
}

let snapshot: BacklogSnapshot = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()

function publish(next: BacklogSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

/** Rows and slate belong to ONE project. A write for a different project than the one held
 * drops the other list too, rather than letting a stale slate from project A sit beside fresh
 * rows from project B — the constellation would then draw tethers between two projects' specs. */
function forProject(projectPath: string): BacklogSnapshot {
  return snapshot.projectPath === projectPath ? snapshot : { ...EMPTY_SNAPSHOT, projectPath }
}

function setRows(projectPath: string, rows: BoardRow[]) {
  const base = forProject(projectPath)
  publish({ ...base, rows, rowsFetchedAt: new Date().toISOString() })
}

function setSlate(projectPath: string, slate: SprintSlateRow[]) {
  const base = forProject(projectPath)
  publish({ ...base, slate, slateFetchedAt: new Date().toISOString() })
}

function clear() {
  if (snapshot === EMPTY_SNAPSHOT) return
  publish(EMPTY_SNAPSHOT)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): BacklogSnapshot {
  return snapshot
}

/** `rows` / `slate` are getters so a non-React reader (the palette index builder) sees the
 * current lists without holding a stale copy from module-load time. */
export const backlogStore: BacklogStore = {
  getSnapshot,
  subscribe,
  get rows() { return snapshot.rows },
  get slate() { return snapshot.slate },
  setRows,
  setSlate,
  clear,
}

export function useBacklogStore(): BacklogSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
