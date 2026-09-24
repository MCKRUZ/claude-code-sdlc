// App-level settings: recent projects and any manual tool-path overrides. This is the ONE
// exception to "nothing outside the project folder is read or written" (spec 0008's own
// acceptance check names it explicitly) — stored under Electron's userData directory,
// never inside a project.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { RecentProject, Settings } from '../../shared/types'

export type { RecentProject, Settings }

const DEFAULT_SETTINGS: Settings = { recentProjects: [] }
const MAX_RECENT = 10

let settingsPath: string | null = null

export function initSettingsPath(userDataDir: string): void {
  settingsPath = join(userDataDir, 'settings.json')
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
