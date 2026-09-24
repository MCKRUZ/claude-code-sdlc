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
import type { Board, BoardRow, SpecStatus } from '../../shared/types'

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
