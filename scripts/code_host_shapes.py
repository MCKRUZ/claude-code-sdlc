"""The normalised code-host shapes and the provider contract (code-host providers, Wave 1).

The gh JSON dicts the plugin already reads ARE the normalised shapes — `spec_status`,
`pipeline_proof_model`, `github_import.map_*` and some sixty tests speak that vocabulary, so a
second host translates INTO it rather than everyone learning a neutral one. Writing the shapes
down as TypedDicts turns folklore into a contract: a reader can see exactly which keys a
normaliser must produce, and `test_provider_parity.py` pins the function names and signatures.

Kept in its own module so `code_host.py` (detection, CLI state) stays under the file-size house
limit and so `ado_map.py` can import the shapes without pulling in detection or subprocess.
"""

from typing import TypedDict


class Identity(TypedDict, total=False):
    login: str          # gh login, or the Azure DevOps UPN
    kind: str           # "login" | "upn"
    email: str | None
    name: str | None
    id: str | None
    handle: str | None  # roster handle — filled only by code_host.resolve_person(), never guessed


class Check(TypedDict, total=False):
    name: str
    status: str                 # IN_PROGRESS | COMPLETED
    conclusion: str | None      # SUCCESS | FAILURE | NEUTRAL | SKIPPED | None
    blocking: bool | None       # gh: None (the rollup does not say); ADO: configuration.isBlocking
    _note: str                  # only when an unknown enum was mapped conservatively


class Review(TypedDict, total=False):
    state: str                  # APPROVED | CHANGES_REQUESTED | COMMENTED
    author: dict                # {login, handle?}
    submittedAt: str | None     # None on ADO (votes carry no time)


class ReviewRequest(TypedDict, total=False):
    login: str
    name: str | None
    handle: str | None


class PullRequest(TypedDict, total=False):
    number: int
    url: str | None
    state: str                  # OPEN | MERGED | CLOSED
    isDraft: bool
    headRefName: str
    mergedAt: str | None
    updatedAt: str | None       # None on ADO — GitPullRequest has no such field
    createdAt: str | None
    author: dict                # {login, handle?}
    statusCheckRollup: list     # Check[]
    reviews: list               # Review[]
    reviewRequests: list        # ReviewRequest[]
    labels: list                # [{name}]
    mergeCommit: dict | None    # {oid}
    reviewDecision: str         # APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED
    headRepositoryOwner: dict   # {login} — the repository GUID on ADO (fork check)
    files: list | None          # None when iterations were not fetched
    _notes: list
    _checks_unavailable: bool


class Run(TypedDict, total=False):
    databaseId: int
    conclusion: str | None      # success | failure | cancelled | None
    status: str                 # completed | in_progress
    event: str                  # pull_request | push | <raw reason>
    headBranch: str
    createdAt: str | None
    url: str | None


class Job(TypedDict, total=False):
    name: str
    conclusion: str | None


class Ruleset(TypedDict, total=False):
    id: int | str | None
    name: str
    target: str
    enforcement: str            # active | disabled
    created_at: str | None      # None on ADO — no enforcement-start semantics
    rules: list
    bypass_actors: list


class RepoView(TypedDict, total=False):
    nameWithOwner: str
    id: str | None
    defaultBranch: str | None
    webUrl: str | None
    project: dict | None
    isFork: bool | None
    viewerPermission: str | None  # None on ADO — no cheap permission probe


# One row per operation. `github` names the unchanged GitHub-side function whose signature the
# ADO twin must match exactly; None means GitHub has no standalone function today (the call is
# inline in a consumer), in which case `signature` is the documented contract and the parity
# test compares against that string instead.
PROVIDER_FUNCTIONS: tuple[dict, ...] = (
    {"name": "whoami", "github": None, "signature": "(repo_root) -> dict",
     "returns": "Identity"},
    {"name": "repo_view", "github": None, "signature": "(repo_root) -> dict",
     "returns": "RepoView"},
    {"name": "find_pr_for_branch", "github": "spec_status.find_pr_for_branch",
     "signature": "(repo_root, branch_name: str) -> dict | None", "returns": "PullRequest | None"},
    {"name": "fetch_pr_comment_bodies", "github": "spec_status.fetch_pr_comment_bodies",
     "signature": "(repo_root, pr_number: int) -> list[str]", "returns": "bodies, oldest first"},
    {"name": "fetch_pr_events", "github": "github_import.fetch_pr_events",
     "signature": "(repo_root: str, number: int) -> list[dict]", "returns": "gh issue events"},
    {"name": "fetch_all_pull_requests", "github": "spec_status.fetch_all_pull_requests",
     "signature": "(repo_root, limit: int = 1000) -> dict[str, dict]", "returns": "by head branch"},
    {"name": "fetch_pr_checks", "github": None, "signature": "(repo_root, pr_number: int) -> list[dict]",
     "returns": "Check[]"},
    {"name": "fetch_branch_policies", "github": "pipeline_proof._read_ruleset",
     "signature": "(cwd: str, nwo: str, installed_name: str | None) -> dict | None",
     "returns": "Ruleset | None"},
    {"name": "create_draft_pr", "github": "handoff.assign_on_host",
     "signature": "(repo_root, branch_name: str, base_branch: str, spec_id: str, spec_name: str, "
                  "developer: str, checker: str) -> str",
     "returns": "web URL"},
    {"name": "complete_pr", "github": None, "signature": "(repo_root, pr_number: int) -> str",
     "returns": "web URL"},
    {"name": "fetch_runs", "github": "pipeline_proof._fetch_runs",
     "signature": "(cwd: str, workflow_file: str, limit: int) -> list[dict]", "returns": "Run[]"},
    {"name": "run_jobs", "github": None, "signature": "(cwd: str, run_id: int) -> dict",
     "returns": "{jobs: Job[]}"},
    {"name": "secret_names", "github": None, "signature": "(repo_root) -> list[str]",
     "returns": "variable names the pipelines can read"},
)

PROVIDER_FUNCTION_NAMES: tuple[str, ...] = tuple(f["name"] for f in PROVIDER_FUNCTIONS)
