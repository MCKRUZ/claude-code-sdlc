// The provider contract: what a code host must answer for Studio's three repository features —
// "who am I" (the actor behind a save / sign-off), the pull-request fallback when a direct push
// is refused, and the poll that merges Studio's OWN pull request. The shapes are gh's, by
// design: sync.ts's PrListEntry and ~60 existing tests already speak them, so Azure DevOps is
// the single translator (hosts/adoMap.ts) and GitHub passes gh's JSON through untouched.
//
// Lives apart from codeHost.ts so the host modules can import the types while codeHost.ts
// imports the hosts — no cycle.

import type { CliName, HostName } from '../../shared/codeHostModel'
import type { PrListEntry } from './sync'

export type { PrListEntry }

/** The signed-in person as the host reports them. `kind` says what `login` is: a GitHub login
 * or an Azure DevOps UPN. Roster resolution to an `@handle` happens in the caller (Wave 6-B),
 * never here — a provider must not guess a handle from a display name or a UPN prefix. */
export interface Identity {
  login: string
  kind: 'login' | 'upn'
  name?: string | null
  email?: string | null
  id?: string | null
  /** Azure DevOps only — which tenant az's default account belongs to (the token follows it). */
  tenant?: string | null
}

/** The repository record. GitHub's one allowed call reads the owner only (today's
 * `repo view --json owner`); Azure DevOps reads the whole record. `headOwnerKey` is the one
 * field the merge poll compares against PrListEntry.headRepositoryOwner.login — the owner
 * login on GitHub, the repository GUID on Azure DevOps (where the entry carries `repository.id`). */
export interface RepoView {
  id: string | null
  name: string | null
  ownerLogin: string | null
  defaultBranch: string | null
  webUrl: string | null
  isFork: boolean | null
  headOwnerKey: string | null
}

export interface CreatePullRequestOptions {
  base: string
  head: string
  title: string
  body: string
  /** GitHub: a login (a leading `@` is tolerated). Azure DevOps: the reviewer's EMAIL, already
   * resolved from the roster by the caller; null when there is nobody to request. */
  reviewer: string | null
}

export interface CreatePullRequestResult {
  url: string
  /** Something the host did differently from what was asked, in words for the toast. */
  note?: string
}

export interface CodeHost {
  readonly kind: HostName
  readonly cli: CliName
  whoAmI(): Promise<Identity>
  repoView(): Promise<RepoView>
  /** Best-effort display only — the real gate is always "did the direct push get refused".
   * null when the host could not say. */
  isBranchProtected(defaultBranch: string): Promise<boolean | null>
  createPullRequest(opts: CreatePullRequestOptions): Promise<CreatePullRequestResult>
  listOpenPullRequests(head: string): Promise<PrListEntry[]>
  /** Returns the pull request's web URL. */
  mergePullRequest(number: number): Promise<string>
}

export type UnavailableState = 'not_installed' | 'extension_missing' | 'signed_out' | 'pat_only' | 'no_host' | 'fail_closed' | 'unknown'

/** A feature is off because the CLI cannot do it here — never because it ran and failed.
 * `reason` is the §7.1 wording the control shows; `state` is what a caller branches on. */
export class CodeHostUnavailable extends Error {
  /** `reason` is exactly the §7.1 sentence (the renderer matches on it); `hint` is the extra
   * "what to do" text that only the message carries. */
  constructor(public readonly reason: string, public readonly state: UnavailableState = 'unknown', public readonly hint: string | null = null) {
    super(hint ? `${reason} ${hint}` : reason)
    this.name = 'CodeHostUnavailable'
  }
}

/** Async memo with a TTL, keyed per project: whoAmI / repoView / the extension probe are read
 * once per poll interval rather than once per call. A rejected promise is not kept — the next
 * call probes again, so a transient failure cannot pin "unavailable" for two minutes. */
export type Memo = <T>(key: string, fn: () => Promise<T>) => Promise<T>
