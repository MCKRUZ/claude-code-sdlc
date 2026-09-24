// App-level settings: recent projects and any manual tool-path overrides. This is the ONE
// exception to "nothing outside the project folder is read or written" (spec 0008's own
// acceptance check names it explicitly) — stored under Electron's userData directory,
// never inside a project.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FileSyncState, ProjectSyncState, RecentProject, Settings } from '../../shared/types'

export type { FileSyncState, ProjectSyncState, RecentProject, Settings }

const DEFAULT_SETTINGS: Settings = { recentProjects: [] }
const MAX_RECENT = 10

let settingsPath: string | null = null

export function initSettingsPath(userDataDir: string): void {
  settingsPath = join(userDataDir, 'settings.json')
  initObjectsDir(userDataDir)
}

export function loadSettings(): Settings {
  if (!settingsPath || !existsSync(settingsPath)) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  if (!settingsPath) throw new Error('initSettingsPath() was not called')
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function recordRecentProject(projectPath: string, name: string): Settings {
  const settings = loadSettings()
  const withoutThis = settings.recentProjects.filter((p) => p.path !== projectPath)
  const updated: Settings = {
    ...settings,
    recentProjects: [
      { path: projectPath, name, lastOpenedAt: new Date().toISOString() },
      ...withoutThis,
    ].slice(0, MAX_RECENT),
  }
  saveSettings(updated)
  return updated
}

// --- Per-project sync state (spec 0009) --------------------------------------------------
// The ancestor-hash bookkeeping pull() needs lives only here, in Studio's own settings —
// never in the repository. See sync.ts for how it's used.

export function getProjectSyncState(projectPath: string): ProjectSyncState {
  const settings = loadSettings()
  return settings.projectSyncState?.[projectPath] ?? { lastPulledAt: null, files: {} }
}

export function saveProjectSyncState(projectPath: string, state: ProjectSyncState): void {
  const settings = loadSettings()
  saveSettings({
    ...settings,
    projectSyncState: { ...settings.projectSyncState, [projectPath]: state },
  })
}

// --- Ancestor content store (spec 0009) --------------------------------------------------
// A 3-way merge needs the ANCESTOR'S ACTUAL BYTES, not just a hash — and git's own object
// store isn't a reliable place to fetch them back from (unreachable objects are eventually
// gc'd). This is a small, content-addressed local store, sharded the same way the plugin's
// own .sdlc/versions/objects/<xx>/<16hex> store is (references/artifact-versioning.md) — same
// proven pattern, same reasoning: content Studio itself put there for its own bookkeeping,
// never anything the person didn't already have in their repository. Write-if-absent, so a
// hash collision with existing content is a safe no-op, matching the plugin's own object store.

let objectsDir: string | null = null

function initObjectsDir(userDataDir: string): void {
  objectsDir = join(userDataDir, 'sync-objects')
}

function objectPath(hash: string): string {
  if (!objectsDir) throw new Error('initSettingsPath() was not called')
  const hex = hash.replace(/^sha256:/, '')
  return join(objectsDir, hex.slice(0, 2), hex)
}

export function storeAncestorBlob(hash: string, bytes: Buffer): void {
  const path = objectPath(hash)
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
}

export function readAncestorBlob(hash: string): Buffer | null {
  const path = objectPath(hash)
  return existsSync(path) ? readFileSync(path) : null
}
