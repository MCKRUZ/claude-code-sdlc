// The decision log through the plugin's own verbs (togo-command-center.md §2.2, §2.4):
// `track_decisions.py --json` to read, `open` / `decide` to write. The two-business-day clock,
// the DL-NN ids and the overdue flag are the plugin's; Studio passes strings and shows what came
// back. A refusal is exit 1 with the message on stderr — reported as `{ok:false, stderr}`, never
// reshaped. `--owner` defaults to the resolved actor; `--by` IS the actor and is never typed.

import { runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import { run, sourceArgs } from './sprint'
import { invalidateCommandCenter } from './commandCenter'
import { isRecord, parseDocument, readDecisions } from './commandCenterReaders'
import { NO_ACTOR } from '../../shared/reasons'
import type { ActorInfo, DecideDecisionResult, DecisionsView, OpenDecisionResult } from '../../shared/types'

export const DECISION_ID = /^DL-\d+$/i
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** `track_decisions.py --json`. Rejects (a thrown Error carrying the plugin's words) when the
 * answer is not the report — the IPC contract returns a `DecisionsView`, and an all-zero view
 * for "could not read" would be a fabricated number. The plugin's own `exists:false` document
 * for a project with no log is a real answer and comes back as data. */
export async function getDecisions(projectPath: string, scriptsDir: string): Promise<DecisionsView> {
  const ran = await run(scriptsDir, 'track_decisions.py', [...sourceArgs(projectPath), '--json'])
  const view = ran.raw ? readDecisions(ran.raw) : null
  if (!view) throw new Error(ran.stderr.trim() || ran.stdout.trim() || 'track_decisions.py gave no readable report')
  return view
}

export async function openDecision(
  projectPath: string, scriptsDir: string, decision: string, owner: string | undefined, actor: ActorInfo | null,
): Promise<OpenDecisionResult> {
  const text = decision?.trim()
  if (!text) return { ok: false, stderr: 'A decision needs the question a person must decide.' }
  if (/[\r\n]/.test(text)) return { ok: false, stderr: 'A decision is one line.' }
  const who = owner?.trim() || actor?.name
  if (!who) return { ok: false, stderr: NO_ACTOR }
  if (/[\r\n]/.test(who)) return { ok: false, stderr: 'An owner is one line.' }

  const entry = await runPluginScript(scriptsDir, 'track_decisions.py', ['open', ...sourceArgs(projectPath), '--decision', text, '--owner', who, '--json'])
  invalidateCommandCenter(projectPath)
  const doc = parseDocument(rawStdout(entry))
  if (entry.exitCode !== 0 || !doc || typeof doc.id !== 'string') return { ok: false, stderr: entry.stderr.trim() || entry.stdout.trim() || 'The decision was not opened.' }
  return { ok: true, id: doc.id, opened: str(doc.opened), due: str(doc.due), owner: str(doc.owner), ...(typeof doc.path === 'string' ? { path: doc.path } : {}) }
}

export async function decideDecision(
  projectPath: string, scriptsDir: string, id: string, resolution: string, actor: ActorInfo | null,
): Promise<DecideDecisionResult> {
  if (!actor) return { ok: false, stderr: NO_ACTOR }
  const wanted = id?.trim()
  if (!wanted || !DECISION_ID.test(wanted)) return { ok: false, stderr: `'${id}' is not a decision id (expected DL-01, DL-12, ...).` }
  const text = resolution?.trim()
  if (!text) return { ok: false, stderr: 'Deciding needs the resolution — what was decided.' }
  if (/[\r\n]/.test(text)) return { ok: false, stderr: 'A resolution is one line.' }

  const entry = await runPluginScript(scriptsDir, 'track_decisions.py', ['decide', ...sourceArgs(projectPath), '--id', wanted, '--by', actor.name, '--resolution', text, '--json'])
  invalidateCommandCenter(projectPath)
  const doc = parseDocument(rawStdout(entry))
  if (entry.exitCode !== 0 || !doc || typeof doc.id !== 'string') return { ok: false, stderr: entry.stderr.trim() || entry.stdout.trim() || 'The decision was not recorded.' }
  return { ok: true, id: doc.id, status: str(doc.status), decided: str(doc.decided), by: str(doc.by), ...(typeof doc.path === 'string' ? { path: doc.path } : {}) }
}

export { isRecord }
