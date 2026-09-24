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
}

export interface RecentProject {
  path: string
  name: string
  lastOpenedAt: string
}

export interface Settings {
  recentProjects: RecentProject[]
  claudePathOverride?: string
  uvPathOverride?: string
  pluginScriptsPathOverride?: string
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

/** The ONLY surface the renderer gets — see electron/preload/index.ts. Both the preload
 * script's implementation and the renderer's `window.studio` typing point at this one
 * interface, so they can never silently drift apart. */
export interface StudioApi {
  detectTooling(): Promise<ToolingReport>
  getSettings(): Promise<Settings>
  setToolOverride(kind: 'claude' | 'uv' | 'pluginScripts', path: string): Promise<Settings>

  pickFolder(): Promise<string | null>
  hasSdlcProject(projectPath: string): Promise<boolean>
  openProject(projectPath: string): Promise<OpenProjectResult>

  listProfiles(): Promise<string[]>
  previewSetup(projectPath: string, profileId: string): Promise<PreviewSetupResult>
  runSetup(projectPath: string, profileId: string): Promise<RunSetupResult>

  getConsoleLog(): Promise<ConsoleEntry[]>
  onConsoleEntry(callback: (entry: ConsoleEntry) => void): () => void
}
