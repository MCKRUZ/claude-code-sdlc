// Signing off a phase, from Studio (spec: this session's own follow-up to sign-off questions).
//
// Everything else in Studio that finishes a phase is `advanceAfterDeclaration` in board.ts, but
// that is reached only from Build's declare-complete flow. Every other phase — Discovery →
// Requirements, Requirements → Design, and on — still needed `/sdlc-next` in Claude Code to
// actually finish, because nothing in the window did what that command's own steps do: check
// the gates, confirm every judgement question, write and validate a condensed "frozen layer"
// summary of the phase, snapshot the artifact record, then advance.
//
// The frozen layer is the one step here that needs real LLM writing — every other step below is
// a script call, same as the rest of this file's siblings. Claude cannot read files in this
// call (see claudeAssist.ts): every artifact's text is read here and pasted into the prompt.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { advanceAfterDeclaration } from './board'
import { CLAUDE_SAFE_ARGS, claudeWorkingDirectory } from './claudeAssist'
import { rawStdout, runCommand } from './commandRunner'
import { runPluginScript } from './project'
import { resolveInProject } from './projectPaths'
import { getStageReadiness } from './readiness'
import { save } from './sync'
import type { DisciplineSignoff, GateCheckResult, SignOffResult } from '../../shared/types'

const STATE_FILE = '.sdlc/state.yaml'

/** Parses `check_gates.py`'s text report (it has no `--json`) into what a caller actually
 * needs: is this blocked, and by which MUST-severity lines. Pure — no subprocess, no I/O — so
 * it is tested directly against synthetic report text rather than only through the real script. */
export function parseGateCheckOutput(text: string): GateCheckResult {
  const mustFailures: string[] = []
  // Split on \r?\n: the script's own text is CRLF on Windows (it prints with print(), and
  // stdout there is CRLF-terminated), and a trailing \r left on the line defeats `.` (which
  // does not match a line terminator) immediately before `$` — the match silently fails on
  // every line, which read as "nothing blocked" instead of failing loudly. Found by this
  // exact scenario: a freshly initialised project reported not blocked.
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*NON-COMPLIANT\s+\[MUST\]\s+(.+)$/)
    if (m) mustFailures.push(m[1].trim())
  }
  return { blocked: mustFailures.length > 0, mustFailures, raw: text }
}

/** Runs the stage's exit gates. A real sign-off attempt, unlike `stage_readiness.py`'s
 * deliberately gate-log-free polling, is exactly the moment a gate-log entry belongs — this is
 * a check, not a poll. Pre-checked before drafting a frozen layer, so a MUST failure is shown
 * immediately rather than after spending time on a Claude call that would fail at the final
 * `advance_phase.py` step anyway; `advance_phase.py` re-checks the gates itself regardless, so
 * this is a UX short-circuit, never the safety boundary. */
export async function checkStageGates(
  projectPath: string,
  pluginScriptsDir: string,
  stageId: string,
): Promise<GateCheckResult> {
  const entry = await runPluginScript(pluginScriptsDir, 'check_gates.py', [
    '--state', join(projectPath, STATE_FILE), '--phase', stageId,
  ])
  return parseGateCheckOutput(entry.stdout || entry.stderr)
}

interface FrozenLayerOutcome {
  ok: true
  path: string
}
interface FrozenLayerFailure {
  ok: false
  error: string
}

const FROZEN_LAYER_PROMPT_HEADER = [
  'Fill in this frozen-layer template by condensing the phase artifacts below. Follow the',
  "template's own Condensation Rules exactly: target 1500-2000 tokens (hard max 2500), every",
  'value must trace to a source artifact, tables over prose, omit the Locked Metrics or Risks &',
  'Mitigations section entirely if there is nothing to put in it, and every ${PLACEHOLDER} must',
  'be replaced — none may remain in the output. Output ONLY the completed markdown file, in',
  'full, starting with the frontmatter --- — no preamble, no explanation, no code fence.',
].join('\n')

/** Reads every document the stage actually has, and drafts + validates the frozen layer that
 * summarizes them. One bounded retry: a validation failure re-prompts Claude with the
 * validator's own output and asks for a corrected document; a second failure stops and
 * surfaces the raw validator text rather than looping — Studio is not running as an agent here. */
async function draftAndValidateFrozenLayer(
  projectPath: string,
  pluginScriptsDir: string,
  claudePath: string,
  stageId: string,
  stageName: string,
  gateCheck: GateCheckResult,
): Promise<FrozenLayerOutcome | FrozenLayerFailure> {
  const fresh = await getStageReadiness(projectPath, pluginScriptsDir, stageId)
  if (!fresh.ok) return { ok: false, error: fresh.error ?? 'Could not read this stage to draft its summary.' }

  const templatePath = join(pluginScriptsDir, '..', 'templates', 'frozen-layer.md')
  if (!existsSync(templatePath)) {
    return { ok: false, error: 'The frozen-layer template is missing from this plugin checkout.' }
  }
  const template = readFileSync(templatePath, 'utf-8')

  const artifactTexts: string[] = []
  for (const doc of fresh.documents) {
    if (!doc.exists || doc.folder) continue
    let full: string
    try {
      full = resolveInProject(projectPath, doc.path)
    } catch {
      continue
    }
    if (!existsSync(full)) continue
    artifactTexts.push(`--- ${basename(doc.path)} ---\n${readFileSync(full, 'utf-8')}`)
  }
  if (artifactTexts.length === 0) {
    return { ok: false, error: 'This stage has no documents yet, so there is nothing to summarize.' }
  }

  const layerDir = join(projectPath, '.sdlc', 'context', 'layers')
  mkdirSync(layerDir, { recursive: true }) // usually already there (init_project.py makes it)
  const layerPath = join(layerDir, `phase${stageId}-${stageName}.md`)
  const supersededPath = `${layerPath}.superseded`
  if (existsSync(layerPath)) {
    renameSync(layerPath, supersededPath) // matches /sdlc-next's own behaviour on re-sign-off
  }

  const gateSummary = gateCheck.blocked
    ? `BLOCKED: ${gateCheck.mustFailures.join('; ')}`
    : 'ALL GATES COMPLIANT — ready to advance'

  const basePrompt = [
    FROZEN_LAYER_PROMPT_HEADER,
    '',
    `Phase id: ${stageId}`,
    `Phase name: ${stageName}`,
    `Gate check result: ${gateSummary}`,
    '',
    '--- TEMPLATE ---',
    template,
    '',
    '--- ARTIFACTS ---',
    ...artifactTexts,
  ].join('\n')

  const runValidate = async (): Promise<{ ok: boolean; output: string }> => {
    const entry = await runPluginScript(pluginScriptsDir, 'validate_frozen_layer.py', [
      '--state', join(projectPath, STATE_FILE), '--phase', stageId,
    ])
    return { ok: entry.ok, output: entry.stdout || entry.stderr }
  }

  for (const attempt of [0, 1] as const) {
    const prompt = attempt === 0
      ? basePrompt
      : `${basePrompt}\n\n--- YOUR PREVIOUS DRAFT DID NOT PASS VALIDATION ---\n`
        + `Fix these problems and output the full corrected document, same rules as before:\n`
        + `${(await runValidate()).output}`

    const entry = await runCommand(
      claudePath, ['-p', ...CLAUDE_SAFE_ARGS], claudeWorkingDirectory(), { input: prompt },
    )
    if (!entry.ok) {
      return { ok: false, error: entry.stderr || 'Claude could not draft the phase summary.' }
    }
    const draft = rawStdout(entry).trim()
    if (!draft) {
      return { ok: false, error: 'Claude returned nothing for the phase summary.' }
    }

    writeFileSync(layerPath, draft, 'utf-8')

    const validated = await runValidate()
    if (validated.ok) return { ok: true, path: layerPath }
    if (attempt === 1) return { ok: false, error: validated.output }
  }
  // Unreachable — the loop above always returns — but keeps the function's return type honest.
  return { ok: false, error: 'The frozen layer could not be produced.' }
}

/** Signs off a stage and advances the phase — the general version of `advanceAfterDeclaration`.
 * One orchestrator, one IPC round-trip: check the gates, confirm every judgement question,
 * draft and validate the frozen layer, snapshot the artifact record, then advance. Stops and
 * names exactly where it stopped on any refusal — never a partial, ambiguous state. */
export async function signOffStage(
  projectPath: string,
  pluginScriptsDir: string,
  claudePath: string,
  stageId: string,
  signedBy: string,
  disciplineSignoffs: DisciplineSignoff[],
): Promise<SignOffResult> {
  if (!signedBy.trim()) {
    return { ok: false, stage: 'name', error: 'Signing off needs the name of the person who signed it.' }
  }

  const readiness = await getStageReadiness(projectPath, pluginScriptsDir, stageId)
  if (!readiness.ok) {
    return { ok: false, stage: 'not-current', error: readiness.error ?? 'Could not read this stage.' }
  }
  if (!readiness.isCurrent) {
    return { ok: false, stage: 'not-current', error: 'This is not the project\'s current stage — only the current stage can be signed off.' }
  }
  const unconfirmed = readiness.judgement.filter((q) => !q.confirmation)
  if (unconfirmed.length > 0) {
    return {
      ok: false,
      stage: 'confirmations',
      error: `${unconfirmed.length} question(s) still need to be confirmed: ${unconfirmed.map((q) => q.text).join('; ')}`,
    }
  }

  const gateCheck = await checkStageGates(projectPath, pluginScriptsDir, stageId)
  if (gateCheck.blocked) {
    return { ok: false, stage: 'gates', error: gateCheck.raw }
  }

  const layer = await draftAndValidateFrozenLayer(
    projectPath, pluginScriptsDir, claudePath, stageId, readiness.name, gateCheck,
  )
  if (!layer.ok) {
    return { ok: false, stage: 'frozen-layer', error: layer.error }
  }

  // Advisory and best-effort by design (it always exits 0) — a failure here is not a reason to
  // refuse the sign-off, only something the audit trail would otherwise have caught.
  await runPluginScript(pluginScriptsDir, 'audit_artifacts.py', [
    'record', '--state', join(projectPath, STATE_FILE), '--scan',
  ]).catch(() => undefined)

  // The frozen layer exists only on this machine until this reaches the remote —
  // advanceAfterDeclaration's own save is scoped to state.yaml alone, so without this the
  // summary a phase sign-off just wrote would never leave the machine that wrote it. Scoped to
  // just the layer's own path, same discipline as every other save in this app — signing off a
  // phase must never sweep up whatever else a person happened to be mid-editing elsewhere in
  // the project. A rejected direct push still opens a PR and reports ok:true (save()'s own
  // fallback), which is success here too — the content reached the shared repository, pending
  // review.
  const layerRelPath = `.sdlc/context/layers/phase${stageId}-${readiness.name}.md`
  const layerSaved = await save(
    projectPath, pluginScriptsDir, `Phase ${stageId} frozen-layer summary, by ${signedBy}`,
    { onlyPath: layerRelPath, actor: signedBy },
  )
  if (!layerSaved.ok) {
    return { ok: false, stage: 'frozen-layer', error: layerSaved.error ?? 'The phase summary could not be saved.' }
  }

  const triples = disciplineSignoffs
    .filter((s) => s.discipline.trim() && s.section.trim() && s.by.trim())
    .map((s) => `${s.discipline}:${s.section}:${s.by}`)

  const advanced = await advanceAfterDeclaration(projectPath, pluginScriptsDir, signedBy, {
    commitNote: `Phase ${stageId} (${readiness.display}) signed off by ${signedBy}`,
    disciplineSignoffs: triples,
  })
  if (!advanced.ok) {
    return { ok: false, stage: 'advance', error: advanced.error ?? 'The phase did not advance.' }
  }

  return { ok: true, fromPhase: advanced.fromPhase, toPhase: advanced.toPhase, note: advanced.note }
}
