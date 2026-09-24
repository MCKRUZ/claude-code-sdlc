// Asking Claude to draft one field, and recording what happened to it (spec 0010).
//
// Two rules, both from the spec's own acceptance checks:
//
//  * A draft fills THAT FIELD ONLY, and the person accepts or discards it before anything is
//    saved. Nothing here writes a document — it returns text for review. The write, if the
//    person accepts, goes through documents.setField like any other edit.
//
//  * Every draft is recorded WITH ITS OUTCOME, including a discarded one (spec 0010's resolved
//    Decision List — Matt reversed the spec's original "leaves no trace" default). The record
//    goes to the plugin's draft ledger, never into the document's version history: that
//    history is a record of what the document actually says, and text that was rejected is by
//    definition not in it.

import { runCommand } from './commandRunner'
import { runPluginScript } from './project'
import type { DraftOutcome, DraftResult } from '../../shared/types'

/** The same invocation claudeAssist.ts verified against the real CLI: one-shot, non-
 * interactive, and every permission prompt denied automatically — so drafting a paragraph can
 * never read, write or run anything as a side effect. */
export async function draftField(
  claudePath: string,
  projectPath: string,
  documentName: string,
  sectionHeading: string,
  label: string,
  guidance: string,
  surroundingText: string,
): Promise<DraftResult> {
  const prompt = [
    `You are drafting ONE field of a project document called "${documentName}".`,
    `Section: ${sectionHeading}`,
    `Field: ${label}`,
    guidance ? `What this field is for: ${guidance}` : '',
    '',
    'Here is the rest of that section, for context only — do not rewrite any of it:',
    '---',
    surroundingText,
    '---',
    '',
    `Write ONLY the text for the "${label}" field. No preamble, no explanation, no heading,`,
    'no markdown code fence, no label — just the field\'s own content.',
  ].filter(Boolean).join('\n')

  const entry = await runCommand(claudePath, ['-p', prompt, '--permission-prompts', 'none'], projectPath)
  if (!entry.ok) {
    return { ok: false, error: entry.stderr || 'Claude could not draft this field.' }
  }
  const text = entry.stdout.trim()
  if (!text) {
    return { ok: false, error: 'Claude returned nothing for this field.' }
  }
  return { ok: true, text }
}

/** Append the draft and its outcome to the plugin's ledger. Best-effort by design: failing to
 * record an audit line must never lose the person's actual edit, so this reports rather than
 * throws, and the caller carries on. */
export async function recordDraftOutcome(
  projectPath: string,
  pluginScriptsDir: string,
  relPath: string,
  label: string,
  outcome: DraftOutcome,
  actor: string,
  charsOffered: number,
  charsKept: number,
  instance?: string,
): Promise<{ ok: boolean; error?: string }> {
  const args = [
    'record',
    '--repo', projectPath,
    '--artifact', relPath,
    '--field', label,
    '--outcome', outcome,
    '--actor', actor,
    '--chars-offered', String(charsOffered),
    '--chars-kept', String(charsKept),
  ]
  if (instance) args.push('--instance', instance)

  const entry = await runPluginScript(pluginScriptsDir, 'record_draft.py', args)
  if (!entry.ok) {
    return { ok: false, error: entry.stderr || 'The draft outcome was not recorded.' }
  }
  return { ok: true }
}
