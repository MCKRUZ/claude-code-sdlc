// Foundation's "which delivery rails have actually fired" evidence (Studio's button for it).
//
// Studio never reimplements plugin logic — it runs the plugin's own script the way a person
// would. The reading of the code host, the classification of each rail and the writing of
// pipeline-proof.md all live in scripts/pipeline_proof.py; this file only runs it and turns its
// JSON into what the panel draws. The script is read-only against the host by construction (a
// test in the plugin pins the exact set of `gh` / `az` calls), so this is safe to put behind a
// button. The `host` the caller passes only chooses the wording of the branch-protection line;
// the script decides the CLI from the repository itself (same precedence as code_host.py).

import { rawStdout } from './commandRunner'
import { runPluginScript } from './project'
import type { PipelineEvidenceResult, PipelineRail, PipelineRailStatus } from '../../shared/types'
import type { HostName } from '../../shared/codeHostModel'

/** The host's name and what it calls its branch rules. `none` reads as GitHub, the CLI the
 * script falls through to. */
function hostWords(host: HostName): { name: string; rules: string; rule: string } {
  return host === 'azure-devops'
    ? { name: 'Azure DevOps', rules: 'branch policies', rule: 'branch policy' }
    : { name: 'GitHub', rules: 'rulesets', rule: 'branch ruleset' }
}

const STATUSES: ReadonlySet<string> = new Set(['PROVEN', 'RAN_UNPROVEN', 'NEVER_FIRED', 'BROKEN', 'NO_DATA'])

/** A status this build does not know is NO_DATA, never passed through: a state added to the
 * script later must not display as a verdict nobody has agreed what it means. */
function asStatus(value: unknown): PipelineRailStatus {
  return typeof value === 'string' && STATUSES.has(value) ? (value as PipelineRailStatus) : 'NO_DATA'
}

const failed = (error: string): PipelineEvidenceResult => ({ ok: false, error, rails: [], proofsNeeded: [] })

interface RawRuleset {
  live?: boolean | null
  enforcing?: boolean | null
  enforcement?: string | null
  error?: string
  required?: string[]
  missing_in_live?: string[] | null
}

function protectionOf(rs: RawRuleset | undefined, host: HostName): PipelineEvidenceResult['protection'] {
  if (!rs) return undefined
  const words = hostWords(host)
  if (rs.error) return { state: 'unreadable', detail: `${words.name}'s ${words.rules} could not be read: ${rs.error}` }
  if (!rs.live) return { state: 'none', detail: `${words.name} reports no ${words.rule}, so nothing enforces the required checks.` }
  if (!rs.enforcing) {
    return { state: 'not_enforcing', detail: `A ruleset exists but its mode is "${rs.enforcement}", so the required checks are advisory only.` }
  }
  const missing = rs.missing_in_live?.length ?? 0
  return {
    state: 'enforcing',
    detail: missing > 0
      ? `Enforcing ${rs.required?.length ?? 0} required checks, but ${missing} expected check(s) are not among them.`
      : `Enforcing ${rs.required?.length ?? 0} required checks.`,
  }
}

export function parsePipelineEvidence(stdout: string, host: HostName = 'github'): PipelineEvidenceResult {
  let raw: Record<string, any>
  try {
    raw = JSON.parse(stdout)
  } catch {
    return failed('The pipeline evidence came back unreadable (it was not valid JSON).')
  }
  if (!raw.ok) return failed(String(raw.error ?? 'The pipeline evidence could not be gathered.'))

  const rails: PipelineRail[] = (raw.rails ?? []).map((r: Record<string, any>) => ({
    rail: String(r.rail),
    status: asStatus(r.status),
    reason: String(r.reason ?? ''),
    runs: typeof r.runs === 'number' ? r.runs : null,
    red: typeof r.red === 'number' ? r.red : null,
    evidence: (r.evidence ?? []).map((e: Record<string, string>) => ({ label: String(e.label), url: String(e.url) })),
  }))
  const unapproved = raw.merge_history?.unapproved_post_enforcement

  return {
    ok: true,
    repo: raw.repo,
    gatheredAt: raw.gathered_at,
    rails,
    proofsNeeded: (raw.proofs_needed ?? []).map((p: Record<string, string>) => ({ rail: p.rail, proof: p.proof, touches: p.touches })),
    protection: protectionOf(raw.ruleset, host),
    unapprovedMerges: Array.isArray(unapproved) ? unapproved.length : null,
    wrote: raw.wrote,
  }
}

export async function gatherPipelineEvidence(
  projectPath: string,
  pluginScriptsDir: string,
  host: HostName = 'github',
): Promise<PipelineEvidenceResult> {
  const entry = await runPluginScript(pluginScriptsDir, 'pipeline_proof.py', ['--repo', projectPath, '--write', '--json'])
  if (!entry.ok) return failed(entry.stderr || 'The pipeline evidence script did not run.')
  // Read as DATA: the evidence carries URLs and PR titles that console redaction could mangle.
  return parsePipelineEvidence(rawStdout(entry), host)
}
