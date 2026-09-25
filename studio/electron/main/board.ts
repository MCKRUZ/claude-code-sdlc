// Fetching the Build board (spec 0011) — the only part of the board that talks to anything.
//
// It fetches ONCE. Everything the board then does with what it fetched — role views, search,
// filters, grouping — is in boardModel.ts and touches nothing, because the spec requires that
// switching a view does not re-read the repository.
//
// Two plugin calls, both read-only, neither of which grows with the number of specs:
//
//   spec_status.py --all   every spec, plus live pull-request state from ONE code-host
//                          request. Measured: 1.2s for 200 specs, against ~137s for the
//                          per-spec call this replaces.
//   track_specs.py --json  the per-team work-in-progress limits, which live in the project's
//                          cadence plan and are the plugin's to interpret, not Studio's.

import { runPluginScript } from './project'
import { resolveProjectDocument } from './projectPaths'
import { isOnRemote, save } from './sync'
import type {
  Board, BoardRow, DeclarationResult, DeclarationStatus, HandoffReportResult, SpecReadiness,
  SpecStatus, SpecTransitionResult,
} from '../../shared/types'

interface RawPullRequest {
  number: number
  url: string
  state: string
  merged_at: string | null
  updated_at: string | null
  waiting_on: string
  waiting_on_handle: string | null
}

interface RawRow {
  spec?: string
  name?: string
  path?: string
  title?: string
  status?: string
  risk?: string
  team?: string
  channel?: string
  owner?: string
  developer?: string
  checker?: string
  branch?: string
  pull_request?: RawPullRequest | null
  error?: string
}

function toRow(raw: RawRow): BoardRow {
  return {
    spec: raw.spec ?? '????',
    name: raw.name ?? '',
    path: raw.path ?? '',
    title: raw.title ?? '',
    status: raw.status ?? '',
    risk: raw.risk ?? '',
    team: raw.team ?? '',
    channel: raw.channel ?? '',
    owner: raw.owner ?? '',
    developer: raw.developer ?? '',
    checker: raw.checker ?? '',
    branch: raw.branch ?? '',
    pullRequest: raw.pull_request
      ? {
          number: raw.pull_request.number,
          url: raw.pull_request.url,
          state: raw.pull_request.state,
          mergedAt: raw.pull_request.merged_at,
          updatedAt: raw.pull_request.updated_at,
          waitingOn: raw.pull_request.waiting_on,
          waitingOnHandle: raw.pull_request.waiting_on_handle,
        }
      : null,
    ...(raw.error ? { error: raw.error } : {}),
  }
}

const EMPTY: Board = { rows: [], codeHostAvailable: false, error: null, teamLimits: null }

/** Per-team limits, or null when the project has not adopted them.
 *
 * `track_specs.py` EXITS 1 when a team is over its limit — that is a finding about the
 * project, not a failure of the call, and treating it as an error would make the board go
 * blank exactly when a team is in trouble. So the output is read regardless of status. */
async function fetchTeamLimits(
  projectPath: string,
  pluginScriptsDir: string,
): Promise<Board['teamLimits']> {
  const entry = await runPluginScript(pluginScriptsDir, 'track_specs.py', ['--repo', projectPath, '--json'])
  try {
    return (JSON.parse(entry.stdout).wip_by_team as Board['teamLimits']) ?? null
  } catch {
    return null
  }
}

export async function getBoard(projectPath: string, pluginScriptsDir: string): Promise<Board> {
  const entry = await runPluginScript(pluginScriptsDir, 'spec_status.py', [
    '--repo', projectPath, '--all', '--json',
  ])

  let parsed: { specs?: RawRow[]; code_host_available?: boolean; error?: string | null }
  try {
    parsed = JSON.parse(entry.stdout)
  } catch {
    return { ...EMPTY, error: entry.stderr.trim() || 'Could not read the specs in this project.' }
  }

  return {
    rows: (parsed.specs ?? []).map(toRow),
    codeHostAvailable: parsed.code_host_available === true,
    error: parsed.error ?? null,
    teamLimits: await fetchTeamLimits(projectPath, pluginScriptsDir),
  }
}


/** ONE spec, in full: every check, the grader's verdict, approvals, and who it is waiting on.
 *
 * Deliberately the per-spec call, not a slice of the board's bulk data — the detail this view
 * exists to show (the grader's verdict, the age of a review request) each needs its own
 * request, and the bulk call does not fetch them.
 *
 * Worth knowing, and surfaced rather than hidden: this call is the one place the plugin
 * writes. If the pull request has merged since anyone last looked, it records `status: merged`
 * on the spec. That is the plugin keeping its own record honest, not this view acting — the
 * view still offers no control that changes anything, which is what the spec asks for — but a
 * read that can commit deserves to be stated out loud rather than discovered. The board's
 * refresh deliberately does NOT do this, since it runs on a timer.
 */
export async function getSpecStatus(
  projectPath: string,
  pluginScriptsDir: string,
  specPath: string,
): Promise<{ ok: boolean; status?: SpecStatus; error?: string }> {
  let fullSpecPath: string
  try {
    fullSpecPath = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const entry = await runPluginScript(pluginScriptsDir, 'spec_status.py', [
    '--repo', projectPath, '--spec', fullSpecPath, '--json',
  ])
  try {
    return { ok: true, status: JSON.parse(entry.stdout) as SpecStatus }
  } catch {
    return { ok: false, error: entry.stderr.trim() || 'Could not read this spec’s status.' }
  }
}


/** What this spec still needs before it can be handed to anyone.
 *
 * Read-only, and it owns no judgement: spec_readiness.py wraps the plugin's protected
 * readiness checker and every finding, severity and message is that checker's. Studio does
 * not decide what "ready" means, and must not — the hand-off enforces the same rule from the
 * same source, so a screen with its own opinion would eventually disagree with the command
 * that actually refuses. */
export async function getSpecReadiness(
  projectPath: string,
  pluginScriptsDir: string,
  specPath: string,
): Promise<SpecReadiness> {
  const notReady = (error: string): SpecReadiness =>
    ({ ok: false, error, ready: false, spec: '', risk: '', status: '', blocking: [], advisory: [], passed: [] })

  let fullSpecPath: string
  try {
    fullSpecPath = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    return notReady((err as Error).message)
  }

  const entry = await runPluginScript(pluginScriptsDir, 'spec_readiness.py', [
    '--spec', fullSpecPath, '--state', `${projectPath}/.sdlc/state.yaml`, '--json',
  ])
  try {
    return JSON.parse(entry.stdout) as SpecReadiness
  } catch {
    // Never "ready" on a failure to read. A spec whose readiness is unknown is not ready.
    return notReady(entry.stderr.trim() || 'Could not read this spec’s readiness.')
  }
}


/** Mark a spec ready, or change its risk tier. Both refuse in the plugin, never here.
 *
 * Studio offers these as actions and reports what comes back. The rules — a spec cannot be
 * marked ready until it is, and lowering a risk tier needs a named person — live in the
 * plugin's own command, because a rule enforced only in this window is one that anyone
 * editing the spec file directly steps around.
 *
 * Writes the file and nothing else. Committing it is spec 0009's save, which is a separate,
 * deliberate act by the person. */
export async function transitionSpec(
  projectPath: string,
  pluginScriptsDir: string,
  specPath: string,
  action: { kind: 'ready' } | { kind: 'risk'; tier: string; authorisedBy?: string },
): Promise<SpecTransitionResult> {
  let fullSpecPath: string
  try {
    fullSpecPath = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    return { ok: false, refusal: { kind: 'other', message: (err as Error).message } }
  }

  const args = ['--spec', fullSpecPath, '--state', `${projectPath}/.sdlc/state.yaml`, '--json']
  if (action.kind === 'ready') {
    args.push('ready')
  } else {
    args.push('risk', action.tier)
    if (action.authorisedBy?.trim()) args.push('--authorised-by', action.authorisedBy.trim())
  }

  const entry = await runPluginScript(pluginScriptsDir, 'spec_transition.py', args)
  try {
    const parsed = JSON.parse(entry.stdout)
    if (parsed.ok !== true) {
      return { ok: false, refusal: {
        kind: String(parsed.refusal?.kind ?? 'other'),
        message: String(parsed.refusal?.message ?? 'The change was refused.'),
      } }
    }
    return { ok: true, changed: parsed.changed === true, message: String(parsed.message ?? '') }
  } catch {
    // The command refuses before it writes, so an unreadable answer means nothing happened.
    return { ok: false, refusal: {
      kind: 'other',
      message: entry.stderr.trim() || 'The change command gave no readable answer.',
    } }
  }
}

function confirmationArgs(confirmedTeams: Record<string, string>): string[] {
  return Object.entries(confirmedTeams).flatMap(([team, handle]) => ['--confirmed', `${team}=${handle}`])
}

/** What stands between this project and declaring Build finished. Read-only. */
export async function getDeclarationStatus(
  projectPath: string,
  pluginScriptsDir: string,
  confirmedTeams: Record<string, string>,
): Promise<DeclarationStatus> {
  const entry = await runPluginScript(pluginScriptsDir, 'declare_complete.py', [
    '--repo', projectPath, '--json', 'check', ...confirmationArgs(confirmedTeams),
  ])
  try {
    return JSON.parse(entry.stdout) as DeclarationStatus
  } catch {
    // can_declare: false on an unreadable answer. The one direction that must never fail open
    // — a declaration permitted because a check could not run is exactly the false statement
    // this whole command exists to prevent.
    return {
      ok: false,
      can_declare: false,
      blockers: [{
        kind: 'unreadable',
        count: 1,
        message: entry.stderr.trim()
          || 'Whether Build can be declared finished could not be determined, so it cannot.',
      }],
      unfinished: [], deferred: [], teamless: [], teams_in_list: [],
      totals: { specs: 0, unfinished: 0, deferred: 0 },
    }
  }
}

/** Refuse, or report that a declaration is permitted. Every rule is the plugin's. */
export async function declareComplete(
  projectPath: string,
  pluginScriptsDir: string,
  declaredBy: string,
  confirmedTeams: Record<string, string>,
): Promise<DeclarationResult> {
  const entry = await runPluginScript(pluginScriptsDir, 'declare_complete.py', [
    '--repo', projectPath, '--json', 'declare',
    '--declared-by', declaredBy, ...confirmationArgs(confirmedTeams),
  ])
  try {
    const parsed = JSON.parse(entry.stdout)
    if (parsed.ok !== true) {
      return { ok: false, refusal: {
        kind: String(parsed.refusal?.kind ?? 'other'),
        message: String(parsed.refusal?.message ?? 'The declaration was refused.'),
      } }
    }
    return parsed as DeclarationResult
  } catch {
    return { ok: false, refusal: {
      kind: 'other',
      message: entry.stderr.trim() || 'The declaration command gave no readable answer.',
    } }
  }
}

/** Defer one spec with a reason. The plugin refuses an empty reason AND a token one. */
export async function deferSpec(
  projectPath: string,
  pluginScriptsDir: string,
  specPath: string,
  reason: string,
  actor?: string,
): Promise<SpecTransitionResult> {
  let fullSpecPath: string
  try {
    fullSpecPath = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    return { ok: false, refusal: { kind: 'other', message: (err as Error).message } }
  }

  const entry = await runPluginScript(pluginScriptsDir, 'spec_transition.py', [
    '--spec', fullSpecPath, '--json', 'defer', '--reason', reason,
  ])

  let parsed: { ok?: boolean; changed?: boolean; message?: string; refusal?: { kind?: string; message?: string } }
  try {
    parsed = JSON.parse(entry.stdout)
  } catch {
    return { ok: false, refusal: {
      kind: 'other',
      message: entry.stderr.trim() || 'The deferral command gave no readable answer.',
    } }
  }

  if (parsed.ok !== true) {
    return { ok: false, refusal: {
      kind: String(parsed.refusal?.kind ?? 'other'),
      message: String(parsed.refusal?.message ?? 'The deferral was refused.'),
    } }
  }

  const changed = parsed.changed === true
  const message = String(parsed.message ?? '')
  if (!changed) {
    // Already deferred. Nothing was written, so there is nothing to save — and saving anyway
    // would put an empty commit on the record for a button press that changed nothing.
    return { ok: true, changed: false, message }
  }

  // The deferral is not real until it reaches the repository. Until this call the status and
  // reason lived in one person's working copy: it looked done on their screen and nothing had
  // happened for anybody else — and a deferral is precisely the thing somebody ELSE goes
  // looking for later, when they ask why an expected feature is not there.
  const saved = await save(projectPath, pluginScriptsDir, `Deferred: ${reason}`, {
    onlyPath: specPath,
    actor,
  })
  if (!saved.ok) {
    // Reported rather than swallowed, and deliberately not called a success. The file on this
    // machine HAS changed, so saying so is the honest answer — the half that failed is the half
    // that makes it true for everyone else, and the person needs to know which half they have.
    return {
      ok: false,
      changed: true,
      message,
      refusal: {
        kind: 'not_saved',
        message: `The spec was marked deferred on this machine, but saving it to the `
          + `repository failed, so nobody else can see it yet: `
          + `${saved.error ?? 'the save gave no reason'}`,
      },
    }
  }

  return {
    ok: true,
    changed: true,
    message,
    note: 'Saved to the repository, so the deferral and its reason are on the record.',
  }
}

const HANDOFF_REPORT = '.sdlc/artifacts/close/final-handoff-report.md'

/** Produce the hand-over document, through the plugin's own generator (spec 0014).
 *
 * Studio composes nothing here. `generate_handoff_report.py` already assembles the phase
 * report index, the per-phase gate and sign-off table, the metrics history and the spec
 * backlog — and, the part this spec cares about, one line per deferred spec with the reason
 * somebody typed. That list is what a person goes looking for months later when they ask why
 * an expected feature is not there, so it has to come from the specs themselves rather than
 * from anything Studio remembers.
 *
 * It refuses to overwrite an existing report, and that refusal is passed through rather than
 * forced. A hand-over document somebody has already edited is exactly the kind of work this
 * product exists not to destroy, so replacing it is a question for a person, not a default.
 */
export async function generateHandoffReport(
  projectPath: string,
  pluginScriptsDir: string,
  options: { actor?: string; replaceExisting?: boolean } = {},
): Promise<HandoffReportResult> {
  const args = ['--repo', projectPath]
  if (options.replaceExisting) args.push('--force')

  const entry = await runPluginScript(pluginScriptsDir, 'generate_handoff_report.py', args)
  if (!entry.ok) {
    const stderr = entry.stderr.trim()
    // The generator's own refusal, recognised so the screen can offer the choice rather than
    // showing a person a raw error they cannot act on.
    if (/refusing to overwrite/i.test(stderr)) {
      return {
        ok: false,
        alreadyExists: true,
        path: HANDOFF_REPORT,
        error: 'A hand-over document already exists. Replacing it would discard whatever has '
          + 'been written into it since.',
      }
    }
    return { ok: false, error: stderr || 'The hand-over document could not be produced.' }
  }

  // Produced locally is not produced. The whole point of this document is that somebody else
  // reads it, and until it is saved it exists on one machine.
  const saved = await save(projectPath, pluginScriptsDir, 'Drafted the hand-over document', {
    onlyPath: HANDOFF_REPORT,
    actor: options.actor,
  })
  // `ok` alone is not enough, and trusting it was a real bug caught by a real remote: save()
  // answers ok:true with "nothing to save" when it found no change to commit. So when no
  // commit happened, the remote is ASKED — because the question here is "can somebody else
  // read this?", not "did a commit happen". Regenerating a document that is already saved
  // legitimately commits nothing, and that is a success; a document that never left this
  // machine is the failure, and the two are indistinguishable from the save's answer alone.
  if (saved.ok && !saved.outcome && !(await isOnRemote(projectPath, HANDOFF_REPORT))) {
    return {
      ok: false,
      path: HANDOFF_REPORT,
      wroteLocally: true,
      error: `The hand-over document was written on this machine, but nothing was committed, `
        + `so nobody else can read it yet: ${saved.error ?? 'no change was detected to save'}`,
    }
  }
  if (!saved.ok) {
    return {
      ok: false,
      path: HANDOFF_REPORT,
      wroteLocally: true,
      error: `The hand-over document was written on this machine, but saving it to the `
        + `repository failed, so nobody else can read it yet: `
        + `${saved.error ?? 'the save gave no reason'}`,
    }
  }

  return {
    ok: true,
    path: HANDOFF_REPORT,
    note: entry.stdout.includes('[Fill:')
      || /fill the \[Fill/i.test(entry.stdout)
      ? 'Drafted and saved. The sections marked to fill need a person before delivery — the '
        + 'numbers are assembled, the judgement is not.'
      : 'Drafted and saved.',
  }
}
