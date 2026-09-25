// App-level settings: recent projects and any manual tool-path overrides. This is the ONE
// exception to "nothing outside the project folder is read or written" (spec 0008's own
// acceptance check names it explicitly) — stored under Electron's userData directory,
// never inside a project.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { runPluginScript } from './project'
import { dirname, join } from 'node:path'
import type {
  FileSyncState, ProjectSettings, ProjectSyncState, RecentProject,
  SettingChangeResult, Settings,
} from '../../shared/types'

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

/** What this person had already seen in `relPath` when they last looked, or null if never.
 * Deliberately separate from the ancestor bookkeeping: the ancestor is about what the two
 * SIDES agree on, this is about what one PERSON has read. */
export function getLastSeenCommit(projectPath: string, relPath: string): string | null {
  return getProjectSyncState(projectPath).lastSeenCommits?.[relPath] ?? null
}

export function setLastSeenCommit(projectPath: string, relPath: string, commit: string): void {
  const state = getProjectSyncState(projectPath)
  saveProjectSyncState(projectPath, {
    ...state,
    lastSeenCommits: { ...state.lastSeenCommits, [relPath]: commit },
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


// --- Project settings (spec 0012) --------------------------------------------------------
//
// Note what this does NOT do: it reads. Changing a setting writes to the file that owns it,
// which is a separate act with its own rules — and then reaches the repository through spec
// 0009's save like every other change, so a settings change is a commit with a person and a
// reason on it, not a silent mutation.

/** Every project setting, composed by the plugin, with the file each came from. */
export async function getProjectSettings(
  projectPath: string,
  pluginScriptsDir: string,
): Promise<ProjectSettings> {
  const empty = (error: string): ProjectSettings => ({
    ok: false,
    roster: { file: '.sdlc/team.yaml', present: false, errors: [error], teams: [], people: [] },
    wip_limits: { file: '', present: false, errors: [], teams: [] },
    approval: { file: '.sdlc/approval-settings.yaml', present: false, errors: [], stages: [] },
    fixed_rules: [],
  })

  const entry = await runPluginScript(pluginScriptsDir, 'project_settings.py', [
    '--repo', projectPath, '--json',
  ])
  try {
    return JSON.parse(entry.stdout) as ProjectSettings
  } catch {
    return empty(entry.stderr.trim() || 'Could not read this project’s settings.')
  }
}

/** Change one setting through the plugin's own command, which validates before it writes.
 *
 * Studio adds no rule here — the plugin refuses a handle that is not a handle, a team the
 * roster does not know, an approver nobody could route an approval to, and any change that
 * would leave the roster invalid. The window asks, and reports the answer.
 *
 * Writes the file only. Committing is spec 0009's save, which is what makes a settings change
 * an ordinary commit with a person and a reason on it. Keeping the two apart is deliberate: a
 * change that wrote AND committed would give nobody the chance to look at what they did
 * before it left their machine.
 */
async function runSetSetting(
  projectPath: string,
  pluginScriptsDir: string,
  args: string[],
): Promise<SettingChangeResult> {
  const entry = await runPluginScript(pluginScriptsDir, 'set_setting.py', [
    '--repo', projectPath, '--json', ...args,
  ])
  try {
    const parsed = JSON.parse(entry.stdout)
    if (parsed.ok !== true) {
      return {
        ok: false,
        refusal: {
          kind: String(parsed.refusal?.kind ?? 'other'),
          message: String(parsed.refusal?.message ?? 'That change was refused.'),
        },
      }
    }
    return {
      ok: true,
      changed: parsed.changed === true,
      message: String(parsed.message ?? ''),
      note: parsed.note ? String(parsed.note) : undefined,
      file: parsed.file ? String(parsed.file) : undefined,
    }
  } catch {
    // The command validates before it writes, so an unreadable answer means nothing changed.
    return {
      ok: false,
      refusal: {
        kind: 'other',
        message: entry.stderr.trim() || 'The settings command gave no readable answer.',
      },
    }
  }
}

export function setRosterPerson(
  projectPath: string,
  pluginScriptsDir: string,
  handle: string,
  fields: { name?: string; team?: string; roles?: string[]; signsOff?: string[] },
): Promise<SettingChangeResult> {
  const args = ['person', handle]
  if (fields.name !== undefined) args.push('--name', fields.name)
  if (fields.team !== undefined) args.push('--team', fields.team)
  if (fields.roles?.length) args.push('--roles', ...fields.roles)
  if (fields.signsOff?.length) args.push('--signs-off', ...fields.signsOff)
  return runSetSetting(projectPath, pluginScriptsDir, args)
}

export function setTeamLimit(
  projectPath: string, pluginScriptsDir: string, team: string, limit: number,
): Promise<SettingChangeResult> {
  return runSetSetting(projectPath, pluginScriptsDir, ['limit', team, String(limit)])
}

export function setStageApproval(
  projectPath: string, pluginScriptsDir: string, stage: string,
  required: boolean, approver?: string,
): Promise<SettingChangeResult> {
  const args = ['approval', stage, required ? '--on' : '--off']
  if (approver?.trim()) args.push('--approver', approver.trim())
  return runSetSetting(projectPath, pluginScriptsDir, args)
}
