"""Remote URL → code host, the pure half of detection (code-host providers, Wave 1).

The rule mirrors the azure-devops extension's own `common/uri.py`, so the provider can pass
`--detect false --org --project --repository` from the parsed remote and skip az's
`GET …/vsts/info` round-trip (one network call per az invocation, and it needs auth).

Pure on purpose: the same fixture (`scripts/tests/fixtures/code_host/remote-urls.json`) drives
this function and Studio's TypeScript port, so the two cannot drift. Anything this does not
recognise — a GitHub Enterprise host, GitLab, Azure DevOps Server — is None; the caller reports
`host: none` with the reason, and `.sdlc/code-host.yaml` is the escape hatch.
"""

import re
from typing import NamedTuple
from urllib.parse import unquote, urlsplit


class RemoteInfo(NamedTuple):
    host: str              # github | azure-devops
    org: str
    project: str | None    # None on GitHub
    repo: str
    slug: str              # o/r on GitHub; org/project/repo on Azure DevOps
    org_url: str | None    # https://dev.azure.com/{org} or https://{org}.visualstudio.com/
    web_url: str


# scp-like `user@host:path` — the one shape urlsplit cannot read. No scheme, no `//`.
_SCP_RE = re.compile(r"^([^@/:]+)@([^@/:]+):(.+)$")


def _segments(path: str) -> list[str]:
    # URL-decode each segment: a project called "Claims%20Ops" must reach az as "Claims Ops".
    return [unquote(s) for s in path.strip("/").split("/") if s != ""]


def _github(org: str, repo: str) -> RemoteInfo:
    repo = repo[:-4] if repo.endswith(".git") else repo
    return RemoteInfo("github", org, None, repo, f"{org}/{repo}", None, f"https://github.com/{org}/{repo}")


def _ado(org: str, project: str, repo: str, org_url: str) -> RemoteInfo:
    web = f"{org_url.rstrip('/')}/{project}/_git/{repo}"
    return RemoteInfo("azure-devops", org, project, repo, f"{org}/{project}/{repo}", org_url, web)


def _ado_ssh_v3(user: str, host: str, segs: list[str]) -> RemoteInfo | None:
    """`v3/{org}/{project}/{repo}` on either ssh host. The user rule differs per host and is
    what the extension itself checks, so it is checked here too."""
    if len(segs) != 4 or segs[0] != "v3":
        return None
    org, project, repo = segs[1], segs[2], segs[3]
    if host == "ssh.dev.azure.com":
        return _ado(org, project, repo, f"https://dev.azure.com/{org}") if user == "git" else None
    if host == "vs-ssh.visualstudio.com":
        return _ado(org, project, repo, f"https://{org}.visualstudio.com/") if user.lower() == org.lower() else None
    return None


def parse_remote(url: str | None) -> RemoteInfo | None:
    """Which host a remote URL points at, and the parts az/gh need — or None when it is neither
    GitHub nor Azure DevOps (Services). Never raises on garbage; garbage is just None."""
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    if any(ch in url for ch in "\r\n\t\\") or "//" in url.split("://", 1)[-1]:
        return None

    scp = _SCP_RE.match(url) if "://" not in url else None
    if scp:
        user, host, path = scp.group(1), scp.group(2).lower(), scp.group(3)
        segs = _segments(path)
        if host == "github.com":
            return _github(segs[0], segs[1]) if user == "git" and len(segs) == 2 else None
        return _ado_ssh_v3(user, host, segs)

    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    host = (parts.hostname or "").lower()
    user = parts.username
    segs = _segments(parts.path)
    if not host or not segs:
        return None

    if host == "github.com":
        return _github(segs[0], segs[1]) if len(segs) == 2 else None

    if host == "dev.azure.com":
        if len(segs) != 4 or segs[2].lower() != "_git":
            return None
        if user is not None and user.lower() != segs[0].lower():
            return None  # `{org}@dev.azure.com/{other}/…` is not a URL az would accept either
        return _ado(segs[0], segs[1], segs[3], f"https://dev.azure.com/{segs[0]}")

    if host in ("ssh.dev.azure.com", "vs-ssh.visualstudio.com"):
        return _ado_ssh_v3(user or "", host, segs)

    if host.endswith(".visualstudio.com"):
        label = host[: -len(".visualstudio.com")]
        if not label or label == "vs-ssh" or user is not None:
            return None
        if len(segs) < 3 or segs[-2].lower() != "_git":
            return None
        return _ado(label, segs[-3], segs[-1], f"https://{label}.visualstudio.com/")

    return None
