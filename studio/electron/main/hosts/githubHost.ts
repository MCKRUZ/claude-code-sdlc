// GitHub through the GitHub CLI — today's behaviour, moved behind the provider seam and NOT
// changed. Every argv here is the one sync.ts issued before this layer existed (sync.ts:227,
// 237, 831, 908, 909, 916–919, 968); test/githubHostArgv.test.ts pins them byte for byte, so a
// well-meant "tidy" of a flag is a red test rather than a silent behaviour change for every
// GitHub repository Studio already opens. git.ts stays the single gh spawn point.

import { ghJson as defaultGhJson, runGh as defaultRunGh } from '../git'
import type { CodeHost, CreatePullRequestOptions, CreatePullRequestResult, Identity, Memo, PrListEntry, RepoView } from '../codeHostTypes'

/** The six gh argv, as functions of their inputs — the golden test reads these, and the
 * methods below call nothing else. */
export const GITHUB_ARGV = {
  whoAmI: (): string[] => ['api', 'user', '--jq', '.login'],
  rulesets: (): string[] => ['api', 'repos/{owner}/{repo}/rulesets'],
  prCreate: (o: CreatePullRequestOptions): string[] => {
    const args = ['pr', 'create', '--base', o.base, '--head', o.head, '--title', o.title, '--body', o.body]
    if (o.reviewer) args.push('--reviewer', o.reviewer.replace(/^@/, ''))
    return args
  },
  repoOwner: (): string[] => ['repo', 'view', '--json', 'owner', '--jq', '.owner.login'],
  prList: (head: string): string[] => [
    'pr', 'list', '--head', head, '--state', 'open',
    '--json', 'number,headRefName,author,headRepositoryOwner,files,statusCheckRollup,reviews',
  ],
  prMerge: (number: number): string[] => ['pr', 'merge', String(number), '--merge'],
} as const

export interface GitHubHostDeps {
  runGh?: (args: string[], cwd: string) => Promise<string>
  ghJson?: <T>(args: string[], cwd: string) => Promise<T>
  memo?: Memo
}

const passThrough: Memo = (_key, fn) => fn()

export class GitHubHost implements CodeHost {
  readonly kind = 'github' as const
  readonly cli = 'gh' as const
  private readonly runGh: NonNullable<GitHubHostDeps['runGh']>
  private readonly ghJson: NonNullable<GitHubHostDeps['ghJson']>
  private readonly memo: Memo

  constructor(private readonly cwd: string, deps: GitHubHostDeps = {}) {
    this.runGh = deps.runGh ?? defaultRunGh
    this.ghJson = deps.ghJson ?? defaultGhJson
    this.memo = deps.memo ?? passThrough
  }

  whoAmI(): Promise<Identity> {
    return this.memo('whoAmI', async () => {
      const login = (await this.runGh(GITHUB_ARGV.whoAmI(), this.cwd)).trim()
      if (!login) throw new Error('gh api user returned no login')
      return { login, kind: 'login' }
    })
  }

  repoView(): Promise<RepoView> {
    return this.memo('repoView', async () => {
      const owner = (await this.runGh(GITHUB_ARGV.repoOwner(), this.cwd)).trim() || null
      // One call, one field: the rest is honestly unknown rather than guessed from the remote.
      return { id: null, name: null, ownerLogin: owner, defaultBranch: null, webUrl: null, isFork: null, headOwnerKey: owner }
    })
  }

  async isBranchProtected(_defaultBranch: string): Promise<boolean | null> {
    const rulesets = await this.ghJson<Array<{ enforcement?: string }>>(GITHUB_ARGV.rulesets(), this.cwd)
    return Array.isArray(rulesets) && rulesets.some((r) => r.enforcement === 'active')
  }

  async createPullRequest(opts: CreatePullRequestOptions): Promise<CreatePullRequestResult> {
    return { url: (await this.runGh(GITHUB_ARGV.prCreate(opts), this.cwd)).trim() }
  }

  listOpenPullRequests(head: string): Promise<PrListEntry[]> {
    return this.ghJson<PrListEntry[]>(GITHUB_ARGV.prList(head), this.cwd)
  }

  async mergePullRequest(number: number): Promise<string> {
    return (await this.runGh(GITHUB_ARGV.prMerge(number), this.cwd)).trim()
  }
}
