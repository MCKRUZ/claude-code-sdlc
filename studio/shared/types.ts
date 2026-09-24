// Types shared between the main process and the renderer. This file MUST stay pure
// (interfaces/types only, no `node:*` imports, no runtime code) — it's included directly
// in BOTH tsconfig.json (renderer) and tsconfig.node.json (main/preload), which are
// otherwise separate TypeScript projects with no built .d.ts output to reference each
// other through.

export interface ConsoleEntry {
  id: string
  command: string
  args: string[]
  cwd: string
  startedAt: string
  durationMs: number
  exitCode: number | null
  stdout: string
  stderr: string
  ok: boolean
}

export interface ToolStatus {
  found: boolean
  path?: string
  version?: string
  error?: string
}

export interface ToolingReport {
  claude: ToolStatus
  uv: ToolStatus
  pluginScripts: ToolStatus
  git: ToolStatus
  gh: ToolStatus
}

export interface RecentProject {
  path: string
  name: string
  lastOpenedAt: string
}

/** Studio's per-file sync bookkeeping for one project — the ancestor is the last blob hash
 * both sides were known to agree on (spec 0009's decision 4: no scratch clone, so this lives
 * only in Studio's own settings, never in the repository itself). A file with any entry in
 * `pendingClashSections` is frozen: pull() will not advance its ancestor or write to it again
 * until every listed section is resolved. */
export interface FileSyncState {
  ancestorHash: string
  pendingClashSections?: string[]
}

export interface ProjectSyncState {
  lastPulledAt: string | null
  files: Record<string, FileSyncState>
}

export interface Settings {
  recentProjects: RecentProject[]
  claudePathOverride?: string
  uvPathOverride?: string
  pluginScriptsPathOverride?: string
  gitPathOverride?: string
  ghPathOverride?: string
  /** Keyed by project path. */
  projectSyncState?: Record<string, ProjectSyncState>
}

export interface ProjectStage {
  id: string
  name: string
  display: string
  status: string
  stage_state: 'current' | 'signed_off' | 'later'
  artifact_count: number
  entered_at: string | null
  completed_at: string | null
}

export interface ProjectStatus {
  project_name: string
  profile_id: string
  current_phase: { id: string; display: string }
  stages: ProjectStage[]
}

export interface OpenProjectResult {
  hasProject: boolean
  status?: ProjectStatus
  entry?: ConsoleEntry
  error?: string
}

export interface SetupPlan {
  already_exists: boolean
  directories: string[]
  files: string[]
}

export interface PreviewSetupResult {
  plan?: SetupPlan
  entry?: ConsoleEntry
  error?: string
}

export interface RunSetupResult {
  ok: boolean
  entry?: ConsoleEntry
  error?: string
}

// --- Repository sync (spec 0009) ---------------------------------------------------------

export interface ConnectionInfo {
  repo: string
  branch: string
  localFolder: string
  /** The signed-in code-host account (`gh api user`), or null when unknown/unauthenticated. */
  account: string | null
  lastPulledAt: string | null
  /** Best-effort display only (a `gh api .../rulesets` probe) — the actual gate is always
   * "did the direct push get rejected," never this value. See sync.ts. */
  branchProtected: boolean | null
}

export interface ArrivedChange {
  path: string
  author: string
  when: string
}

/** One clashing section within one document. `key` is the section's heading for a plain
 * section, `heading#<number>` for a repeating block instance, or `__whole_file__` for an
 * unshaped document (or one whose headings no longer match its shape) — see document_shape_cli
 * and spec 0007's own free-text fallback, which this mirrors rather than special-cases. */
export interface ClashSection {
  key: string
  heading: string
  localText: string
  remoteText: string
}

export interface FileClash {
  path: string
  sections: ClashSection[]
}

export interface PullResult {
  ok: boolean
  mergedFiles: string[]
  clashes: FileClash[]
  arrivedChanges: ArrivedChange[]
  entries: ConsoleEntry[]
  error?: string
}

export type ClashChoice = 'local' | 'remote' | 'combined'

export interface ResolveClashResult {
  ok: boolean
  /** True once every clash in this file is resolved — that's when the file's ancestor
   * advances and it becomes eligible to be included in the next save(). */
  fileFullyResolved: boolean
  entry?: ConsoleEntry
  error?: string
}

export type SaveOutcome = 'pushed_directly' | 'opened_pull_request' | 'merged_pull_request'

export interface SaveResult {
  ok: boolean
  outcome?: SaveOutcome
  prUrl?: string
  entries: ConsoleEntry[]
  error?: string
}

/** Pushed to the renderer as sync activity happens, so the Header pill (spec 0009's "sync
 * indicator on every screen") updates live rather than only after a full pull/save
 * completes. */
export type SyncState =
  | { kind: 'idle'; lastPulledAt: string | null }
  | { kind: 'pulling' }
  | { kind: 'saving' }
  | { kind: 'clashes'; count: number }
  | { kind: 'waitingForApproval'; approver: string }
  | { kind: 'waitingForChecks' }
  | { kind: 'error'; message: string }

/** The ONLY surface the renderer gets — see electron/preload/index.ts. Both the preload
 * script's implementation and the renderer's `window.studio` typing point at this one
 * interface, so they can never silently drift apart. */
export interface StudioApi {
  detectTooling(): Promise<ToolingReport>
  getSettings(): Promise<Settings>
  setToolOverride(kind: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh', path: string): Promise<Settings>

  pickFolder(): Promise<string | null>
  hasSdlcProject(projectPath: string): Promise<boolean>
  openProject(projectPath: string): Promise<OpenProjectResult>

  listProfiles(): Promise<string[]>
  previewSetup(projectPath: string, profileId: string): Promise<PreviewSetupResult>
  runSetup(projectPath: string, profileId: string): Promise<RunSetupResult>

  getConnectionInfo(projectPath: string): Promise<ConnectionInfo>
  pull(projectPath: string): Promise<PullResult>
  resolveClash(
    projectPath: string,
    filePath: string,
    sectionKey: string,
    choice: ClashChoice,
    combinedText?: string,
  ): Promise<ResolveClashResult>
  save(projectPath: string, changeNote: string): Promise<SaveResult>
  onSyncState(callback: (state: SyncState) => void): () => void
  getPendingClashes(projectPath: string): Promise<FileClash[]>
  combineWithClaude(projectPath: string, localText: string, remoteText: string): Promise<{ combined: string } | { error: string }>

  getConsoleLog(): Promise<ConsoleEntry[]>
  onConsoleEntry(callback: (entry: ConsoleEntry) => void): () => void
}
