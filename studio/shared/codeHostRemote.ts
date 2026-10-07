/** Remote URL → code host: the TypeScript port of scripts/code_host_remote.py, line for line.
 *
 * Pure on purpose, and shared-folder on purpose: the renderer labels a connection by host and the
 * main process picks a CLI by it, and both must agree with the Python scripts Studio shells out
 * to. One fixture — scripts/tests/fixtures/code_host/remote-urls.json — drives pytest and
 * vitest, so a rule changed on one side fails the other. No node imports: `URL` is a global on
 * both sides of the process boundary.
 *
 * The rule itself mirrors the azure-devops extension's own `common/uri.py`, which is what lets
 * the provider pass `--detect false --org --project --repository` and skip az's per-call
 * `GET …/vsts/info` round-trip. Anything unrecognised (GitHub Enterprise, GitLab, Azure DevOps
 * Server) is null; the caller reports `host: none` and `.sdlc/code-host.yaml` is the escape hatch.
 */

export type RemoteHost = 'github' | 'azure-devops'

export interface RemoteInfo {
  host: RemoteHost
  org: string
  /** null on GitHub — only Azure DevOps has a project between the organisation and the repo. */
  project: string | null
  repo: string
  /** `o/r` on GitHub; `org/project/repo` on Azure DevOps. */
  slug: string
  /** `https://dev.azure.com/{org}` or `https://{org}.visualstudio.com/`; null on GitHub. */
  orgUrl: string | null
  webUrl: string
}

// scp-like `user@host:path` — the one shape URL cannot read. No scheme, no `//`.
const SCP_RE = /^([^@/:]+)@([^@/:]+):(.+)$/

/** URL-decode each segment: a project called "Claims%20Ops" must reach az as "Claims Ops". */
function segments(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter((s) => s !== '').map(decodeSegment)
}

function decodeSegment(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

function github(org: string, repo: string): RemoteInfo {
  const name = repo.endsWith('.git') ? repo.slice(0, -4) : repo
  return { host: 'github', org, project: null, repo: name, slug: `${org}/${name}`, orgUrl: null, webUrl: `https://github.com/${org}/${name}` }
}

function ado(org: string, project: string, repo: string, orgUrl: string): RemoteInfo {
  const web = `${orgUrl.replace(/\/+$/, '')}/${project}/_git/${repo}`
  return { host: 'azure-devops', org, project, repo, slug: `${org}/${project}/${repo}`, orgUrl, webUrl: web }
}

/** `v3/{org}/{project}/{repo}` on either ssh host. The user rule differs per host and is what the
 * extension itself checks, so it is checked here too. */
function adoSshV3(user: string, host: string, segs: string[]): RemoteInfo | null {
  if (segs.length !== 4 || segs[0] !== 'v3') return null
  const [, org, project, repo] = segs as [string, string, string, string]
  if (host === 'ssh.dev.azure.com') {
    return user === 'git' ? ado(org, project, repo, `https://dev.azure.com/${org}`) : null
  }
  if (host === 'vs-ssh.visualstudio.com') {
    return user.toLowerCase() === org.toLowerCase() ? ado(org, project, repo, `https://${org}.visualstudio.com/`) : null
  }
  return null
}

/** Which host a remote URL points at, and the parts az/gh need — or null when it is neither
 * GitHub nor Azure DevOps (Services). Never throws on garbage; garbage is just null. */
export function parseRemote(raw: string | null | undefined): RemoteInfo | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const url = raw.trim()
  const afterScheme = url.includes('://') ? url.slice(url.indexOf('://') + 3) : url
  if (/[\r\n\t\\]/.test(url) || afterScheme.includes('//')) return null

  const scp = url.includes('://') ? null : SCP_RE.exec(url)
  if (scp) {
    const [, user, rawHost, path] = scp as unknown as [string, string, string, string]
    const host = rawHost.toLowerCase()
    const segs = segments(path)
    if (host === 'github.com') {
      return user === 'git' && segs.length === 2 ? github(segs[0]!, segs[1]!) : null
    }
    return adoSshV3(user, host, segs)
  }

  let parts: URL
  try {
    parts = new URL(url)
  } catch {
    return null
  }
  // WHATWG lowercases the host only for "special" schemes; ssh:// is not one, so do it here.
  const host = parts.hostname.toLowerCase()
  // Python's urlsplit reports username '' (not None) for `https://@host/…`; URL cannot tell
  // the two apart, so userinfo presence is read off the authority text itself.
  const authority = afterScheme.split('/', 1)[0] ?? ''
  const user: string | null = authority.includes('@') ? decodeSegment(parts.username) : null
  const segs = segments(parts.pathname)
  if (!host || segs.length === 0) return null

  if (host === 'github.com') {
    return segs.length === 2 ? github(segs[0]!, segs[1]!) : null
  }

  if (host === 'dev.azure.com') {
    if (segs.length !== 4 || segs[2]!.toLowerCase() !== '_git') return null
    // `{org}@dev.azure.com/{other}/…` is not a URL az would accept either.
    if (user !== null && user.toLowerCase() !== segs[0]!.toLowerCase()) return null
    return ado(segs[0]!, segs[1]!, segs[3]!, `https://dev.azure.com/${segs[0]}`)
  }

  if (host === 'ssh.dev.azure.com' || host === 'vs-ssh.visualstudio.com') {
    return adoSshV3(user ?? '', host, segs)
  }

  if (host.endsWith('.visualstudio.com')) {
    const label = host.slice(0, -'.visualstudio.com'.length)
    if (!label || label === 'vs-ssh' || user !== null) return null
    if (segs.length < 3 || segs[segs.length - 2]!.toLowerCase() !== '_git') return null
    return ado(label, segs[segs.length - 3]!, segs[segs.length - 1]!, `https://${label}.visualstudio.com/`)
  }

  return null
}

/** The host part of a remote nobody recognised, for the "unrecognised host" detail — the same
 * expression Python uses, so the two sides print the same word. */
export function remoteHostName(url: string): string {
  if (url.includes('://')) {
    const authority = url.slice(url.indexOf('://') + 3).split('/', 1)[0] ?? ''
    return authority.split('@').pop() ?? ''
  }
  return url.split(':', 1)[0] ?? ''
}
