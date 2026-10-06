# Code-host providers — GitHub (`gh`) and Azure DevOps (`az`), chosen by the repository

> **Name:** "Studio" below is the desktop app, shipped as **Tōgō** since 2026-10-05; paths (`studio/`) and the `window.studio` bridge are unchanged.

Repo: `claude-code-sdlc` at `acab7cf`. Status: **master design** (merges the two candidate designs; see Appendix A for how they were judged).
Method: local reads only — source, tests, `git remote -v`, and `az <cmd> --help` (azure-devops extension 1.0.8). Nothing reached a network or a code host.
Legend: every `az` **argument** below was read from local help text; every `az`/REST **output field name or enum value** is **(unverified)** until Wave 0 captures it from a real organisation. Anything else marked (unverified) is stated as such.

Owner constraint (relayed): the code lives in Azure DevOps repositories today; the plugin and SDLC Studio must stay compatible with **both** `gh` and `az`, with the host **chosen by the repository**, not by a global setting.

---

## 0. In three lines

| | |
|---|---|
| **What** | One host-detection rule (`origin` remote → `github` / `azure-devops` / `none`) and one `az` module (`scripts/ado_import.py`) that returns the **same dict shapes `gh` returns today**, so every pure model, every honesty path and every existing test keeps working untouched; Studio gets the same thing as a small TypeScript provider interface. |
| **Why this shape** | The additive rule is binary, not a score: `scorecard.py` is frozen on `github_import.collect_events` / `GitHubImportError` / the `gh_id` key, and ~30 existing tests patch `ss.gh_json`, `h.run_gh`, `cr._gh`, `github_import.run_gh` by name. Dispatching **at the existing call sites** keeps all of that byte-identical; a new interface class in front of the scripts would not. |
| **What it costs** | Two new Python modules, one new importer, one roster field (`email`), a per-repo override file, five scripts gaining an `if host == "azure-devops"` branch, and in Studio one provider interface plus a softer tooling gate. ADO latency (1–2 s per `az` call) is budgeted, never hidden. |

---

## 1. Decision record

| # | Decision | Status | What it fixes in this design |
|---|---|---|---|
| **D4** (studio-improvements §4, reframed) | "Soft-require `gh`" becomes **"a code-host *provider* is resolved per repository; Studio soft-requires the detected host's CLI with per-feature disabled reasons"** | **Decided** | `App.tsx:90` `allFound` drops `gh`; neither `gh` nor `az` can block opening a project; `ToolingIssues` lists both CLIs as *optional* and marks the one the repository does not use as "not needed for this project"; every host-backed control shows a reason string from one helper (§7) |
| **D5** (studio-improvements §4) | Write verbs' `--by` / `--actor` / `--declared-by` / `signedBy` = the signed-in account | **Inherited unchanged** | On ADO the signed-in account is the UPN from `az account show`; it is resolved to a roster `@handle` when `people[].email` matches, else the UPN itself is the actor. The renderer stays untrusted — the main process computes it (§6) |
| **D6** (new) | **ADO read-back: yes.** Azure DevOps is not only a write target (hand-off PR, Studio save fallback) but a **read-back source**: board live status, spec status, connection report, branch policies, pipeline evidence, and scorecard outcomes are read from ADO exactly as they are read from GitHub today | **Decided yes** | Every read path in §5 has an ADO branch; honesty rules in §8 say what is shown when a value does not exist on ADO (`updatedAt`, vote time, request time, `viewerPermission`) |
| O1 | Host chosen by the repository, never globally | Owner input | Detection keys off `origin`; the only persistent override is a file in the repo (`.sdlc/code-host.yaml`) |
| O2 | Two independent axes: **code host** (PRs, identity, policies — from the remote) and **CI platform** (pipelines dir, runs, secrets — from `.claude/harness-manifest.json` via `doctor.installed_platform()` semantics) | Design decision | GitHub repo + Azure Pipelines and the reverse both work; a mismatch is *reported*, never silently resolved |
| O3 | Protected core byte-for-byte unchanged: `scorecard.py`, `generate_status.py`, `check_gates.py`, `check_spec.py`, `advance_phase.py`, `phase_model.py`, `new_spec.py`, `harness/**`, `section-evaluator`, `/sdlc-coach`, `/sdlc-spec`; `sprint.py` text output and exit codes unchanged; `doctor.py` text goldens unchanged | Owner rule | ADO scorecard import is a **new** script; `doctor.py` is not edited in the core waves |
| O4 | Existing GitHub behaviour **byte-identical** in output and argv; existing tests pass **unmodified** (the "additive guarantee" of `docs/proposals/ado-repo-support-matrix.md`) | Owner rule | Verified mechanically by a new argv-golden test and before/after text goldens (§10) — no existing test file is edited |
| O5 | Honesty: `unknown` / `null` / "no data" over a fabricated zero or a false `no`; unavailable ≠ absent | Owner rule | §8 |
| O6 | Standalone-or-workflow dual mode (CLAUDE.md design rule) | Owner rule | `code_host.py` takes `--repo` or `--state`; `--host` works with no `.sdlc/` present; every new script documents both modes |

---

## 2. Host detection & override

### 2.1 Two axes, two sources of truth

| Axis | Question | Source | Owner module | Values | Consumers |
|---|---|---|---|---|---|
| **Code host** (new) | Which CLI talks to the *repository*: PRs, reviewers, identity, branch policies | `git remote get-url origin` + overrides (§2.3) | `scripts/code_host.py` `detect_host()` | `github` / `azure-devops` / `none` | `spec_status`, `handoff`, `connection_report`, `gate_auth` (slug), `pipeline_proof` (PR list, policies), `import_outcomes`, Studio |
| **CI platform** (existing) | Where the *pipelines* live; which CLI reads runs and secrets | `.claude/harness-manifest.json` → `packs ∋ cicd/azure-devops` | `code_host.installed_ci_platform()` — a 10-line twin of `doctor.installed_platform()` with a test asserting the two agree on doctor's six manifest cases (`doctor.py` itself is not imported: it would drag the whole diagnostic module in) | `github` / `azure-devops` | `gate_inventory` (pipelines dir), `pipeline_proof` (pipelines dir, run reads, ruleset path), `connection_report` (`checks_installed`), `gate_auth` (secrets model) |

The two axes are **never merged into one value**. `connection_report --json` reports both side by side (`host`, `ci_platform`) and emits an informational `note` when they disagree ("remote is on GitHub but the installed CI pack is Azure Pipelines"); nothing fails on a mismatch.

### 2.2 Remote → host rule (pure, shared fixture)

`code_host.parse_remote(url) -> RemoteInfo | None` with `RemoteInfo(host, org, project, repo, slug, org_url, web_url)`. The rule mirrors the azure-devops extension's own `common/uri.py` so the provider can pass `--detect false --org --project --repository` and skip az's `vsts/info` round-trip.

| Remote shape (`origin`) | Host | Parsed | Rule |
|---|---|---|---|
| `https://github.com/{o}/{r}(.git)`, `git@github.com:{o}/{r}(.git)`, `ssh://git@github.com/{o}/{r}` | `github` | `org=o, repo=r, slug=o/r` | host exactly `github.com` |
| `https://{ghe-host}/…` (not `github.com`) | `none` | — | GHES/GitLab out of scope; `.sdlc/code-host.yaml` is the escape hatch |
| `https://dev.azure.com/{org}/{project}/_git/{repo}` | `azure-devops` | `org, project, repo, slug=org/project/repo, org_url=https://dev.azure.com/{org}` | exactly 4 path segments, seg[2] == `_git` (case-insensitive); segments URL-decoded |
| `https://{org}@dev.azure.com/{org}/{project}/_git/{repo}` | `azure-devops` | same | userinfo must equal seg[0] (case-insensitive) or → `none` |
| `https://{org}.visualstudio.com/{project}/_git/{repo}`, `…/DefaultCollection/{project}/_git/{repo}` | `azure-devops` | `org_url=https://{org}.visualstudio.com/` | host endswith `.visualstudio.com`, label ≠ `vs-ssh`, seg[-2] == `_git`, no userinfo |
| `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`, `ssh://git@ssh.dev.azure.com/v3/…` | `azure-devops` | `org_url=https://dev.azure.com/{org}` | user `git`, seg[0] == `v3`, 4 segments |
| `{org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}` | `azure-devops` | `org_url=https://{org}.visualstudio.com/` | user must equal org |
| anything else / no `origin` / git unavailable | `none` | — | `detail` says why (`no origin remote`, `unrecognised host "x"`) |

The fixture lives **once** at `scripts/tests/fixtures/code_host/remote-urls.json` (`[{url, host, org, project, repo, slug, org_url}]`) and is consumed by pytest (`test_code_host.py`) **and** vitest (`studio/test/codeHostModel.test.ts`), so the Python and TypeScript ports cannot drift.

### 2.3 Override precedence (`code_host.detect_host(repo_root, override=None) -> Detection(host, source, remote, detail)`)

| # | Source | `source` tag | Scope | Reaches plugin scripts Studio runs? | Works with no `.sdlc/`? | In |
|---|---|---|---|---|---|---|
| 1 | `--host github\|azure-devops\|none` flag on every host-touching script | `flag` | one invocation | yes (Studio may pass it) | yes | **Yes** — explicit, testable, dual-mode |
| 2 | env `SDLC_CODE_HOST` | `env` | process tree | yes (`runPluginScript` inherits `process.env`) | yes | **Yes** — CI and tests |
| 3 | `.sdlc/code-host.yaml` → `host:` (+ optional `organization`, `project`, `repository` for an unparseable remote) | `file` | the repository (travels with the clone) | yes | no | **Yes** — the per-repo persistent override O1 implies; written by `set_setting.py code-host --host …`; validated like the other `.sdlc/*.yaml` singletons; never in `state.yaml` (`advance_phase.py` is protected) |
| 4 | `git remote get-url origin` → §2.2 | `remote` | the repository | yes | yes | **Default path** |
| 5 | `.claude/harness-manifest.json` packs (CI axis) | `manifest` | the install | yes | no | **Tie-breaker only** when there is no usable remote (fresh clone without `origin`): `cicd/azure-devops` → `azure-devops`, else falls to 6. Never overrides a parsed remote |
| 6 | none of the above | `default` | — | — | — | `host: none` (§2.4) |
| — | profile field (`stack.ci_cd.platform` or a new field) | — | frozen per project | — | — | **No** — the profile describes the CI pack that composes; the host is a property of the clone; reusing `ci_cd.platform` would make GitHub + Azure Pipelines impossible |
| — | Studio `Settings.codeHostOverride` | — | this machine | **no** (`ghPathOverride` already does not reach scripts) | — | **No** as an override store — Studio's Settings screen edits the repo file through `set_setting.py code-host` (renderer never writes files; main process shells out, as it does for `person`/`limit`/`approval`) |

Every `--json` output that depends on the host carries a top-level `host` block (`{name, source, cli, cli_state, detail}`) so a reader can see *why* a host was chosen.

### 2.4 `host == none`

| Option | Behaviour | Existing tests | Verdict |
|---|---|---|---|
| **A — fall through to `gh`** (legacy default) | `cli_for("none") == "gh"`; the gh error becomes today's `code_host_available: false` detail; JSON says `host: none, source: default` | **All unmodified** — they run in `tmp_path` repos with no remote and monkeypatch `gh_json` / `run_gh` | **Chosen.** Zero behaviour change for every repo that exists today; Studio labels it "unrecognised remote — tried gh" |
| B — report unavailable without calling anything | `code_host_available: false`, "origin is not GitHub or Azure DevOps" | `test_spec_status`, `test_pipeline_proof`, `test_handoff` would need a fake remote → edits existing tests | Rejected (breaks O4) |

---

## 3. Provider interface & normalised shapes

### 3.1 The seam in one picture

| Layer | GitHub | Azure DevOps | Shared |
|---|---|---|---|
| Transport | `github_import.run_gh / gh_json` — **unchanged** | `ado_import.run_az(args, cwd, timeout=60) / az_json(args, cwd)` — same contract: UTF-8 forced, 60 s timeout, `shutil.which("az")` (PATHEXT → `az.cmd`), env `AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no` + `AZURE_CORE_COLLECT_TELEMETRY=no`, always appends `--only-show-errors`, `az_json` adds `-o json` | `code_host.cli_for(host)`, `code_host.cli_state(host) -> available \| not_installed \| extension_missing \| signed_out \| unknown` |
| Error type | `github_import.GitHubImportError` — **unchanged** | `ado_import.AdoImportError(GitHubImportError)` — a **subclass**, so every existing `except GitHubImportError` (incl. frozen `scorecard.py:309`) catches az failures with no edits | `code_host.CodeHostError = GitHubImportError` alias for new code to read naturally |
| Fetchers (impure) | existing names in `github_import`, `spec_status`, `pipeline_proof`, `connection_report`, `gate_auth` | **same names, same signatures, same return shapes** in `ado_import` (one function per gh call site) | each script dispatches at its call site: `_host_fn("find_pr_for_branch")` → `ado_import.find_pr_for_branch` when `host == "azure-devops"`, else the module's own function. Existing monkeypatch targets (`ss.gh_json`, `h.run_gh`, `cr._gh`, `github_import.run_gh`, `ga.subprocess.run`) keep intercepting the GitHub path |
| Normalisers (pure) | — (gh JSON *is* the shape) | `ado_import.map_pr`, `map_checks`, `map_reviews`, `map_runs`, `map_jobs`, `map_policies`, `map_threads` — ADO JSON in, gh-shaped dict out; fixture-tested | the gh dict shapes **are** the normalised shape, written down as TypedDicts in `code_host.py` (§3.3) so they are a documented contract, not folklore |
| Mapping to events/ladders (pure) | `github_import.map_*`, `spec_status.compute_waiting_on`, `waiting_on_handle`, `pipeline_proof_model.*`, `parse_verdict_block` | **none duplicated** — fed the normalised dicts | unchanged |
| Contract pin | — | — | `test_provider_parity.py`: for every name in `code_host.PROVIDER_FUNCTIONS`, `ado_import` exposes it with the same `inspect.signature` as the GitHub-side function it mirrors |

No class hierarchy and no registry on the Python side — "provider interface" is a documented set of names, signatures and return shapes, pinned by a test. Studio, where a TypeScript interface is natural and no existing test pins the `gh` argv seams, gets a real `CodeHost` interface (§7).

### 3.2 `PROVIDER_FUNCTIONS` — one row per operation

| Function (signature) | GitHub implementation (today, unchanged) | ADO implementation (`ado_import`) | Returns | Consumers |
|---|---|---|---|---|
| `whoami(repo_root) -> Identity` | new thin wrapper over `gh api user --jq .login` (only `connection_report` / Studio need it; the plugin's existing C1 call stays as is) | `account show -o json` (local read of the cached profile — **no network**) → `{login: user.name (UPN), kind: "upn"}`; PAT-only session → `AdoImportError("signed in with a PAT only; identity unavailable — run az login")` | `Identity{login, kind: login\|upn, email?, name?, handle?}` | `connection_report.check_signed_in`, Studio actor |
| `repo_view(repo_root) -> dict` | `gh repo view --json nameWithOwner,owner,viewerPermission` | parsed remote (no call) + `repos show --repository R --project P --org U --detect false` → `{nameWithOwner: "org/project/repo", id, defaultBranch, webUrl, project:{id,name}, isFork}` **(fields unverified)** | repo dict | `connection_report`, `pipeline_proof` P1, Studio `repoOwner` |
| `find_pr_for_branch(repo_root, branch) -> dict\|None` | S1 `gh pr list --head B --state all --json …` | `repos pr list --source-branch B --status all --top 5` → newest (max `pullRequestId`); then `repos pr policy list --id N` folded in as `statusCheckRollup` **only when `status == active`** | PR view (§3.3) | `spec_status.report_status`, Studio poller |
| `fetch_pr_comment_bodies(repo_root, n) -> list[str]` | S2 `gh pr view N --json comments` | `devops invoke --area git --resource pullRequestThreads --route-parameters project= repositoryId= pullRequestId= --api-version 7.1` → `value[].comments[].content`, skipping `commentType == system` and `isDeleted` **(unverified)** | bodies, oldest→newest | `spec_status.find_grader_verdicts`, `pipeline_proof._grader_verdicts` (`parse_verdict_block` reused verbatim — the ADO grader posts the same heading via `post-pr-thread.sh`) |
| `fetch_pr_events(repo_root, n) -> list[dict]` | I3 `gh api …/issues/N/events --paginate` | same threads call (per-process cache keyed `(repo_root, n)`); system comments matching "added … as a reviewer" **(wording unverified)** → `[{event:"review_requested", created_at: publishedDate}]`; when not derivable → `[]` | gh issue-event shape | `spec_status._pending_reviewer_wait` (already tolerates `(who, None)` → age omitted), `ado_outcomes` review-wait |
| `fetch_all_pull_requests(repo_root, limit=1000) -> dict[branch, PR view]` | S4 `gh pr list --state all --limit 1000 --json …` | `repos pr list --status all --top 1000` (+ `--skip` pages) with a `--query` projection; `repos pr policy list --id` for **active, non-draft** PRs only, `ThreadPool(6)`, cap `ADO_CHECKS_MAX = 40` (rows past the cap carry `_checks_unavailable: True`) | keyed by stripped `sourceRefName` | `spec_status.report_all` (board) |
| `fetch_pr_checks(repo_root, n) -> list[dict]` | (part of `statusCheckRollup`, no call) | `repos pr policy list --id N` → records whose `configuration.type.id` is Build validation `0609b952-1397-4640-95ec-e00a01b2c241` (verified GUID) or Status check `cbdc66da-9728-4af8-aada-9a5a32e4a226` (unverified) → §4.2 mapping | `[{name, status, conclusion, blocking}]` | folded into PR views |
| `fetch_branch_policies(repo_root, branch) -> dict` | P5/P6 `gh api repos/{nwo}/rulesets`, `…/rulesets/{id}` | `repos policy list --project P --repository-id <id> --branch <default>` (scoped; project-wide listing counts sibling repos) → gh ruleset shape `{enforcement: "active" if any isEnabled && isBlocking else "disabled", created_at: None, rules:[{type:"required_status_checks", parameters:{required_status_checks:[{context: settings.displayName}]}}], bypass_actors: []}` | ruleset dict | `connection_report.check_branch_protected`, `pipeline_proof_model.compare_ruleset` (unchanged), Studio `branchProtected` |
| `create_draft_pr(repo_root, base, head, title, body, developer, checker) -> str` | H1 `gh pr create --draft … --assignee D [--reviewer C]` → URL | `repos pr create --detect false --org --project --repository --source-branch H --target-branch B --title T --description <line>… --draft true [--required-reviewers <checker email>] -o json --query pullRequestId` → URL built `{org_url}/{project}/_git/{repo}/pullrequest/{id}`; **no assignee on ADO** — the developer is recorded in the description (D-OWNER-3) | web URL | `handoff.assign_on_host`, Studio `save` fallback |
| `complete_pr(repo_root, n) -> str` | `gh pr merge N --merge` (Studio only) | `repos pr update --id N --status completed` (fails closed when a blocking policy is unmet or `mergeStatus == conflicts`) | URL | Studio poller |
| `fetch_runs(repo_root, pipeline_file, limit) -> list[dict]` | P3 `gh run list --workflow F --limit N --json …` | `pipelines list --project P --repository R --repository-type tfsgit` once (cached) → match definition whose YAML path ends with `.azuredevops/pipelines/<file>` (`process.yamlFilename` **unverified**; fall back to `name` == file stem) → `pipelines runs list --pipeline-ids ID --top N --query-order QueueTimeDesc` → §4.3 mapping | gh run shape | `pipeline_proof._fetch_runs` → `pipeline_proof_model.classify_rail` (unchanged) |
| `run_jobs(repo_root, run_id) -> dict` | P4 `gh run view ID --json jobs` | `devops invoke --area build --resource timeline --route-parameters project= buildId= --api-version 7.1` → `records[type == "Job"]` → `{jobs:[{name, conclusion}]}` **(unverified)** | jobs dict | `pipeline_proof._deploy_rollbacks` |
| `secret_names(repo_root) -> list[str]` | G1 `gh secret list --json name --repo slug` | `pipelines variable-group list` (as doctor) → for each group the pipelines reference (`- group: NAME` in `.azuredevops/pipelines/*.yml`): `pipelines variable-group variable list --group-id <id>` (argv verified) → variable names | names | `gate_auth status` |
| `set_secret / delete_secret` | G2/G3 | **not in this plan** — `gate_auth set/clear` on ADO refuse with `kind: unsupported_host` and print the exact manual command (`az pipelines variable-group variable create --group-id <id> --name <NAME> --secret true` — value prompted, never on argv) | — | `gate_auth` (D-OWNER-6) |
| `merged_prs(repo_root, since)`, `pr_commit_dates`, `deployments`, `deployment_statuses`, `incidents` | I1–I6 in `github_import` (unchanged) | in `ado_outcomes.py` (§5) | gh shapes | `import_outcomes` |

### 3.3 Normalised shapes (TypedDicts in `code_host.py`; gh vocabulary by design)

| Shape | Fields | ADO notes |
|---|---|---|
| `Identity` | `login` (gh login / ADO UPN), `kind: "login"\|"upn"`, `email?`, `name?`, `id?`, `handle?` (roster-resolved `@x` or `None`) | `handle` is filled only by `code_host.resolve_person()`; providers never guess |
| `PullRequest` | `number, url, state (OPEN\|MERGED\|CLOSED), isDraft, headRefName, mergedAt, updatedAt\|None, createdAt, author:{login}, statusCheckRollup[], reviews[{state, author:{login}, submittedAt\|None}], reviewRequests[{login}], labels[{name}], mergeCommit{oid}\|None, reviewDecision, headRepositoryOwner{login}, files[{path}]\|None, _notes[], _checks_unavailable?` | `state`: `active→OPEN`, `completed→MERGED`, `abandoned→CLOSED`, other → `OPEN` + note; `updatedAt = None` (no field on `GitPullRequest`); `headRepositoryOwner.login` = repository GUID (fork check); `files = None` when iterations were not fetched |
| `Check` | `name, status (IN_PROGRESS\|COMPLETED), conclusion (SUCCESS\|FAILURE\|NEUTRAL\|SKIPPED\|None), blocking: bool\|None` | gh `blocking = None` (rollup does not say); ADO from `configuration.isBlocking` |
| `Run` | `databaseId, conclusion, status, event, headBranch, createdAt, url` | §4.3 |
| `Job`, `Ruleset`, `RepoView`, `Deployment`, `DeploymentStatus`, `Incident` | as consumed today by `pipeline_proof_model` / `github_import.map_*` | — |

Why gh vocabulary and not neutral names: the pure models, Studio's `PrListEntry`, and ~60 existing tests already speak it; ADO is the single translator. Neutral names buy nothing until a third host appears.

---

## 4. Azure DevOps mapping

### 4.1 Argv per operation (arguments verified from local `--help`; outputs verified against the 2026-10-05 capture — `scripts/tests/fixtures/code_host/azure_devops/captured/CAPTURE-NOTES.md` — except where a row still says unverified)

| Operation | `az` argv | Output used | Calls |
|---|---|---|---|
| Who am I | `az account show -o json --query "{user:user.name,tenant:tenantId}"` | `user.name` (UPN) — local, no network (verified). The CLI's **default account decides the ADO token**: a guest in the org's tenant needs `az login --allow-no-subscriptions --tenant <id>`, and an identity that never opened the org in a browser gets HTTP 403 "Identity … has not been materialized" (both verified; `cli_state` detail names both) | 1 |
| Display name (optional, `connection_report` detail only) | `az devops user show --user <upn> --org <orgUrl> -o json` | `user.{principalName,mailAddress,displayName}` — **may be Access Denied** (needs "ReadExtended Users"; verified on a contractor identity), so the lookup is optional and silent | 1 |
| Repo record | `az repos show --repository R --project P --org U --detect false -o json` | `id, name, defaultBranch, project.{id,name}, webUrl, isFork` | 1 |
| PR for branch | `az repos pr list --repository R --project P --org U --detect false --source-branch B --status all --top 5 -o json` | `GitPullRequest[]` | 1 |
| All PRs (board) | `… pr list … --status all --top 1000 [--skip K] -o json --query "[].{pullRequestId:pullRequestId,status:status,isDraft:isDraft,sourceRefName:sourceRefName,creationDate:creationDate,closedDate:closedDate,createdBy:createdBy.uniqueName,reviewers:reviewers,labels:labels,lastMergeCommit:lastMergeCommit.commitId,repository:repository.id}"` | projected list | 1 per 1000 |
| Checks for a PR | `az repos pr policy list --id N --org U -o json` | `PolicyEvaluationRecord[]` | 1 per active PR |
| Comment bodies | `az devops invoke --area git --resource pullRequestThreads --route-parameters project=P repositoryId=<id> pullRequestId=N --api-version 7.1 --org U -o json` | `value[].comments[].{content,commentType,isDeleted,publishedDate,author}` | 1 (+2 HTTP for area discovery, cached per process) |
| Reviewers only | `az repos pr reviewer list --id N --org U -o json` | `reviewers[]` (already on the PR object — used only when the projection dropped it) | 1 |
| Create draft PR | `az repos pr create --detect false --org U --project P --repository R --source-branch H --target-branch B --title T --description L1 L2 … --draft true [--required-reviewers <email>] -o json --query pullRequestId` | id → web URL | 1 |
| Complete PR | `az repos pr update --id N --org U --status completed -o json` | `status` | 1 |
| Branch policies | `az repos policy list --project P --org U --repository-id <guid> --branch <default> -o json` | `PolicyConfiguration[]` | 1 (+1 `repos show` for the GUID) |
| Pipeline definitions | `az pipelines list --project P --org U --repository R --repository-type tfsgit -o json` | `id, name, path` — **no `process` key** (verified); the YAML path is only on `az pipelines show --project P --org U --id N -o json` → `process.yamlFilename` (verified), one `show` per definition, cached per process | 1 + 1 per definition, cached |
| Runs | `az pipelines runs list --project P --org U --pipeline-ids ID --top N --query-order QueueTimeDesc -o json` | `Build[]` | 1 per rail |
| Jobs (rollback) | `az devops invoke --area build --resource timeline --route-parameters project=P buildId=ID --api-version 7.1 -o json` | `records[]` | 1 |
| Variable groups / variables | `az pipelines variable-group list --org U --project P -o json`; `az pipelines variable-group variable list --group-id <id> --org U --project P -o json` | group names → variable names | 1 + groups |
| Merged PRs since | `… pr list --status completed --top 200 -o json` → client-side `closedDate >= since` | — | 1 |
| PR commits | `az devops invoke --area git --resource pullRequestCommits --route-parameters project=P repositoryId=<id> pullRequestId=N --api-version 7.1` (resource name verified) | `value[].committer.date` | 1 per merged PR |
| Deployment records | `az devops invoke --area distributedtask --resource environments …` then `--resource environmentdeploymentrecords --route-parameters project=P environmentId=E --api-version 7.1-preview` (names verified; the version must be exactly `7.1-preview` — `7.1-preview.1` crashes the extension with `could not convert string to float: '7.1.1'`) | `value[].{result,startTime,finishTime,owner.id}` | 2+ |
| Incidents | `az boards query --project P --org U --wiql "SELECT [System.Id],[System.CreatedDate],[Microsoft.VSTS.Common.ClosedDate],[System.State] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Bug' AND [System.Tags] CONTAINS 'incident' AND [System.CreatedDate] >= '<since>'" -o json` | `fields.*` — **empty stdout when nothing matches** (verified) → `[]`; the row shape itself is still unverified | 1 |

### 4.2 Enum and field mapping

| Concept | gh value (consumed today) | ADO source | Mapping |
|---|---|---|---|
| PR state | `OPEN` / `MERGED` / `CLOSED` | `status` ∈ `active` / `completed` / `abandoned` (`--status all` verified as a filter value) | `active→OPEN`, `completed→MERGED`, `abandoned→CLOSED`; `notSet`/other → `OPEN` + `_notes` |
| Merged at / merge SHA | `mergedAt`, `mergeCommit.oid` | `closedDate` **iff** `status == completed`; `lastMergeCommit.commitId` **iff** completed (on active PRs it is the trial merge — ignore) | — |
| Draft | `isDraft` | `isDraft` | — |
| Head branch | `headRefName` | `sourceRefName` (`refs/heads/x`) | strip `refs/heads/` |
| Author | `author.login` | `createdBy.uniqueName` (UPN) | §6 identity rule |
| Approval | `reviews[].state == APPROVED` | `reviewers[].vote` (verified ints: `approve`=10, `approve-with-suggestions`=5, `reset`=0, `wait-for-author`=-5, `reject`=-10); `isRequired` is `null` when not required and `true` when required — never `false` (verified) | `vote >= 5 → APPROVED`; `vote <= -5 → CHANGES_REQUESTED`; `isContainer` entries (groups) skipped; `uniqueName == createdBy.uniqueName` skipped (author's own vote is not a non-author approval); `submittedAt = None` |
| Review requested from | `reviewRequests[].login` | `reviewers[]` with `vote == 0`, `isRequired: true` first, author excluded | §6 |
| Review decision (merge history) | `reviewDecision` | derived | any `APPROVED` → `APPROVED`; any `CHANGES_REQUESTED` → `CHANGES_REQUESTED`; else `REVIEW_REQUIRED` |
| Check status / conclusion | `statusCheckRollup[].{status,conclusion}` with `COMPLETED` and `NON_TERMINAL_CONCLUSIONS = (None, SUCCESS, NEUTRAL, SKIPPED)` | `PolicyEvaluationRecord.status` ∈ `queued, running, approved, rejected, notApplicable, broken` (`approved`, `queued` verified; the others still unverified) | `queued/running → (IN_PROGRESS, None)`; `approved/notApplicable → (COMPLETED, SUCCESS)`; `rejected/broken → (COMPLETED, FAILURE)`; unknown value → `(COMPLETED, None)` + `_notes` (reads as pending-ish, never as green) |
| Check name | `statusCheckRollup[].name` (`grader`, `security-review`, …) | Build policy `configuration.settings.displayName` (= the `displayName`s in `harness/packs/cicd/azure-devops/branch-policies/policies.json`: `build-and-test`, `eval-gate`, `dependency-gate`, `grader`, `correctness-review`, `security-review`, `eval-regression`) else `context.buildDefinitionName`; Status policy `settings.statusName` | same vocabulary as GitHub job names — only the transport differs |
| Blocking | — | `configuration.isBlocking` | optional policies listed (gh lists optional checks too) but `blocking: false` |
| Labels | `labels[].name == "risk:high"` | `labels[].name` (included by default in `pr list` — verified; `null` when a PR has none) | same vocabulary (`pr-writer` SKILL already uses `risk:high` on ADO) |
| Branch protection | ruleset `enforcement == "active"` | `isEnabled && isBlocking` on any policy scoped to the branch | `enforcing`; `created_at = None` (no enforcement-start semantics → `merge_history.enforced_since: None`, an existing path) |
| Required contexts | `rules[].parameters.required_status_checks[].context` | Build/Status policy display names | — |
| Run conclusion | `conclusion` ∈ `success/failure/cancelled/…` | `result` ∈ `none, succeeded, partiallySucceeded, failed, canceled` (values from help) | `succeeded→success`, `failed→failure`, `partiallySucceeded→failure`, `canceled→cancelled`, `none→None` |
| Run status | `status == "completed"` | `status` ∈ `none, notStarted, inProgress, cancelling, postponed, completed` | `completed→completed`, else `in_progress` |
| Run event | `event` ∈ `pull_request`, `pull_request_target`, `push`, … | `reason` ∈ `manual, individualCI, batchedCI, schedule, pullRequest, …` | `pullRequest→pull_request`, `individualCI/batchedCI→push`, else the raw value |
| Run branch | `headBranch` | `sourceBranch` (`refs/heads/x` or `refs/pull/N/merge`) | strip `refs/heads/`; `refs/pull/N/merge → pull/N/merge` |
| Run id / url / time | `databaseId`, `url`, `createdAt` | `id`, `queueTime`; runs carry **no `_links`** (verified), so the web URL is built as `{org_url}/{project}/_build/results?buildId={id}` | — |
| Job | `jobs[].{name,conclusion}` | timeline `records[type=="Job"].{name,result}` | result mapping as runs |
| Deployment | `{id, sha, environment, created_at}` + statuses `state ∈ success/failure/error` | environment deployment records `{id, result, startTime, finishTime, owner.id}` (keys verified); SHA via `pipelines runs show --id owner.id --query sourceVersion` (verified) | `succeeded→success`, `failed→failure` (both verified); `abandoned→failure`, `succeededWithIssues→success` **(unverified)** |
| Incident | issue `createdAt`, `closedAt` | `fields."System.CreatedDate"`, `fields."Microsoft.VSTS.Common.ClosedDate"` | — |
| Who am I | `login` | `user.name` (UPN) | §6 |
| Permission | `viewerPermission` | **no cheap az verb** | `None` → `can_open_prs: unknown` |

### 4.3 Pitfalls (each has a mitigation that is part of the design, not a footnote)

| # | Pitfall | Observed / source | Mitigation |
|---|---|---|---|
| P1 | az **dynamic extension install**: a missing extension or a typo triggers an unprompted network install/upgrade (observed: 1.0.6→1.0.8 during the surface pass) | observed | env `AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no` on **every** spawn (Python and Studio); probe `az extension show --name azure-devops` once per process and fail with "run `az extension add --name azure-devops`" |
| P2 | Telemetry fork on every call | az default | env `AZURE_CORE_COLLECT_TELEMETRY=no` |
| P3 | stderr noise on success (preview/upgrade warnings) | `doctor.py` already uses `--only-show-errors` | always append `--only-show-errors` |
| P4 | `--detect` costs a `GET …/vsts/info` round-trip per call and needs auth | extension source | always `--detect false --org --project --repository` from the parsed remote |
| P5 | `az devops invoke --api-version` defaults to **5.0**, which predates Environments | help | always pass `--api-version`; invoke costs 2 extra HTTP (area + locations) → cache the location list per process; prefer native verbs |
| P6 | `az repos policy list` is **project-wide** without scoping | help; doctor's docstring caveat | always `--repository-id <guid> --branch <default>` |
| P7 | `lastMergeCommit` exists on active PRs (trial merge) | **verified** — present on every active PR captured | trust only when `status == completed` |
| P8 | Draft PRs do not trigger build-validation policies until published **(unverified — no draft PR in the capture)** | — | a draft row says "waiting for the branch to be marked ready for review" (existing pre-ladder rung) — no checks expected |
| P9 | `--description` takes one argument per line | help | split the body on `\n` into separate argv entries |
| P10 | Reviewer identity must be email/UPN/display name — `@handle` is a CLIError | help ("users or groups") | roster `email` (§6); missing → `assignment_error`, never a crash |
| P11 | PAT-only sessions have no `whoami` (`az account show` empty; `connectionData` not addressable via invoke) | extension source | `cli_state: signed_out`-like detail "signed in with a PAT only; identity unavailable"; Studio D-OWNER-5 |
| P12 | Windows: `az.cmd` shim → Studio's `cmd.exe /c` path refuses `& \| < > ^ % "` in args | `commandRunner.ts:122` | PR title/body sanitised on the shim path with a console note (D-OWNER-7); Python side unaffected (`subprocess` with `shutil.which` → `az.cmd` runs without `cmd /c`) |
| P13 | `az --version` is multi-line and slow (often > 5 s cold) | surface note (unverified timing) | Studio probe uses `az version -o json` (verified command) with a 15 s per-tool timeout |
| P14 | Startup ≈ 0.4 s warm; real commands 1–2 s | measured in-process | §9 budgets; batch; never per-PR loops over the whole backlog |
| P15 | ADO Server (on-prem) unsupported by the extension | extension source | detected as `none` with a clear detail |
| P16 | System-comment wording is not what the design assumed: a self-join reads "<Name> joined as a reviewer", never "added … as a reviewer" | **verified** | never parse prose — read the typed `properties` bag (`CodeReviewThreadType` ∈ `ReviewersUpdate`, `VoteUpdate`, `StatusUpdate`, `RefUpdate`; `CodeReviewReviewersUpdatedAddedIdentity`, `CodeReviewVoteResult`, …; values `{"$type", "$value"}`); `review_requested` = the `ReviewersUpdate` thread's `publishedDate` |
| P17 | `repos pr policy list` on an active PR whose target has no policies answers `[]` | **verified** | an empty list is "no checks", never "unknown" |
| P18 | The grader / security pipelines post a **text** comment opening with `<!-- rails-gate:<pipeline> -->` | **verified** | `parse_verdict_block` reads the comment `content` unchanged; the marker names the gate |

---

## 5. Per-script change table (plugin)

| Script | Status | Change | GitHub path | ADO path | Tests |
|---|---|---|---|---|---|
| `scripts/github_import.py` | **unchanged** | — | as today | — | unchanged |
| `scripts/scorecard.py` | **PROTECTED, unchanged** | — | `scorecard.py import` keeps working via `gi.collect_events` | `scorecard.py import` on an ADO repo raises `GitHubImportError` from gh → `Error: …` exit 1 (unchanged); `import_outcomes.py` is the host-neutral verb | unchanged |
| `scripts/code_host.py` | **new** | `parse_remote`, `detect_host`, `installed_ci_platform`, `cli_for`, `cli_state`, `resolve_person(roster, identity)`, `PROVIDER_FUNCTIONS`, TypedDicts, `CodeHostError` alias, CLI `--repo\|--state --host --json` printing `{host, source, remote, ci_platform, cli_state}` | — | — | `test_code_host.py` |
| `scripts/ado_import.py` | **new** | `run_az`, `az_json`, `AdoImportError`, `_scope()`, the §3.2 fetchers, pure `map_*` normalisers | — | all | `test_ado_import.py`, `test_provider_parity.py`, `test_az_contract.py` |
| `scripts/spec_status.py` | additive | `--host`; `_host_fn(name)` dispatch at `find_pr_for_branch` / `fetch_pr_comment_bodies` / `fetch_pr_events` / `fetch_all_pull_requests` call sites; `_reviewer_handle` prefers `handle` when present; `_spec_row` renders `waiting_on = "live checks not read for this row"` when `_checks_unavailable`; `host` block in JSON; text footer line `Code host: azure-devops (from origin)` **only** when host ≠ github (GitHub text byte-identical) | byte-identical | `code_host_available: false` + az detail on failure; `approvals[].at: null`; `updated_at: null` | additive `class TestOnAzureDevOps` in `test_spec_status.py`; existing classes untouched |
| `scripts/handoff.py` | additive | `--host`; `assign_on_host` dispatches to `ado_import.create_draft_pr`; checker email via `vt.email_for`; missing checker email → PR created without reviewer + `assignment_error` (non-fatal, today's semantics) | byte-identical (`TestAssignOnHost` pins `--draft --assignee sam-k --reviewer priya-n`) | `--draft true --required-reviewers <checker email>`; developer named in the description | additive class in `test_handoff.py` |
| `scripts/connection_report.py` | additive | `--host`; `_host_fn` for the four probes; `checks_installed` reads the CI-axis dirs; top-level `host`, `ci_platform`, `note`; **exactly six checks remain** (`TestNeverRaises` pins `len(checks) == 6`) | byte-identical | `can_open_prs: unknown` always; `branch_protected` from scoped policies | additive class |
| `scripts/gate_auth.py` | additive | `remote_slug` untouched for GitHub; ADO branch uses `code_host.parse_remote` → `(org, project, repo)`; `status` reads variable-group variables; `set`/`clear` refuse `kind: unsupported_host` (exit 1) with the manual command | byte-identical (`FakeGh` on `subprocess.run` unchanged) | status-only | additive class |
| `scripts/pipeline_proof.py` | additive | `--host`; CI-axis paths (`INSTALLED_RULESET`, pipelines dir) chosen by `installed_ci_platform`; `_fetch_runs` / `_read_ruleset` / P1 / P2 / P4 / P7 dispatch; rail `NO_DATA` "pipeline definition for `<file>` not found in Azure Pipelines" | byte-identical (`FakeGh` router pin unchanged) | `FakeAz` router added as the ADO read-only pin | additive class |
| `scripts/pipeline_proof_model.py` | **unchanged** | — | — | fed normalised dicts | unchanged |
| `scripts/gate_inventory.py` | additive | `INSTALLED_WORKFLOWS` becomes `installed_pipelines_dir(repo)` via `installed_ci_platform` (GitHub → `.github/workflows` as today); `NEVER_FIRED` reason text names the actual dir | byte-identical | `.azuredevops/pipelines` | additive test; `gi.PLAYBOOK_GUIDE` repoint pattern reused |
| `scripts/doctor.py` | **unchanged** (core waves) | optional later: WARN "remote host X ≠ installed CI pack Y" (goldens pinned; GitHub installs never trigger it) | — | — | — |
| `scripts/ado_outcomes.py` | **new** | ADO fetchers `fetch_merged_prs`, `fetch_pr_commits`, `fetch_pr_events`, `fetch_deployments`, `fetch_deployment_statuses`, `fetch_incident_issues` (same names as `github_import`) + `collect_events(repo_root, since)` that feeds **`github_import.map_*` verbatim**; `gh_id` values `ado-pr-merge:<id>`, `ado-pr-review:<id>`, `ado-deploy:<env>:<rec>`, `ado-wi:<id>` | — | all | `test_ado_outcomes.py` |
| `scripts/import_outcomes.py` | **new** | `--since YYYY-MM-DD` (required), `--repo\|--state`, `--host`, `--json`. `host == github` → **calls `scorecard.import_events(repo_root, events_path, since)` unchanged** (the frozen code path, literally). `host == azure-devops` → `ado_outcomes.collect_events` → dedup on `gh_id` against `scorecard.load_events()` → `scorecard.append_events()`. Output phrasing identical to `scorecard.py import`: `Imported: no data` / `Imported N event(s): …` / `Error: …` exit 1. Review-wait events with no request timestamp **omit the `wait_hours` key** (verified: `compute_scorecard` selects on `"wait_hours" in e`, and `_median` would choke on `None`) and the script prints `review_wait: N event(s) carry no wait time (Azure DevOps records no request timestamp)`; unsupported categories print `deploys: not imported (…)` rather than writing zeros | delegates | native | `test_import_outcomes.py` |
| `scripts/validate_team.py` | additive | `people[].email` optional: non-empty, contains `@`, no CR/LF, unique case-insensitively; helpers `people_by_email(roster) -> dict[lower_email, handle]`, `email_for(roster, handle) -> str\|None`; existing error strings untouched | as today | — | additive tests |
| `scripts/set_setting.py` | additive | `person --email` (optional; same targeted-edit / anti-smuggling path; `HANDLE_RE` unchanged); new verb `code-host --host github\|azure-devops\|none [--organization --project --repository]` writing `.sdlc/code-host.yaml` | as today | — | additive tests |
| `scripts/project_settings.py` | additive | roster section passes `email` through (it already passes `people` through — verify no code change is needed) | as today | — | additive assertion |
| `scripts/capabilities.py` | additive | entries `code-host` (`code_host.py`, flags `--json --repo --state --host`) and `import-outcomes` (`import_outcomes.py`, flags `--since --repo --state --host --json`) | — | — | `test_capabilities.py` additive assertion |
| `scripts/sprint.py` | **unchanged** | `--by/--to` stay free text through `require_human()`; text and exit codes untouched | — | — | — |
| `templates/team/_schema.yaml`, `team.example.yaml` | additive | `email` property (optional, documented pattern `^[^\s@]+@[^\s@]+$`); one worked example | — | — | — |

---

## 6. Identity model

### 6.1 One roster key, one optional host key

| Item | Rule |
|---|---|
| Roster key | `people[].handle` stays `^@[A-Za-z0-9-]+$` on **both** hosts; spec frontmatter `owner/team/checker/developer`, `check_spec.py` (protected), `handoff --developer`, `track_specs` by-team — all unchanged |
| Host key (new, optional) | `people[].email` — the sign-in identity on Azure DevOps (UPN or mail). Needed only when the repository is on ADO. Unique across the roster (case-insensitive) |
| Resolution | `code_host.resolve_person(roster, identity) -> str\|None`: GitHub → `@` + `login` if that handle is in `people_handles` else `None`; ADO → the handle whose `email` equals `identity.login` (case-insensitive) else `None` |
| Never | a provider guesses a handle from a display name or a UPN prefix |

### 6.2 Per consumer

| Consumer | GitHub (today, unchanged) | Azure DevOps | When unmapped |
|---|---|---|---|
| **`--by` / `--actor` / `--declared-by` / `signedBy`** (D5) | Studio `actor = login` | Studio main process: `whoami()` → UPN → `resolve_person` (roster read via `project_settings.py --json`) → `actor = handle ?? upn`; `ConnectionInfo.accountSource: 'roster' \| 'host'` | actor = the UPN (a real person; `require_human()`'s AI-regex still applies); ledgers record the UPN verbatim |
| **`needsMe` / `rolesFor` / `samePerson`** (`studio/shared/boardModel.ts`) | handle vs handle | board rows carry roster handles; `account` = resolved handle when mapped, else UPN; `samePerson('@a@b.com', 'a@b.com')` is already true, so "waiting on me" works for an unmapped-but-signed-in person whose UPN is what the PR carries | role views read empty **and Studio says so**: banner "Signed in as `upn` — not in `.sdlc/team.yaml`; add `email:` to `@handle` to see what is yours" |
| **Reviewer match** (`reviews[].author.login`, `reviewRequests[].login`) | `login` | normaliser sets `login = uniqueName` and `handle = resolve_person(...)`; `spec_status._reviewer_handle` prefers `handle` (sans `@`) when present, else `login` | `waiting_on_handle` emits `@<upn>` (today's code would do the same with a raw login); text names the UPN |
| **`approvals[].by`** | `login` | handle if resolved else UPN; `at: null` | — |
| **`handoff --developer @x`** | roster check (unchanged) → `--assignee x` | roster check (unchanged); developer **named in the PR description** ("Developer: @x" + email when known) — ADO has no assignee and adding the developer as a reviewer would make the ladder read "waiting for a non-author approval; requested from @x" | no email needed for the developer → no new refusal |
| **`handoff` checker → reviewer** | `--reviewer c` | `--required-reviewers <email_for(@c)>` | missing email → PR created without reviewer, `assignment_error: "checker @c has no email in .sdlc/team.yaml; Azure DevOps needs one to add a reviewer"`, `ok: true` (local half done — today's non-fatal path) |
| **Studio `isOursToMerge`** (pure, `mergeGate.test.ts` unchanged) | `author.login === account`, `headRepositoryOwner.login === repoOwner` | provider fills `author.login = createdBy.uniqueName`, `headRepositoryOwner.login = repository.id`; main process passes the **raw UPN** (not the resolved handle) and `repo_view().id` as the two comparands; `isFork`/`forkSource` present → not ours | fail-closed on any missing field (existing) |
| **Studio `blocksSave`** (exact compare) | `actor` | same `actor` source each session, so the compare stays consistent | — |
| `sprint.py --by/--to`, `spec_transition --authorised-by`, `track_decisions --owner` | free text | free text — unchanged | — |

---

## 7. Studio change table

| File | Change |
|---|---|
| `studio/shared/codeHostModel.ts` (new, pure) | `parseRemote(url)` (port of §2.2, tested on the shared `remote-urls.json`); `hostFeatureReason(connection, feature) -> string \| null` (§7.1 strings); `cliLabel(host)` |
| `studio/electron/main/codeHost.ts` (new) | `interface CodeHost { kind; cli; whoAmI(); repoView(); isBranchProtected(); createPullRequest(opts); listOpenPullRequests(head); mergePullRequest(n) }`; `resolveCodeHost(projectPath) -> { host, source, cli: CliStatus, provider }` (remote parse + `.sdlc/code-host.yaml` + `SDLC_CODE_HOST`, same precedence as Python); `NullHost` whose methods throw `CodeHostUnavailable(reason)`; per-project memo for `whoAmI` / `repoView` / extension check with TTL = poll interval (120 s) |
| `studio/electron/main/hosts/githubHost.ts` (new) | today's six `gh` argv **verbatim** (from `sync.ts:227, 237, 831, 908, 909, 916–919, 968`) via `runGh/ghJson`; pinned by an argv golden test |
| `studio/electron/main/hosts/azureDevOpsHost.ts` (new) | az argv from §4.1 via `az.ts`; the same pure `map*` as Python, ported and parity-tested on the **same JSON fixtures** (`test/pluginRoot.ts` already locates the plugin tree) |
| `studio/electron/main/az.ts` (new) | `runAz / azJson / setAzBinary` — same contract as `git.ts`'s `runGh/ghJson`; appends `--only-show-errors`, `-o json`; spawn env carries the two `AZURE_*` vars |
| `studio/electron/main/git.ts` | **unchanged** (`runGh/ghJson/setGhBinary` stay exported; `githubHost.ts` uses them) |
| `studio/electron/main/tooling.ts` | `detectAz(overridePath)` = `az version -o json` with a 15 s az-only probe timeout + `az extension show --name azure-devops` (local); `ToolingReport.az`; `DetectAllToolingResult.azResolved`; `detectAllTooling({…, azPath})`; Windows `az.cmd` through the existing shim path |
| `studio/electron/main/sync.ts` | `getConnectionInfo` → `provider.whoAmI()` (+ roster resolve) and `provider.isBranchProtected()`; returns `host, hostSource, cli, accountSource, rosterHandle`; `save` PR fallback → `provider.createPullRequest({ base, head, title, body, reviewer })` (approver handle → email via roster on ADO; unresolvable → PR without reviewer + `note` in the result, surfaced in the toast); `pollAndMergeOpenPullRequest` → `whoAmI / repoView / listOpenPullRequests / mergePullRequest`; `isOursToMerge` unchanged; `PrListEntry` type unchanged (provider fills it; ADO `files: null` in v1 → existing fail-closed branch, D-OWNER-8) |
| `studio/electron/main/index.ts` | `setAzBinary(report.azResolved)` beside `setGhBinary`; `setToolOverride` kind union gains `'az'` (`azPathOverride`); `studio:getConnectionInfo` returns the extended shape; `startPullTimer` unchanged |
| `studio/electron/main/settings.ts`, `shared/types.ts` | `Settings.azPathOverride?`; **no** `codeHostOverride` (the repo file is the override; the Settings screen edits it via `set_setting.py code-host`); `ToolingReport.az`; `ConnectionInfo` gains `host: 'github'\|'azure-devops'\|'none'`, `hostSource`, `cli: { name: 'gh'\|'az'\|null, found, extension: boolean\|null, signedIn: 'yes'\|'no'\|'unknown', reason? }`, `accountSource: 'roster'\|'host'\|'typed'\|null`, `rosterHandle: string\|null`; `StudioApi.setToolOverride` kind gains `'az'` |
| `studio/electron/main/commandRunner.ts` | redaction: values of `AZURE_DEVOPS_EXT_PAT=` and `AZURE_DEVOPS_EXT_AUTH_TOKEN=`; ADO PATs have no fixed prefix (unverified) — the `Basic`, `Bearer`, `token=` catch-alls remain the backstop |
| `studio/electron/preload/index.ts` | pass-through of the widened `setToolOverride` kind |
| `studio/src/App.tsx:90` | `allFound = claude && uv && pluginScripts && git` — **gh and az never block opening**; `handleOverride` kind gains `'az'`; after a project opens, `connection.cli.found === false` shows a non-blocking banner |
| `studio/src/components/ToolingIssues.tsx` | two sections: **Required** (claude, uv, pluginScripts, git — wording unchanged) and **Code-host CLIs** (never blocks): rows for `gh` and `az` with found/not-found and override inputs; `INSTALL_LINKS.az = https://aka.ms/azure-cli`; `LABELS.az = 'the Azure CLI (az)'`; copy per §7.1 |
| `studio/src/components/SettingsScreen.tsx` | rows "Code host: Azure DevOps (from origin / `.sdlc/code-host.yaml` / `SDLC_CODE_HOST`)" with an override picker (writes via `set_setting.py code-host`); "CLI: az — signed in as sam@corp.com (roster: @sam-k)" / "az not installed → link"; the other CLI row reads "not needed for this repository" |
| `studio/src/components/Console.tsx` | `gitOrGhSubcommand` also recognises `az` (incl. `cmd /c az.cmd`); phrases: `repos pr create`→"Opened a pull request", `repos pr update … --status completed`→"Merged a pull request", `repos pr list/show`→"Checked pull request status", `account show`→"Checked who is signed in", `repos policy list`→"Checked branch policies", `devops invoke`→"Talked to the code host" |
| `PipelineEvidencePanel.tsx`, `chatArgs.ts`, `pipelineEvidence.ts` | "GitHub" → host-aware via `cliLabel`: "This needs the {GitHub CLI (gh) \| Azure CLI (az) with the azure-devops extension} installed and signed in on this machine, and pipelines on the installed CI platform." |
| `HandoffDialog.tsx` | placeholder stays `@handle`; on ADO a helper line "the checker's `email:` in `.sdlc/team.yaml` is what Azure DevOps receives"; submit stays enabled when the CLI is unavailable, with the button text "Hand off locally; code-host assignment will be skipped: <reason>" |
| `BuildBoard.tsx`, `SpecStatusView.tsx`, `GateAuthPanel.tsx` | reason text from `hostFeatureReason` beside the existing `!board.codeHostAvailable` banner / "Reading the pull request…" / whole panel |
| `studio/test/e2e/board.spec.ts:343` | skip text: "No code-host account is signed in — `gh auth login` (GitHub) or `az login` (Azure DevOps)" |

### 7.1 Per-situation wording and disabled features (D4 outcome)

| Situation | ToolingIssues / banner wording | Features disabled (reason string shown on the control) |
|---|---|---|
| No project open | gh and az rows: "Optional — needed when a project's repository is on GitHub / Azure DevOps. You can open a project without it." | none |
| Project on ADO, `az` found, extension present, signed in | — | none |
| Project on ADO, `az` missing | "This project's repository is on Azure DevOps. The Azure CLI (az) wasn't found; the GitHub CLI isn't needed for this project." | Board live status ("Live pull-request status needs the Azure CLI"); Hand-off assignment ("The hand-off completes locally; assigning on Azure DevOps needs az"); Pipeline evidence; Gate credential; Save-when-protected ("A direct push was refused and az is not available to open a pull request — nothing was saved to the shared branch"); Settings "Signed in as: unavailable (az not installed)" |
| Project on ADO, az found, extension missing | "…found, but the azure-devops extension isn't: run `az extension add --name azure-devops`." | same set |
| Project on ADO, az found, signed out / PAT-only | "Not signed in — run `az login`." / "Signed in with a PAT only; Azure DevOps cannot say who you are." | same set + `account = null` → every actor-gated control shows its existing "sign in" text (or the typed-name path, D-OWNER-5) |
| Project on GitHub, `gh` missing | mirror wording with "the Azure CLI isn't needed for this project" | same set |
| Host `none` | "This folder's origin is not GitHub or Azure DevOps; pull-request features are off (gh was tried, as before)." | same set |

The reasons are computed in the renderer from `ConnectionInfo.cli` by one helper; the renderer still never spawns anything.

---

## 8. Honesty semantics table

Rule: a field's **value domain is never widened** where an existing test pins it (`connection_report` keeps exactly six checks and `state ∈ {yes, no, unknown}`). "Unavailable" rides a **top-level `host` block**, never a fourth check state or a false `no`.

| Output | Field | value / `yes` | `no` / `false` | `unknown` / `null` | unavailable (CLI absent, extension missing, signed out) | Never |
|---|---|---|---|---|---|---|
| every host-touching `--json` | `host` (top-level, new) | `{name, source, cli, cli_state: available, detail}` | — | `cli_state: unknown` when the probe itself failed | `not_installed` / `extension_missing` / `signed_out` + detail naming the fix (`az login`, `az extension add …`, `gh auth login`) | `name: github` without `source: default` when nothing was detected |
| `connection_report` | `signed_in` | `yes` "as `<login \| upn>` (roster: @handle)" | `no` "gh/az is not signed in — run `gh auth login` / `az login`"; CLI absent also `no` with detail "the Azure CLI is not installed" (parity with today's gh fold) | — | via `host.cli_state` | — |
| | `can_read` | `yes` "`org/project/repo`" | `no` + stderr | — | `no` + CLI detail | — |
| | `can_open_prs` | `yes` (GitHub `viewerPermission`) | `no` (GitHub `READ`) | **ADO always `unknown`**: "Azure DevOps exposes no cheap permission probe; a refused `az repos pr create` is the real answer" | `unknown` | a `yes` by assumption |
| | `branch_protected` | `yes` "N enforcing policies on `<branch>`" | `no` "no enabled, blocking policy on `<branch>` — what decides is whether a direct push gets refused" | `unknown` "policies could not be read" | `unknown` + CLI detail | counting project-wide policies as this repository's |
| | `checks_installed` / `checks_missing` | per CI-axis dirs | missing list | `unknown` harness dir unreadable | n/a (files) | listing GitHub workflows as missing on an ADO install |
| | `ci_platform`, `note` (top-level, new) | `github` / `azure-devops`; `note` on axis disagreement | — | — | — | — |
| `spec_status --spec / --all` | `code_host_available` | `true` | — | — | `false` + `error` naming CLI and host; rows still built from files (today's path) | "No pull request yet" when the host was unreachable |
| | `pull_request.waiting_on` | ladder sentence (unchanged) | — | `"live checks not read for this row"` when `_checks_unavailable` | — | "waiting for the grader to run" when checks were simply not fetched |
| | `wait_hours` / `over_alarm` | numbers (GitHub; ADO when a request time was derived from threads) | — | **keys absent** when no request timestamp exists (verified: `_pending_reviewer_wait` → `(who, None)` → the row lacks the keys; text omits the age) | — | `0` / `false` |
| | `approvals[].at` | ISO (GitHub) | — | `null` on ADO; text "approved (time not recorded by Azure DevOps)" | — | a synthetic time |
| | `updated_at` | ISO (GitHub) | — | `null` on ADO; board shows "unknown" | — | `creationDate` masquerading as "last moved" |
| `handoff --json` | `pr_url` / `assignment_error` | URL | — | — | `pr_url: null`, `assignment_error` (CLI, sign-in, **or missing checker email**), `ok: true` | failing the local half |
| `pipeline_proof` | rail `status` | PROVEN / RAN_UNPROVEN / NEVER_FIRED / BROKEN | — | `NO_DATA` "run history could not be read" / "pipeline definition for `<file>` not found in Azure Pipelines" | `ok: false` "Could not gather pipeline evidence: <CLI detail>" | NEVER_FIRED because the definition lookup failed or the dir was `.github/workflows` |
| | `ruleset.enforcing` | `true/false` from `isEnabled && isBlocking` | — | `null` + "Could not read branch policies … not the same as there being none" | — | — |
| | `merge_history.enforced_since` | date (GitHub) | — | `null` on ADO → merges not split pre/post (existing path) | — | — |
| `gate_auth status` | `configured` / `gates_can_sign_in` | from variable-group variables the pipelines reference | `[]` + `detail` | `gates_can_sign_in: null` + `checked: false` when groups could not be listed (additive tri-state) | `detail` names `az login` / extension | `false` meaning "not checked" |
| `gate_auth set/clear` | — | — | — | — | ADO: `kind: unsupported_host`, the manual `az pipelines variable-group variable create …` command printed, exit 1 | silently doing nothing |
| `import_outcomes` | per category | counts | `Imported: no data` | printed note per unsupported / undatable category | `Error: …` exit 1 (no partial write) | zero deploys / zero wait when records were not read |
| Studio `ConnectionInfo.account` | handle or login/UPN | — | `null` | `null` + `cli.signedIn: 'no' \| 'unknown'` + `cli.reason` | "not signed in" when the CLI is simply missing (say "not installed") |
| Studio `branchProtected` | `true` | `false` | `null` ("couldn't read") | `null` | — |
| Studio controls | — | — | — | `hostFeatureReason()` text on the control | a silently disabled button |

---

## 9. Performance

| Concern | Measurement / assumption | Design |
|---|---|---|
| az latency | ≈ 0.4 s warm in-process (measured); real commands 1–2 s (extension load + auth + 1–2 HTTP) | budget **1–2 s per call**; **≤ 6 calls on any interactive path** |
| `--detect` round-trip | one `GET …/vsts/info` per call | `--detect false --org --project --repository` from the parsed remote on every call |
| Dynamic install / telemetry | observed | the two `AZURE_*` env vars on every spawn; `az extension show` once per process, cached |
| `spec_status --spec` on ADO | 1 `pr list` + 1 `policy list` (active only) + 1 `invoke threads` (+2 HTTP discovery, cached) ≈ 3–6 s vs ≈ 1 s on gh | acceptable for a single-spec view; threads call shared between `fetch_pr_comment_bodies` and `fetch_pr_events` via a per-process cache keyed `(repo_root, pr_id)`; threads fetched only when a `grader` check exists on the PR |
| `spec_status --all` (board) | 1 `pr list --top 1000` + N `policy list` for **active, non-draft** PRs | N bounded by the team's WIP caps; `ThreadPool(6)`; hard cap `ADO_CHECKS_MAX = 40` → rows beyond it carry `_checks_unavailable` (honest, §8); `--query` projection trims the payload; measure on a real backlog before raising the cap |
| `pipeline_proof` | 1 `pipelines list` (cached) + 1 `runs list` per rail + ≤ 30 threads calls (existing P7 pool) + 1 `policy list` + 1 `repos show` | same order as today's gh call count |
| `import_outcomes` | 1 `pr list --status completed` + 1 `invoke commits` per merged PR + threads per merged PR + deployments + 1 `boards query` | batch job, not interactive; `--since` bounds it |
| `az devops invoke` discovery | 2 extra HTTP per invocation | resource-location list cached per process; native verbs preferred wherever they exist |
| Studio poller (every 120 s) | `whoAmI` + `repoView` + `pr list --source-branch <pending> --status active` + `policy list` for the one found PR | `whoAmI` / `repoView` memoised per project with TTL = poll interval; ≈ 2 network calls per tick ≈ 2–4 s at a 120 s cadence |
| Tooling probe | `az --version` can exceed 5 s cold | `az version -o json` with a 15 s az-only timeout, run in the existing `Promise.all` |
| Windows | `az.cmd` shim → `cmd.exe /c` → metachar guard | §4.3 P12 / D-OWNER-7 |

---

## 10. Tests & CI

| Test asset | Pattern mirrored | Needs `az`? | Runs in CI? | What it proves |
|---|---|---|---|---|
| `scripts/tests/fixtures/code_host/remote-urls.json` | — | no | consumed by pytest **and** vitest | Python/TS detection cannot drift |
| `scripts/tests/fixtures/code_host/azure_devops/{account_show, repos_show, pr_list, pr_show, pr_policy_list, pr_reviewer_list, pr_threads, policy_list, pipelines_list, runs_list, timeline, environments, deployment_records, boards_query, variable_groups}.json` + `README.md` (exact capture commands) + `redact.py` (GUIDs/UPNs/org → fixed fakes) | gh fixture dicts in `test_github_import.py` | no | yes | the normalisers' inputs |
| `_provenance` key on every fixture: `"captured <date> <org anonymised>"` or `"hand-written (unverified)"`; `test_fixture_provenance.py` fails on a missing key and **lists** the hand-written ones in its output | — | no | yes | the unverified status stays visible until a capture lands |
| `scripts/tests/test_code_host.py` | `test_doctor.py::TestPlatformDetection` | no | yes | detection order; override precedence (`tmp_path/.sdlc/code-host.yaml`, `monkeypatch.setenv`); `host: none` → `cli_for == "gh"`; `installed_ci_platform` agrees with `doctor.installed_platform` on the six manifest cases; axis-mismatch `note` |
| `scripts/tests/test_ado_import.py` | `test_github_import.py` | no | yes | `run_az` via `monkeypatch.setattr(subprocess, "run", fake)` asserting the env vars, `--only-show-errors`, `-o json`, `--detect false`, PATHEXT resolution; `az_json` empty → `[]`, unparseable → `AdoImportError`; normalisers on fixtures; `FakeAz` router keyed `" ".join(args[:3])` (`repos pr list`, `repos pr policy list`, `devops invoke git`, `repos show`, `repos policy list`, `pipelines list`, `pipelines runs list`, `account show`) with `AssertionError("unexpected az call")` as the read-only pin; `AdoImportError` **is a** `GitHubImportError` |
| `scripts/tests/test_provider_parity.py` | new | no | yes | every `PROVIDER_FUNCTIONS` name exists in `ado_import` with the same `inspect.signature` as its GitHub twin |
| `scripts/tests/test_host_story_parity.py` | new | no | yes | **one story, two hosts**: parametrised over `(github + FakeGh fixtures, azure-devops + FakeAz fixtures)`, asserts identical normalised `PullRequest` and identical `compute_waiting_on` text for: waiting on a reviewer; merged; draft; failed CI; grader verdict found; no PR |
| `scripts/tests/test_gh_argv_golden.py` | `test_pipeline_proof.py` read-only pin | no | yes | **the mechanical "GitHub byte-identical" proof**: patches the existing seams (`ss.gh_json`, `h.run_gh`, `cr._gh`, `github_import.run_gh`, `ga.subprocess.run`) to record argv, drives each script on gh fixtures, and compares to `fixtures/golden/gh-argv.json` captured **before** Wave 1 lands (S1–S4, H1, C1–C4, G1–G3, P1–P7) |
| `scripts/tests/fixtures/golden/{spec_status,connection_report,handoff}-gh-*.txt` | doctor goldens | no | yes | text output on gh fixtures captured before/after |
| additive `class TestOnAzureDevOps` in `test_spec_status.py`, `test_handoff.py`, `test_connection_report.py`, `test_pipeline_proof.py`, `test_gate_auth.py`, `test_gate_inventory.py` | existing per-module seams | no | yes | patches `code_host.detect_host` → `azure-devops` and the `ado_import.*` seam by name; **no existing test edited**; `test_connection_report` asserts `len(checks) == 6` still holds and `host`/`ci_platform` are top-level; `spec_status --all` on ADO fixtures never calls `run_git` (existing `pytest.fail` pin reused) |
| `scripts/tests/test_validate_team.py`, `test_set_setting.py`, `test_project_settings.py` additions | existing | no | yes | `email` optional / unique / one line; `--email` targeted edit; `code-host` verb writes the file |
| `scripts/tests/test_ado_outcomes.py`, `test_import_outcomes.py` | `test_scorecard.py` import tests | no | yes | `gh_id` prefixes; dedup against an existing ledger; `wait_hours` key omitted, never `None`; "no data" text; exit codes; GitHub branch asserts `scorecard.import_events` is what gets called (patched); no partial write |
| `scripts/tests/test_az_contract.py` | `test_capabilities.py` | **yes — skips otherwise** | runs where az **and** the extension exist | for every argv list in `ado_import.AZ_CONTRACT`, `az <group> <verb> --help` (env: dynamic install off, telemetry off, `AZURE_CONFIG_DIR` default so the installed extension is visible) contains every flag; help text is local — no network, no login |
| `studio/test/codeHostModel.test.ts`, `azJson.test.ts`, `codeHostProviders.test.ts`, `githubHostArgv.test.ts`, `hostReasons.test.ts`, `toolingIssuesOptional.test.tsx`, `appToolingGate.test.tsx`, additive cases in `mergeGate.test.ts` and `redact.test.ts` | pure pins + `vi.mock` | no | all three OS runners | detection parity on the shared fixture; providers map the **same JSON fixtures** to `PrListEntry`; the six gh argv unchanged; `gh` and `az` both missing does **not** route to `toolingIssues`; required-missing still does; UPN account / repo-GUID owner / fork source in `isOursToMerge` |
| existing tests | — | — | — | **unmodified**: `test_github_import.py`, `test_scorecard.py`, `test_spec_status.py`, `test_handoff.py`, `test_connection_report.py`, `test_gate_auth.py`, `test_pipeline_proof.py`, `test_doctor*.py`, `approvalPath.test.ts`, `mergeGate.test.ts` originals |

**CI.** `ci.yml` runs `test` (ubuntu), `test-windows`, and studio on a 3-OS matrix; none install `az` and none will. GitHub-hosted images may ship the Azure CLI (unverified) but **without** the azure-devops extension, and `az repos … --help` with the extension missing attempts a dynamic install. Therefore: (a) every fixture test is binary-free; (b) `test_az_contract.py` sets `AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no` and skips unless `az extension show --name azure-devops` exits 0; (c) an **optional, non-blocking** job `az-contract` (ubuntu only) runs `az extension add --name azure-devops` then `pytest -k az_contract` so the contract is exercised somewhere (D-OWNER-9). The blocking jobs are untouched.

---

## 11. Docs to update

| File | Change |
|---|---|
| `CLAUDE.md` | Architecture: `scripts/code_host.py`, `scripts/ado_import.py`, `scripts/import_outcomes.py`; Key Features: one bullet **Code-host providers (GitHub `gh` or Azure DevOps `az`, chosen by the repository)** — two axes, override precedence, `email` roster key, honesty rule, protected core unchanged; Testing block: `uv run scripts/code_host.py --repo /tmp/test --json`, `uv run scripts/import_outcomes.py --repo /tmp/test --since 2026-09-01`, `uv run scripts/spec_status.py --repo /tmp/test --all --host azure-devops`; the `scorecard.py import` line stays (GitHub) |
| `README.md` ~L161–171 | "Code hosts" subsection: both CLIs, which features need which, `email:`; the ADO bullets mention `az` for PR status / hand-off / board, not only doctor |
| `CHANGELOG.md` › Unreleased | one entry (docs wave only — avoids cross-wave conflicts) |
| `references/code-host-providers.md` (new) | the on-demand reference: §2 tables, §3.2 abridged, §6, §8, §4.3 pitfalls, capture runbook pointer, protected-file list |
| `references/team-model.md` | the two-key identity rule (`handle` + optional `email`) |
| `commands/sdlc-doctor.md` | one line: doctor's `az`/`gh` choice follows the installed CI pack; PR-facing commands follow the repository's remote |
| `commands/sdlc-setup.md` L151 | Step 7: GitHub + `gh` authenticated → …; ADO + `az` signed in → offer `configure-branch-policies.sh`; `.sdlc/code-host.yaml` only for unrecognised remotes; ask for `email:` when the profile is an ADO one |
| `commands/sdlc-upgrade.md`, `commands/sdlc-harness.md` | name both CLIs where `gh` appears |
| `commands/sdlc-handoff.md`, `commands/sdlc-spec-status.md` | `--host` flag; ADO reviewer/email note; `assignment_error` on a missing checker email |
| `phases/build-loop.md` L162 | "`scorecard.py import` (GitHub) or `import_outcomes.py` (either host)" |
| `docs/scripts.md`, `docs/commands.md`, `docs/architecture.md` | name both; add the three new scripts; fixture provenance convention |
| `docs/proposals/studio-improvements.md` §4 | D4 row → "Built as a code-host provider: soft-require the detected host's CLI, per-feature reasons"; D5 → "`--by` = signed-in account resolved through the roster on both hosts" |
| `docs/proposals/ado-repo-support-matrix.md` | new fold row pointing here |
| `studio/README.md` | tooling: required vs code-host CLIs; `azPathOverride` |
| `templates/team/team.example.yaml` | `email:` worked example |

---

## 12. Work breakdown — waves, strict disjoint file ownership, acceptance checks

Shared contracts are written into `references/code-host-providers.md` **first** (Wave 1 owns the file; the others read it): host value set; override precedence; `.sdlc/code-host.yaml` schema; `AdoImportError(GitHubImportError)`; roster key `email`; `PROVIDER_FUNCTIONS`; `gh_id` prefixes; `ConnectionInfo` additions; `hostFeatureReason` strings; the shared `remote-urls.json` path.

| Wave | Owns (no other wave touches these) | Depends on | Acceptance checks |
|---|---|---|---|
| **0 — Capture** (a person with ADO access; no code) | `scripts/tests/fixtures/code_host/azure_devops/README.md`, `*.json`, `redact.py` | — | every §4.1 command run once against a real org (`AZURE_CONFIG_DIR` scratch + the two env vars); redacted; README checklist ticks every field §3.3 reads; each (unverified) in this document flips to verified or is amended; `_provenance` set to `captured …` |
| **1 — Foundation** | `scripts/code_host.py`, `scripts/ado_import.py`, `scripts/tests/test_code_host.py`, `test_ado_import.py`, `test_provider_parity.py`, `test_host_story_parity.py`, `test_gh_argv_golden.py`, `test_fixture_provenance.py`, `test_az_contract.py`, `scripts/tests/fixtures/code_host/remote-urls.json`, `scripts/tests/fixtures/golden/gh-argv.json`, `scripts/tests/fixtures/golden/{spec_status,connection_report,handoff}-gh-*.txt`, `scripts/capabilities.py` (+ `code-host` entry), `references/code-host-providers.md` | 0 optional (fixtures may start hand-written with `_provenance: hand-written (unverified)`) | `pytest scripts/tests -q` green with **zero** existing test edits; argv golden captured from the **pre-change** scripts; `code_host.py --repo <ado clone> --json` → `host: azure-devops, source: remote` (local, no network) and on this repo → `github`; contract test skips cleanly without the extension; `git diff --stat` lists no protected file |
| **2 — Roster identity** | `templates/team/_schema.yaml`, `templates/team/team.example.yaml`, `scripts/validate_team.py`, `scripts/set_setting.py` (`person --email`, new `code-host` verb), `scripts/project_settings.py`, `scripts/tests/test_validate_team.py`, `test_set_setting.py`, `test_project_settings.py`, `references/team-model.md` | — (∥ 1) | rosters without `email` validate exactly as today; duplicate/invalid email rejected; `person --email` targeted edit with anti-smuggling intact; `code-host --host azure-devops` writes a file `code_host.detect_host` reads as `source: file`; `check_spec.py` untouched |
| **3 — Read scripts** | `scripts/spec_status.py`, `scripts/connection_report.py`, `scripts/pipeline_proof.py`, `scripts/gate_inventory.py`, `scripts/tests/test_spec_status.py`, `test_connection_report.py`, `test_pipeline_proof.py`, `test_gate_inventory.py` (additive classes only) | 1 | GitHub text goldens and argv golden byte-identical; `--host` on each; `connection_report` has exactly 6 checks + top-level `host`/`ci_platform`/`note`; `pipeline_proof` read-only pin extended with `FakeAz`; `spec_status --all` on ADO fixtures never calls `run_git`; `_checks_unavailable` rows render the honest sentence; `pipeline_proof_model.py` untouched |
| **4 — Write scripts** | `scripts/handoff.py`, `scripts/gate_auth.py`, `scripts/tests/test_handoff.py`, `test_gate_auth.py` (additive) | 1, 2 | `TestAssignOnHost` unmodified; ADO class asserts `--draft true`, `--required-reviewers <checker email>`, developer named in the description, missing checker email → `assignment_error` with `ok: true`, URL built from `pullRequestId`; `gate_auth status` on ADO reads variable-group variables; `set`/`clear` → `kind: unsupported_host`, exit 1, manual command printed; `remote_slug` untouched on GitHub |
| **5 — Scorecard import** | `scripts/ado_outcomes.py`, `scripts/import_outcomes.py`, `scripts/tests/test_ado_outcomes.py`, `test_import_outcomes.py`, `scripts/tests/test_capabilities.py` (additive assertion; the `import-outcomes` entry is appended to `capabilities.py` **after Wave 1 merges** — one line, coordinated) | 1 | `git diff --quiet scripts/scorecard.py scripts/github_import.py`; GitHub branch delegates to `scorecard.import_events`; `gh_id` prefixes never collide with `gh-*`; `wait_hours` omitted not `None`; unsupported category prints a note, never zeros; no partial write |
| **6 — Studio main** | `studio/shared/codeHostModel.ts`, `studio/electron/main/codeHost.ts`, `hosts/githubHost.ts`, `hosts/azureDevOpsHost.ts`, `az.ts`, `tooling.ts`, `sync.ts`, `index.ts`, `settings.ts`, `commandRunner.ts`, `electron/preload/index.ts`, `shared/types.ts`, tests `codeHostModel.test.ts`, `azJson.test.ts`, `codeHostProviders.test.ts`, `githubHostArgv.test.ts`, additive cases in `mergeGate.test.ts`, `redact.test.ts` | 1 (shared fixtures, read-only), 2 (roster `email`), lands after 3 (reads `connection_report --json`'s `host` block contract) | `npm run typecheck`; vitest green on 3 OSes incl. unmodified `approvalPath`, `mergeGate` originals; `git.ts` unchanged; `githubHost` argv golden == today's six invocations; poller fail-closed on `files: null`; both CLIs' spawn env carries the two `AZURE_*` vars; renderer spawns nothing |
| **7 — Studio renderer + strings** | `studio/src/App.tsx`, `src/components/ToolingIssues.tsx`, `SettingsScreen.tsx`, `Console.tsx`, `PipelineEvidencePanel.tsx`, `GateAuthPanel.tsx`, `HandoffDialog.tsx`, `BuildBoard.tsx`, `SpecStatusView.tsx`, `src/hostReasons.ts` (new), `electron/main/chatArgs.ts`, `pipelineEvidence.ts`, `test/e2e/board.spec.ts`, new `toolingIssuesOptional.test.tsx`, `appToolingGate.test.tsx`, `hostReasons.test.ts` | 6 | app opens a project with neither `gh` nor `az` installed; every host-backed control shows its §7.1 reason; the un-needed CLI row says "not needed for this project"; Console phrases for `az`; `actor=''` tests unchanged; e2e skip text names both logins |
| **8 — Docs** | `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `commands/sdlc-{doctor,setup,upgrade,harness,handoff,spec-status}.md`, `phases/build-loop.md`, `docs/scripts.md`, `docs/commands.md`, `docs/architecture.md`, `docs/proposals/studio-improvements.md`, `docs/proposals/ado-repo-support-matrix.md`, `studio/README.md` | 1–7 | `test_command_contracts.py`, `test_registry_docs_consistency.py`, `test_agent_references.py` green; grep for a bare "needs `gh`" claim returns none; no doc claims a capability a test does not prove |
| **9 — Optional, later** | `scripts/doctor.py` + `test_doctor.py` (axis-mismatch WARN; goldens byte-identical on GitHub); ADO deploy records and thread-derived review-request times once Wave 0 verifies the invoke resources; Studio `files` via `pullRequestIterations` (lifts D-OWNER-8) | 0, 5, 6 | GitHub goldens unchanged; each lifted (unverified) has a captured fixture |

Parallelism: **1 ∥ 2** → **3 ∥ 4 ∥ 5** (6 starts with 1 and 2, lands after 3) → **7** → **8**; 0 any time before Wave 1 finalises fixtures; 9 after everything. No file appears in two waves.

---

## 13. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Every az **output field** is unverified; a wrong name silently normalises to "nothing here" | High / High | Wave 0 captures first; normalisers assert required keys and raise `AdoImportError("unexpected az shape: missing X")` instead of defaulting; `_provenance` test keeps hand-written fixtures visible |
| R2 | az dynamic install / telemetry fork (observed) | Certain without the env / Medium | the two env vars on every spawn (Python and Studio); `az extension show` once per process |
| R3 | ADO latency makes the board feel broken (N `policy list` calls) | Medium / Medium | active, non-draft only; WIP-bounded; `ThreadPool(6)`; `ADO_CHECKS_MAX = 40` with honest `_checks_unavailable` rows; measure before raising |
| R4 | Identity mismatch (UPN vs `@handle`) silently empties "Needs me" | High without the roster key / High | roster `email` + `resolve_person`; Studio banner when the signed-in UPN is not in the roster; `samePerson` already tolerates `@upn` |
| R5 | Review-request time and vote time do not exist on the PR object → review-wait metrics thin | Certain / Medium | `(who, None)` path omits the age; `import_outcomes` omits `wait_hours` and prints the count; Wave 9 derives both from thread system comments once the wording is captured |
| R6 | PAT-only / `az login`-less sessions → no `whoami` → every actor-gated Studio control disabled | Medium / High for an ADO team | D-OWNER-5 (typed name only in that state, recorded as `accountSource: 'typed'`) |
| R7 | Studio auto-merge on ADO needs the PR's changed files (iterations REST, unverified) | High / Medium | v1 fail-closed: the PR is opened, Studio never completes it, UI says "waiting — complete it in Azure DevOps"; Wave 9 lifts it (D-OWNER-8) |
| R8 | Windows `az.cmd` shim → metachar guard refuses PR titles/bodies with `& \| < > ^ % "` | Medium on Windows / Medium | D-OWNER-7 |
| R9 | `gate_auth` secret model differs (variable groups; Fold E keyless RBAC) | Certain / Medium | status-only; writes stay a printed manual command (D-OWNER-6) |
| R10 | `pipeline_proof` definition ↔ YAML file mapping unverified; no `enforced_since` on ADO | Medium / Medium | `NO_DATA` "definition not found" rather than NEVER_FIRED; `enforced_since: null` path exists |
| R11 | Mixed combinations (GitHub repo + Azure Pipelines, or the reverse) surprise users | Low / Low | per-axis dispatch handles them; `connection_report` shows both axes and a `note` |
| R12 | Protected-core drift by accident during a wave | Low / High | per-wave `git diff --quiet` on the protected list; the list lives in `references/code-host-providers.md`; reviewer checklist |
| R13 | `host == none` fall-through keeps calling `gh` on GHES/GitLab remotes | Medium / Low | JSON says `host: none, source: default`; Studio shows "unrecognised remote — tried gh"; `.sdlc/code-host.yaml` is the fix |
| R14 | The name `GitHubImportError` now also covers az failures | Certain / Low (naming) | `code_host.CodeHostError` alias and docstring; renaming would touch protected `scorecard.py` |
| R15 | Per-call-site dispatch in five scripts drifts (one site forgets the ADO branch) | Medium / Medium | `test_provider_parity.py` + `test_host_story_parity.py` + the per-script `TestOnAzureDevOps` class that drives every call site on ADO fixtures with `FakeAz`'s "unexpected az call" pin — a forgotten branch calls `gh` and fails the test |

---

## 14. Decisions for the owner (only genuine)

| # | Decision | Recommended | Alternative | Why it is yours |
|---|---|---|---|---|
| D-OWNER-1 | Persistent per-repo override | `.sdlc/code-host.yaml` (one key, written via `set_setting.py code-host`), plus `--host` and `SDLC_CODE_HOST` | flag + env only (no new `.sdlc/` file) | adds a file to the `.sdlc/` family you curate |
| D-OWNER-2 | ADO identity in the roster | optional `people[].email`; handles stay `@handle` everywhere | `hosts: {github:…, azure-devops:…}` map per person; or handles become UPNs on ADO (breaks `^@` and every `@handle` comparison) | roster / frontmatter convention |
| D-OWNER-3 | What the developer becomes on an ADO hand-off PR (ADO has no assignee) | named in the PR description only ("Developer: @x <email>") — keeps the non-author-approval rung and `waiting_on` clean | also add the developer as an optional reviewer (appears in their "Assigned to me", but then `waiting_on` can name the developer) | team workflow expectation |
| D-OWNER-4 | Actor attribution on ADO | roster `@handle` when the UPN is in the roster, else the UPN verbatim | always the UPN | what the ledgers (`versions`, `draft-log`, sign-offs) will say |
| D-OWNER-5 | Studio actor when the host cannot identify the user (PAT-only az) | allow a typed name **only** in that state, recorded as `accountSource: 'typed'` in every ledger line | keep today's rule (actor-gated controls disabled) | provenance honesty vs usability for an ADO team where PAT setups are common |
| D-OWNER-6 | `gate_auth` on ADO | status only (read variable-group variables); `set`/`clear` print the exact manual `az pipelines variable-group variable create …` command, `kind: unsupported_host` | implement the write (needs a rule for *which* group; Fold E's keyless RBAC may make stored values moot) | secret-handling scope |
| D-OWNER-7 | Windows `az.cmd` + Studio's metachar guard | sanitise PR title/body on the shim path (spell out `&` etc.) with a console note | refuse the save-PR fallback with a clear message | UX vs strictness on your primary platform |
| D-OWNER-8 | Studio auto-merge on ADO in v1 | fail-closed: open the PR, never complete it, say so; lift in Wave 9 with `pullRequestIterations` | complete without a file list when no stage requires approval (weakens the "approval is about the PR's files" invariant the code defends) | invariant vs convenience |
| D-OWNER-9 | CI for the `az` contract test | add a non-blocking `az-contract` job (ubuntu) that installs the extension and runs `pytest -k az_contract` | skip-only (contract exercised on dev machines only) | CI time vs coverage |

Everything else in this document is decided by the owner's prior rules (O1–O6) or by the code as it exists.

---

## Appendix A — how the two input designs were judged

Both candidates (`host-design-seam.md`, `host-design-provider.md`) were scored 1–10 on the seven criteria the task set. The seam design is the **plugin spine** (dispatch at existing call sites, same names in `ado_import.py`, `AdoImportError` subclass, `host == none` fall-through, delegation to frozen `scorecard.import_events`, two axes kept apart). The provider design contributes the **interface discipline and Studio model**: documented TypedDict shapes, the gh argv golden, the one-story-two-hosts parity suite, fixture provenance, `updatedAt: null`, `wait_hours` key omission, author excluded from approvals, developer in the description not as a reviewer, `files: null` fail-closed auto-merge, the typed-actor fallback, the per-situation wording table, and a real `CodeHost` interface in Studio where no existing test pins the seams.

| Criterion | Seam | Provider | Note |
|---|---|---|---|
| Correctness of ADO semantics | 8 | 9 | both map votes ≥ 5, policy evaluations, `completed`/`abandoned`, run results correctly; provider adds `blocking`, repo-GUID owner, author-vote exclusion, `files: null` |
| Honesty | 8 | 9 | seam's `updatedAt = creationDate` fallback and `signed_in: unknown` on CLI-absent are the two weaker calls; provider's provenance key and key-omission rule are stronger |
| Additive-only compliance | 10 | 5 | provider's D6 edits ~16 existing test patch targets (`ss.gh_json`, `h.run_gh` — verified at `test_spec_status.py:319+`), moves Studio argv and `PrListEntry`, and puts pipeline dirs on the *host* provider (changes `connection_report` on GitHub-repo + Azure-Pipelines installs). Seam: zero existing test edits, protected files untouched, `gh` argv unchanged |
| Test strategy | 8 | 9 | provider: argv golden, parity suite, provenance; seam: `CAPTURE.md`, contract test, additive classes |
| Studio integration | 7 | 9 | provider answers PAT-only actor and ADO `files`; seam lacks both |
| Maintainability | 7 | 9 | provider's single interface vs seam's per-call-site branches (mitigated here by the parity tests, R15) |
| Delivery risk | 9 | 5 | seam is the smallest diff with the clearest audit; provider refactors five scripts and edits existing tests |
| **Total** | **57 / 70** | **55 / 70** | the additive rule is a hard constraint of this work, which is why the seam is the spine even though the two totals are close |

## Appendix B — verified vs unverified (for this document)

**Verified locally:** every file/line reference; `scorecard.py`'s `gi.collect_events` / `GitHubImportError` / `gh_id` contract and `compute_scorecard`'s `"wait_hours" in e` selection; `spec_status`'s `waiting_on_handle` / `_reviewer_handle` behaviour; the existing monkeypatch seams (`ss.gh_json`, `h.run_gh`, `cr._gh`, `github_import.run_gh`, `ga.subprocess.run`); `test_connection_report` pins (`len(checks) == 6`); `doctor.installed_platform()` and its tests; `App.tsx:90`, `git.ts` `runGh/ghJson`, the `sync.ts` call sites, `PROBE_TIMEOUT_MS = 5000`; the roster schema and `validate_team.py` helpers; `set_setting.py` verbs; CI runners (`ubuntu-latest`, `windows-latest`, 3-OS Studio matrix; no `az`); `az` **argument** names for every argv in §4.1 incl. `--status all`, `pipelines variable-group variable list/create/update/delete --group-id --secret`, `az version`; the vote integers and policy-type GUIDs (from the extension's own source); this repo's remotes point at GitHub.

**Unverified (Wave 0):** every `az`/REST **output field name and enum value** (`sourceRefName`, `isDraft`, `closedDate`, `reviewers[].vote/uniqueName/isRequired/isContainer`, `PolicyEvaluationRecord.status`, `configuration.settings.displayName`, `process.yamlFilename`, run `result/status/reason` semantics, thread `commentType` and system-comment wording, environment deployment records, work-item date fields, `labels` default inclusion, `isFork`/`forkSource`); invoke resource names (`pullRequestThreads`, `pullRequestCommits`, `timeline`, `environments`, `environmentdeploymentrecords`); whether draft PRs suppress build-validation; GitHub-hosted runner images' Azure CLI presence; `az version -o json` probe speed; ADO PAT shape for redaction.
