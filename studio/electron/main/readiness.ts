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

import { runPluginScript } from './project'
import { matchesSection } from '../../shared/sections'
import { openDocument } from './documents'
import type { ReadinessFinding, SignOffQuestion, StageDocument, StageReadiness } from '../../shared/types'

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
    raw = JSON.parse(entry.stdout) as RawReadiness
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
  }
}
