// What a stage still needs before it can be signed off (spec 0010).
//
// One call to the plugin's stage_readiness.py, then one join: the plugin reports findings by
// LABEL ("the Dependencies field of FR-002 is empty"), but a UI needs to jump to that field,
// which means a span. The span comes from reading the same document through its shape, matched
// on (section heading, field label).
//
// The fallback matters as much as the join: a finding can name a field the shape declares but
// the document does not CONTAIN, and then there is no span to point at. Those fall back to the
// section's own span, so every finding is still clickable — the acceptance check says each item
// links to the field it refers to, and silently dropping the un-linkable ones would technically
// satisfy that while hiding exactly the fields most in need of attention.

import { join } from 'node:path'
import { runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import { matchesSection } from '../../shared/sections'
import { openDocument } from './documents'
import type {
  ReadinessFinding, SignOffQuestion, StageActivity, StageDocument, StageReadiness,
} from '../../shared/types'

interface RawFinding {
  section: string
  field: string | null
  reason: string
}

interface RawArtifact {
  name: string
  path: string
  exists: boolean
  /** Absent from a plugin that predates folder artifacts, which is read as "a file". */
  folder?: boolean
  shaped: boolean
  description?: string | null
  findings: RawFinding[]
  ready: boolean
}

interface RawReadiness {
  error?: string
  stage: { id: string; name: string; display: string; description?: string | null; is_current: boolean } | null
  sign_off: { status: string; completed_at: string | null; signed_off_by: string | null }
  artifacts: RawArtifact[]
  judgement_conditions: string[]
  /** Absent from a plugin that predates sign-off confirmations. */
  judgement?: SignOffQuestion[]
  blocking_count: number
  ready: boolean
  /** Absent from a plugin that predates activities (spec 0023) — then none are drawn. */
  activities?: StageActivity[]
  definition?: string | null
  warnings?: string[]
}

function emptyReadiness(error: string): StageReadiness {
  return {
    ok: false, stageId: '', name: '', display: '', isCurrent: false,
    documents: [], findings: [], judgement: [],
    signOff: { status: 'unknown', signedOffBy: null, completedAt: null },
    ready: false, error,
  }
}

// Moved to shared/sections.ts so the renderer can use the SAME rule when it takes a reader to
// the field a readiness item names. Re-exported because this was its home and its callers and
// tests already know it by this name; the rule itself now exists once. Imported as well as
// re-exported, since `export { x } from` alone would not bring it into this module's scope —
// and this module uses it, below.
export { matchesSection }

async function locate(
  projectPath: string,
  pluginScriptsDir: string,
  artifact: RawArtifact,
): Promise<ReadinessFinding[]> {
  const findings = artifact.findings.map((f) => ({ path: artifact.path, ...f }))
  // A folder has no fields to point at, and opening it as a document is exactly the mistake.
  if (findings.length === 0 || !artifact.exists || artifact.folder) return findings

  const doc = await openDocument(projectPath, pluginScriptsDir, artifact.path)
  if (!doc.ok || !doc.shaped) return findings

  return findings.map((finding) => {
    const section = doc.sections.find((s) => matchesSection(s.key, s.heading, finding.section))
    if (!section) return finding
    const field = finding.field ? section.fields[finding.field] : null
    // A declared-but-absent field has no span of its own — point at its section instead.
    return field
      ? { ...finding, start: field.start, end: field.end }
      : { ...finding, start: section.start, end: section.end }
  })
}

/** The questions from a plugin that predates confirmations: shown as they always were, but with no
 * id, so nothing can be ticked against a record that plugin cannot keep. */
function unconfirmable(texts: string[]): SignOffQuestion[] {
  return texts.map((text) => ({
    id: '', text, hint: { status: 'judgement', detail: 'Needs your judgement.' }, confirmation: null,
  }))
}

/** Record (or withdraw) one person's confirmation of one sign-off question, through the plugin —
 * which owns the record, and refuses a missing name or a question that is not this stage's. */
export async function setJudgementConfirmation(
  projectPath: string,
  pluginScriptsDir: string,
  stageId: string,
  questionId: string,
  confirmed: boolean,
  actor: string,
): Promise<{ ok: boolean; error?: string }> {
  const entry = await runPluginScript(pluginScriptsDir, 'sign_off_confirmations.py', [
    confirmed ? 'confirm' : 'withdraw',
    '--repo', projectPath,
    '--phase', stageId,
    '--question-id', questionId,
    '--actor', actor,
  ])
  if (!entry.ok) {
    // The script prints its refusal ("Error: a confirmation needs a named person") on stdout.
    return { ok: false, error: (entry.stdout.trim() || entry.stderr.trim() || 'The confirmation was not recorded.') }
  }
  return { ok: true }
}

/** What each plugin says it can do, read once per plugin for the life of the process. A plugin
 * does not change while Studio runs, and readiness is polled, so a call per poll would spawn a
 * subprocess for an answer that cannot differ. Only a read that RAN is remembered: a failed one
 * is retried on the next poll rather than pinned for the session. */
const capabilitiesByPlugin = new Map<string, Promise<string[] | undefined>>()

async function readCapabilities(projectPath: string, pluginScriptsDir: string): Promise<string[] | undefined> {
  const entry = await runPluginScript(pluginScriptsDir, 'generate_status.py', [
    '--state', join(projectPath, '.sdlc', 'state.yaml'), '--json',
  ])
  if (!entry.ok) throw new Error('generate_status.py did not run')
  const caps = (JSON.parse(rawStdout(entry)) as { capabilities?: unknown }).capabilities
  return Array.isArray(caps) && caps.every((c) => typeof c === 'string') ? caps : undefined
}

function getCapabilities(projectPath: string, pluginScriptsDir: string): Promise<string[] | undefined> {
  const cached = capabilitiesByPlugin.get(pluginScriptsDir)
  if (cached) return cached
  const read = readCapabilities(projectPath, pluginScriptsDir).catch(() => {
    capabilitiesByPlugin.delete(pluginScriptsDir)
    return undefined
  })
  capabilitiesByPlugin.set(pluginScriptsDir, read)
  return read
}

export async function getStageReadiness(
  projectPath: string,
  pluginScriptsDir: string,
  stageId?: string,
): Promise<StageReadiness> {
  const args = ['--repo', projectPath, '--json']
  if (stageId) args.push('--phase', stageId)

  const entry = await runPluginScript(pluginScriptsDir, 'stage_readiness.py', args)
  let raw: RawReadiness
  try {
    raw = JSON.parse(rawStdout(entry)) as RawReadiness
  } catch {
    return emptyReadiness(entry.stderr.trim() || 'Could not read this stage’s readiness.')
  }
  if (raw.error || !raw.stage) {
    return emptyReadiness(raw.error ?? 'Unknown stage.')
  }

  const documents: StageDocument[] = raw.artifacts.map((a) => ({
    name: a.name,
    path: a.path,
    exists: a.exists,
    folder: a.folder === true,
    shaped: a.shaped,
    description: a.description ?? undefined,
    findingCount: a.findings.length,
    ready: a.ready,
  }))

  const findings: ReadinessFinding[] = []
  for (const artifact of raw.artifacts) {
    findings.push(...(await locate(projectPath, pluginScriptsDir, artifact)))
  }

  // Capabilities only gate activities, so a plugin that declares none is never asked.
  const capabilities = raw.activities ? await getCapabilities(projectPath, pluginScriptsDir) : undefined

  return {
    ok: true,
    stageId: raw.stage.id,
    // The registry's own phase name (e.g. "discovery"), distinct from `display` ("Phase 0:
    // Discovery") — needed verbatim by anything that has to match the plugin's own frozen-layer
    // path construction (`phase{id}-{name}.md`, validate_frozen_layer.py's own naming).
    name: raw.stage.name,
    display: raw.stage.display,
    description: raw.stage.description ?? undefined,
    isCurrent: raw.stage.is_current,
    documents,
    findings,
    judgement: raw.judgement ?? unconfirmable(raw.judgement_conditions),
    signOff: {
      status: raw.sign_off.status,
      signedOffBy: raw.sign_off.signed_off_by,
      completedAt: raw.sign_off.completed_at,
    },
    ready: raw.ready,
    // Each key is present only when the plugin emitted it: an old plugin leaves them undefined,
    // which the tab reads as "draw nothing extra", where an empty list would read as "none".
    ...(raw.activities ? { activities: raw.activities } : {}),
    ...(raw.definition !== undefined ? { definition: raw.definition } : {}),
    ...(raw.warnings ? { warnings: raw.warnings } : {}),
    ...(capabilities ? { capabilities } : {}),
  }
}
