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
import { openDocument } from './documents'
import type { ReadinessFinding, StageDocument, StageReadiness } from '../../shared/types'

interface RawFinding {
  section: string
  field: string | null
  reason: string
}

interface RawArtifact {
  name: string
  path: string
  exists: boolean
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
  blocking_count: number
  ready: boolean
}

function emptyReadiness(error: string): StageReadiness {
  return {
    ok: false, stageId: '', display: '', isCurrent: false,
    documents: [], findings: [], judgementConditions: [],
    signOff: { status: 'unknown', signedOffBy: null, completedAt: null },
    ready: false, error,
  }
}

/** The plugin reports `section` as the document's own heading text, and for a repeating block
 * as "<heading> > <instance heading>". Studio addresses sections by key, so match on whichever
 * of those the document actually offers. */
export function matchesSection(sectionKey: string, heading: string, reported: string): boolean {
  if (reported === sectionKey || reported === heading) return true
  const instance = reported.split('>').pop()?.trim()
  return instance !== undefined && instance === heading
}

async function locate(
  projectPath: string,
  pluginScriptsDir: string,
  artifact: RawArtifact,
): Promise<ReadinessFinding[]> {
  const findings = artifact.findings.map((f) => ({ path: artifact.path, ...f }))
  if (findings.length === 0 || !artifact.exists) return findings

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
    display: raw.stage.display,
    description: raw.stage.description ?? undefined,
    isCurrent: raw.stage.is_current,
    documents,
    findings,
    judgementConditions: raw.judgement_conditions,
    signOff: {
      status: raw.sign_off.status,
      signedOffBy: raw.sign_off.signed_off_by,
      completedAt: raw.sign_off.completed_at,
    },
    ready: raw.ready,
  }
}
