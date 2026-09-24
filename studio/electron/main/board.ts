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
import type { Board, BoardRow } from '../../shared/types'

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
