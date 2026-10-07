/** The captured Azure DevOps documents, read the way the pytest side reads them
 * (scripts/tests/ado_fixtures.py): unwrap the `{ _provenance, _command, _secs, value }` envelope
 * and DERIVE every id, UPN, GUID, branch and count from the document itself. The anonymiser
 * re-assigns its placeholders per capture (every branch is `branch-x`, people are `personN`,
 * GUIDs are numbered by first appearance), so a test that spells one out is a test of the last
 * capture, not of the mapping — a third capture must change the data here and leave the
 * assertions alone. Rows a capture does not contain are reported as null, and the tests skip
 * them by name rather than faking them. */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRemote, type RemoteInfo } from '../shared/codeHostRemote'
import { stripRef } from '../electron/main/hosts/adoMap'
import { locatePlugin } from './pluginRoot'

export type Dict = Record<string, unknown>
export const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown): string => (typeof v === 'string' ? v : '')
/** `createdBy.uniqueName` / `reviewers[].uniqueName` — the UPN, which is what the host writes on a PR. */
export const upn = (ident: unknown): string => (isDict(ident) ? str(ident.uniqueName) : '')

const plugin = locatePlugin(__dirname)
export const CAPTURED = join(plugin.root ?? plugin.searched[plugin.searched.length - 1]!, 'scripts', 'tests', 'fixtures', 'code_host', 'azure_devops', 'captured')

export function fixture<T>(name: string): T {
  const doc = JSON.parse(readFileSync(join(CAPTURED, `${name}.json`), 'utf-8')) as Dict
  return ('value' in doc ? doc.value : doc) as T
}
/** null when this capture did not produce the file. */
export function optionalFixture<T>(name: string): T | null {
  return existsSync(join(CAPTURED, `${name}.json`)) ? fixture<T>(name) : null
}

export const accountShow = fixture<Dict>('account_show')
export const reposShow = fixture<Dict>('repos_show')
export const prList = fixture<Dict[]>('pr_list')
/** `repos policy list` scoped to the default branch — legitimately `[]` on a branch with no policies. */
export const policyList = fixture<Dict[]>('policy_list')

/** The remote the capture was taken against, read off `repos show`'s own webUrl, so the
 * `--org/--project/--repository` argv and the pull-request URL agree with the repository GUID. */
export const remote: RemoteInfo = parseRemote(str(reposShow.webUrl))!
export const REPO_GUID = str(reposShow.id)

/** Every pull-request document the capture holds, one per id: the listings first, then the
 * single `pr show` answers (the abandoned one may be kept from an earlier capture — within one
 * document its GUIDs are self-consistent, which is all a mapping test reads). */
export const prDocs: Dict[] = (() => {
  const singles = ['pr_show', 'pr_show_active', 'pr_show_completed', 'pr_show_abandoned'].map((n) => optionalFixture<Dict>(n))
  const all = [...prList, ...(optionalFixture<Dict[]>('pr_list_repo') ?? []), ...singles.filter(isDict)]
  const seen = new Set<unknown>()
  return all.filter((p) => (seen.has(p.pullRequestId) ? false : (seen.add(p.pullRequestId), true)))
})()

/** The first active row of `pr list`, and the branch the host's `--source-branch` query names. */
export const activeRow = prList.find((p) => p.status === 'active') ?? null
export const HEAD = stripRef(activeRow?.sourceRefName)

export const reviewersOf = (pr: Dict): Dict[] => (Array.isArray(pr.reviewers) ? pr.reviewers.filter(isDict) : [])
/** Reviewers whose vote can count: not a group (`isContainer`), not the author. */
export const votersOf = (pr: Dict): Dict[] => reviewersOf(pr).filter((r) => !r.isContainer && upn(r).toLowerCase() !== upn(pr.createdBy).toLowerCase())
export const voteOf = (r: Dict): number => (typeof r.vote === 'number' ? r.vote : 0)

// Policy TYPE ids are vocabulary — the anonymiser keeps them verbatim, so they may be spelled.
export const BUILD_TYPE = '0609b952-1397-4640-95ec-e00a01b2c241'
export const STATUS_TYPE = 'cbdc66da-9728-4af8-aada-9a5a32e4a226'
export const APPROVERS_TYPE = 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd'
export const isCheckType = (id: string): boolean => id === BUILD_TYPE || id === STATUS_TYPE

/** PolicyEvaluationRecord[] from whichever `pr policy list` answer in this capture is non-empty
 * — the record shape does not depend on which pull request answered. `[]` when none did. */
export const policyRecords: Dict[] = ['pr_policy_list_active', 'pr_policy_list', 'pr_policy_list_abandoned']
  .map((n) => optionalFixture<Dict[]>(n) ?? []).find((r) => r.length > 0) ?? []
export const configOf = (rec: Dict): Dict => (isDict(rec.configuration) ? rec.configuration : {})
export const settingsOf = (cfg: Dict): Dict => (isDict(cfg.settings) ? cfg.settings : {})
export const typeIdOf = (cfg: Dict): string => (isDict(cfg.type) ? str(cfg.type.id) : '')
export const contextOf = (cfg: Dict): unknown => settingsOf(cfg).displayName ?? settingsOf(cfg).statusName
