// Shapes of the three tiny renderer stores (studio-observatory.md §5.0 `spineStore` /
// `backlogStore`, §6.1 index input, and the console). Each is a `useSyncExternalStore`-style
// module store: a snapshot getter, a subscribe, and the few setters the writers need. None of
// them does IPC — they hold what a screen already fetched so another part of the renderer can
// read it without a second subprocess.
import type { BoardRow, ConsoleEntry, SprintSlateRow } from '../../shared/types'

/** The minimal external-store surface React's `useSyncExternalStore` needs, plus the setters a
 * particular store exposes. `getSnapshot` must return the same reference until something
 * changed, or React re-renders every tick. */
export interface ExternalStore<Snapshot> {
  getSnapshot(): Snapshot
  subscribe(listener: () => void): () => void
}

// --- console ----------------------------------------------------------------------------------

/** The renderer's copy of the console log, capped at `MAX_CONSOLE_ENTRIES` and de-duplicated by
 * id exactly as `appendConsoleEntry` already does (an interim "pending" broadcast replaces its
 * own row rather than appending). `open` and `mode` are the panel's UI state, moved out of App so
 * the palette's "Toggle console" and the Console itself read one value. */
export interface ConsoleSnapshot {
  entries: readonly ConsoleEntry[]
  open: boolean
  /** The existing Plain / Technical segmented. */
  mode: 'plain' | 'technical'
}

export interface ConsoleStore extends ExternalStore<ConsoleSnapshot> {
  append(entry: ConsoleEntry): void
  replaceAll(entries: ConsoleEntry[]): void
  setOpen(open: boolean): void
  toggle(): void
  setMode(mode: ConsoleSnapshot['mode']): void
}

// --- backlog ----------------------------------------------------------------------------------

/** Last `Board.rows` and `SprintView.slate` as fetched by BuildBoard / SprintBoard, written on
 * their fetch and read by the palette index and the constellation. Both start empty; the palette
 * says "Open the Board once to index specs" rather than fetching on its own. `fetchedAt` values
 * are for the UI to say how old the index is — never for a metric. */
export interface BacklogSnapshot {
  rows: BoardRow[]
  slate: SprintSlateRow[]
  rowsFetchedAt: string | null
  slateFetchedAt: string | null
  /** Rows and slate belong to one project; a project switch clears both. */
  projectPath: string | null
}

export interface BacklogStore extends ExternalStore<BacklogSnapshot> {
  rows: BoardRow[]
  slate: SprintSlateRow[]
  setRows(projectPath: string, rows: BoardRow[]): void
  setSlate(projectPath: string, slate: SprintSlateRow[]): void
  clear(): void
}

// --- spine ------------------------------------------------------------------------------------

/** `{ hover: stageId | null }` written by Sidebar row hover and read by the Spine, so the
 * sidebar's pinned markup is untouched and spatial memory still works across the two. */
export interface SpineSnapshot {
  hover: string | null
}

export interface SpineStore extends ExternalStore<SpineSnapshot> {
  hover: string | null
  setHover(stageId: string | null): void
}

// --- room (togo-command-center.md §3.1 "In the room") ------------------------------------------

/** `{ litHandle }`: the roster person whose chip is hovered or focused in "In the room". Cards on
 * the lanes whose `owner`/`developer`/`checker`/`nextOwner` is the same person (`identity.
 * samePerson`) carry `data-lit`; everyone else dims — decoration only, never a filter. Written by
 * `InTheRoom`, read by `LaneCard` and the Refining rows. Hover state, nothing more; no IPC. */
export interface RoomSnapshot {
  litHandle: string | null
}

export interface RoomStore extends ExternalStore<RoomSnapshot> {
  litHandle: string | null
  setLit(handle: string | null): void
}
