// What the Workflow tab's activity controls do in the main process (spec 0024): start the
// documents an activity declares, run one of the two checks, read a stage's guidance file.
//
// Each is a plain function over (project, plugin scripts dir, ...) so tests drive it directly;
// `registerActivityHandlers` is the only thing index.ts needs to know about.

import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { IpcMain } from 'electron'
import { ensureDocumentFromTemplate } from './documents'
import { runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import { getStageReadiness } from './readiness'
import type { ActivityCheckResult, StageGuide, StartActivityResult } from '../../shared/types'

const NO_PLUGIN = 'claude-code-sdlc plugin scripts not found'

function refused(error: string, created: string[] = [], existing: string[] = []): StartActivityResult {
  return { ok: false, created, existing, error }
}

export async function startActivity(
  projectPath: string,
  scriptsDir: string,
  stageId: string,
  activityId: string,
): Promise<StartActivityResult> {
  const readiness = await getStageReadiness(projectPath, scriptsDir, stageId)
  const activity = readiness.activities?.find((a) => a.id === activityId)
  if (!activity) return refused('That activity is not part of this stage.')
  if (activity.kind !== 'create') return refused(`${activity.label} is not something Studio can start from templates.`)
  if (activity.status === 'blocked') return refused(activity.reason ?? `${activity.label} is not available yet.`)

  const created: string[] = []
  const existing: string[] = []
  for (const path of activity.creates) {
    const result = ensureDocumentFromTemplate(projectPath, scriptsDir, path)
    if (!result.ok) return refused(result.error ?? `Could not start ${path}.`, created, existing)
    ;(result.created ? created : existing).push(path)
  }
  return { ok: true, created, existing, opened: activity.creates[0] }
}

type CheckSpec = { script: string; args: (project: string) => string[]; read: (raw: Record<string, unknown>) => ActivityCheckResult }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const CHECKS: Readonly<Record<string, CheckSpec>> = {
  'rules-check': {
    script: 'rules_check.py',
    args: (project) => ['--repo', project, '--json'],
    read: (raw) => ({
      ok: true,
      check: 'rules-check',
      hasData: raw.has_data === true,
      notes: strings(raw.notes),
      findings: (Array.isArray(raw.findings) ? raw.findings : []).map((f: { subject?: unknown; message?: unknown }) => ({
        subject: String(f.subject ?? ''),
        message: String(f.message ?? ''),
      })),
    }),
  },
  'data-check': {
    script: 'data_contract.py',
    args: (project) => ['summary', '--repo', project, '--json'],
    read: (raw) => ({
      ok: true,
      check: 'data-check',
      hasData: raw.has_data === true,
      notes: strings(raw.notes),
      fieldCount: Number(raw.field_count) || 0,
      piiCount: Number(raw.pii_count) || 0,
      piiFields: strings(raw.pii_fields),
      riskImplication: typeof raw.risk_implication === 'string' ? raw.risk_implication : null,
    }),
  },
}

export async function runActivityCheck(
  projectPath: string,
  scriptsDir: string,
  activityId: string,
): Promise<ActivityCheckResult> {
  const check = CHECKS[activityId]
  if (!check) return { ok: false, error: 'Studio has no check for that activity.' }

  const failed: ActivityCheckResult = { ok: false, error: 'The check could not be run, so there is no result to show.' }
  const entry = await runPluginScript(scriptsDir, check.script, check.args(projectPath))
  if (!entry.ok) return failed
  try {
    const raw: unknown = JSON.parse(rawStdout(entry))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return failed
    return check.read(raw as Record<string, unknown>)
  } catch {
    return failed
  }
}

/** The plugin's own guidance file for a stage. `definition` comes from the plugin's readiness
 * output, but this is still a file read driven by a string that crossed a process boundary. */
export function getStageGuide(scriptsDir: string, definition: string): StageGuide {
  const segments = definition.replace(/\\/g, '/').split('/')
  if (isAbsolute(definition) || segments.some((s) => s === '..') || !definition.endsWith('.md')) {
    return { ok: false, error: 'That is not a guidance file Studio can read.' }
  }
  try {
    return { ok: true, markdown: readFileSync(join(dirname(scriptsDir), definition), 'utf-8') }
  } catch {
    return { ok: false, error: 'This stage’s guidance file could not be read.' }
  }
}

export function registerActivityHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  resolvePluginScriptsDir: () => Promise<string | null>,
): void {
  ipcMain.handle('studio:startActivity', async (_event, projectPath: string, stageId: string, activityId: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? startActivity(projectPath, scriptsDir, stageId, activityId) : refused(NO_PLUGIN)
  })
  ipcMain.handle('studio:runActivityCheck', async (_event, projectPath: string, activityId: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? runActivityCheck(projectPath, scriptsDir, activityId) : { ok: false, error: NO_PLUGIN }
  })
  ipcMain.handle('studio:getStageGuide', async (_event, definition: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? getStageGuide(scriptsDir, definition) : { ok: false, error: NO_PLUGIN }
  })
}
