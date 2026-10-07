// "Write the registry and index" (spec 0029): one plugin script call, no model. The script writes the
// document registry and the session-start index; Studio only reads back what it says is still missing.

import { join } from 'node:path'
import { hasSdlcProject, runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import type { RegistryResult } from '../../shared/types'

const NOT_READ = 'The registry result could not be read.'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const failed = (error: string): RegistryResult => ({
  ok: false, error, documents: 0, summarised: 0, missingSummaries: [], indexTokens: 0, indexBudget: 0,
  indexWithinBudget: false, trimmed: [], registryCreated: false, warnings: [],
})

/** The plugin's own refusal, from its usual "Error:" line; otherwise null, so a python traceback or a
 * missing-script message never reaches a person. */
function pluginMessage(stdout: string, stderr: string): string | null {
  for (const line of `${stderr}\n${stdout}`.split(/\r?\n/)) {
    const m = /^error:\s*(.+)$/i.exec(line.trim())
    if (m) return m[1].replace(/�/g, '-').trim()
  }
  return null
}

function read(raw: Record<string, unknown>): RegistryResult | null {
  const documents = finite(raw.documents), summarised = finite(raw.summarised)
  const indexTokens = finite(raw.index_tokens), indexBudget = finite(raw.index_budget)
  if (documents === null || summarised === null || indexTokens === null || indexBudget === null) return null
  if (typeof raw.index_within_budget !== 'boolean' || typeof raw.registry_created !== 'boolean') return null
  return {
    ok: true,
    ...(typeof raw.registry === 'string' ? { registry: raw.registry } : {}),
    ...(typeof raw.index === 'string' ? { index: raw.index } : {}),
    documents, summarised, indexTokens, indexBudget,
    missingSummaries: strings(raw.missing_summaries),
    indexWithinBudget: raw.index_within_budget,
    trimmed: strings(raw.trimmed),
    registryCreated: raw.registry_created,
    warnings: strings(raw.warnings),
  }
}

export async function writeRegistry(projectPath: string, scriptsDir: string): Promise<RegistryResult> {
  if (typeof projectPath !== 'string' || !hasSdlcProject(projectPath)) return failed('Open a project first.')
  const entry = await runPluginScript(scriptsDir, 'intake_documents.py', [
    '--state', join(projectPath, '.sdlc', 'state.yaml'), '--registry', '--json',
  ])
  if (entry.exitCode !== 0) return failed(pluginMessage(entry.stdout, entry.stderr) ?? 'The registry could not be written.')
  try {
    const raw: unknown = JSON.parse(rawStdout(entry))
    return (isRecord(raw) ? read(raw) : null) ?? failed(NOT_READ)
  } catch {
    return failed(NOT_READ)
  }
}
