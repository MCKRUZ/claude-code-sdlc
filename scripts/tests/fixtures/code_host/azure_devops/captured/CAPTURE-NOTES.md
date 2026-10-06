# Capture notes — Azure DevOps shapes as actually returned (2026-10-05, two captures)

Captured read-only against one real organisation (anonymised to `contoso`; every GUID, UPN,
display name, branch slug, repository, pipeline, variable-group and environment name replaced;
titles, descriptions, text comments, commit messages and variable values replaced by
placeholders). Each file here is wrapped `{"_provenance", "_command", "_secs", "value"}` —
`_secs` is the measured wall time of that one `az` call. Azure CLI 2.87.0, azure-devops
extension 1.0.6.

Two captures were taken, both on 2026-10-05:

* **First capture** — repository anonymised `repo-3` in project `Project-One`; 32 calls, 31
  succeeded, 38 s total (0.8–2.3 s each, median ≈ 1.1 s warm). The sections "Pull requests" …
  "Variable groups, environments, boards" below record what it settled.
* **Second capture (another repository)** — a different repository of the same organisation,
  anonymised `repo-6` in project `repo-1`; 33 calls, 32 succeeded (`devops user show` is still
  Access Denied; `capture_log.json`). It **replaced** every file it produced. Four files the second
  capture did not produce were **kept from the first**: `pr_show_abandoned`,
  `pr_policy_list_abandoned`, `pr_threads_abandoned`, `pipelines_show`. What it added or changed is
  in the last section, with where the code honours each fact.

Name placeholders are assigned per capture, so a repository or person name must not be
cross-referenced between a kept first-capture file and a second-capture file; within one file the
GUIDs are the stable anchor. The tests derive their expected ids, counts and timestamps from the
fixture files (`scripts/tests/ado_fixtures.py`: `captured_pr`, `route_param`, …) rather than from
these notes, so a third capture changes the data, not the assertions.

## First capture (repo-3)

What this changes against `docs/proposals/code-host-providers.md` §4 and the hand-written
fixtures one directory up (each line is a fact observed in the data, not a guess):

## Pull requests (`az repos pr list / show`)

| Fact | Consequence |
|---|---|
| Keys as designed: `pullRequestId, status, isDraft, sourceRefName, targetRefName, createdBy.uniqueName, creationDate, closedDate, lastMergeCommit, reviewers[], labels[], repository{id,name,…}, mergeStatus, completionOptions, workItemRefs, supportsIterations`. `pr show` adds **no** keys over `pr list`. | `map_pr` field names verified |
| `status` ∈ `active` (17) · `completed` (76) · `abandoned` (7). `isDraft` false on all 100. `mergeStatus` ∈ `succeeded` · `null`. | enum verified; draft rows still unverified |
| **`lastMergeCommit` is present on every active PR** (trial merge). | Pitfall P7 confirmed: trust it only when `status == completed` |
| `reviewers[].vote` ∈ `0` (87) · `10` (75) · `-5` (1) · `-10` (1); **`isRequired` is `null` when not required, `true` when required** — never `false`. `isContainer` present. `hasDeclined`, `isFlagged`, `votedFor` present. | treat `null` as not required |
| `labels[]` **is included by default** in `pr list` (22 of 100 PRs carried labels); label keys `active, id, name, url`. | the "(default inclusion unverified)" note flips to verified |
| `closedDate` is `null` on every active PR. | merged-at rule holds |

## Policy evaluations (`az repos pr policy list --id N`)

| Fact | Consequence |
|---|---|
| **`[]` on an active PR whose target branch has no policies** — a legitimate empty, not an error. | an empty list is "no checks", never "unknown" |
| Record keys `artifactId, completedDate, configuration, context, evaluationId, startedDate, status`; `configuration` keys `createdBy, createdDate, id, isBlocking, isDeleted, isEnabled, isEnterpriseManaged, revision, settings, type{displayName,id,url}, url`. | verified |
| `status` seen: `approved` · `queued`. (`running`, `rejected`, `notApplicable`, `broken` not observed.) | mapping for unseen values stays conservative (`COMPLETED, None` + note) |
| Type ids seen: `0609b952-1397-4640-95ec-e00a01b2c241` (Build), `fa4e907d-c16b-4a4c-9dfa-4906e5d171dd` (Minimum number of reviewers), `fd2167ab-b0be-447a-8ec8-39368250530e` (Required reviewers). **Status-check `cbdc66da…` not observed** — still unverified. | — |
| `settings` keys seen on build policies: `buildDefinitionId, displayName, manualQueueOnly, queueOnSourceUpdateOnly, validDuration`; on reviewer policies `minimumApproverCount, creatorVoteCounts, allowDownvotes, resetOnSourcePush, requireVoteOnEachIteration, requiredReviewerIds, filenamePatterns, message, scope`. | check name = `settings.displayName` verified |

## Threads (`az devops invoke --area git --resource pullRequestThreads`)

| Fact | Consequence |
|---|---|
| Resource name `pullRequestThreads` **works** with `--api-version 7.1`; response `{count, value[], continuation_token}`. Thread keys `_links, comments, id, identities, isDeleted, lastUpdatedDate, properties, publishedDate, pullRequestThreadContext, threadContext, status`; `status` is `null` for system threads and `active` for text threads. Comment keys `_links, author, commentType, content, id, lastContentUpdatedDate, lastUpdatedDate, parentCommentId, publishedDate, usersLiked`; `commentType` ∈ `system` · `text`. | verified |
| **System-comment wording** observed: `"<Name> joined as a reviewer"`, `"<Name> voted 10"`, `"<Name> updated the pull request status to Completed"`, `"<Name> updated the pull request status to Abandoned"`, `"The reference refs/heads/<branch> was updated."`. The design assumed `"added … as a reviewer"`; that form was **not** observed (self-join reads "joined"). | **Do not parse prose.** Use `properties`: `CodeReviewThreadType` (`$value` ∈ `ReviewersUpdate`, `VoteUpdate`, `StatusUpdate`, `RefUpdate`), `CodeReviewReviewersUpdatedAddedIdentity`, `CodeReviewReviewersUpdatedNumAdded`, `CodeReviewVoteResult`, `CodeReviewStatus`, `CodeReviewRefName`, `BypassPolicy`. Property values are `{"$type": "System.String"|"System.Int32", "$value": …}` |
| The grader / security review posts as a **text** comment that begins `<!-- rails-gate:<pipeline> -->` then a `# Security review — PR #N (…)` heading (seen on the abandoned PR). | `parse_verdict_block` input shape confirmed as comment `content` |

## Commits, repos, identity

| Fact | Consequence |
|---|---|
| `--resource pullRequestCommits` **works** (`--api-version 7.1`): `value[].{author, comment, commentTruncated, commitId, committer{date,email,name}, url}`. | resource name verified |
| `repos show / list` keys `defaultBranch ("refs/heads/main"), id, isDisabled, isFork, isInMaintenance, name, parentRepository, project{id,name,state,…}, remoteUrl, size, sshUrl, url, validRemoteUrls, webUrl`. | `repo_view` mapping verified |
| `az devops user show --user <upn>` → **Access Denied** (needs "ReadExtended Users") for a contractor identity. | display-name lookup must be optional and silent |
| `az account show` works offline; `user.name` is the UPN. **The CLI's default account decides the ADO token.** A user who is a guest/contractor in the org's tenant must `az login --allow-no-subscriptions` with that identity; a tenant whose identity never signed in to the org through a browser gets HTTP 403 "Identity … has not been materialized, please use interactive login over the browser first." | `cli_state` detail should name both: "signed in as X (tenant Y) — the org may need a different account" and the materialisation message |

## Pipelines, runs, timeline

| Fact | Consequence |
|---|---|
| `az pipelines list` has **no `process` key**. `az pipelines show --id N` has `process{type, yamlFilename}` and `repository{id, name, defaultBranch, type, url, …}`. | YAML↔definition mapping needs one `show` per definition (cache per process); `list` alone cannot do it |
| `runs list` keys include `id, buildNumber, definition{id,name,path,…}, finishTime, queueTime, startTime, reason, result, sourceBranch, sourceVersion, status, requestedFor, triggerInfo, url, uri`. **No `_links`**; `url` is the REST URL under the project GUID. | web URL must be built: `{org_url}/{project}/_build/results?buildId={id}` |
| `result` seen `succeeded` · `canceled`; `status` `completed`; `reason` `manual` · `individualCI`. `sourceBranch` forms `refs/heads/main`, `refs/heads/fix/…`, `refs/heads/release/…`. | enum mapping verified for the seen values |
| Timeline (`--area build --resource timeline`, `7.1`): `records[].{type, name, result, state, startTime, finishTime, parentId, order, …}`; `type` ∈ `Task, Job, Stage, Phase, Checkpoint`; `result`/`state` as designed. | `run_jobs` filter `type == "Job"` verified |

## Variable groups, environments, boards

| Fact | Consequence |
|---|---|
| `variable-group list` → `variables` is a **dict keyed by variable name** → `{isSecret, value}` (`value` null for secrets). `variable list --group-id` prints the same dict. | `secret_names` verified |
| Environments: `--resource environments` and `--resource environmentdeploymentrecords` **work only with `--api-version 7.1-preview`** — `7.1-preview.1` crashes the extension (`could not convert string to float: '7.1.1'`). Record keys `definition{id,name}, environmentId, finishTime, id, jobAttempt, jobName, owner{id,name}, planId, planType, queueTime, requestIdentifier, result, scopeId, serviceOwner, stageAttempt, stageName, startTime`; `result` ∈ `succeeded` · `failed`. | API version rule; deployment mapping verified |
| `az boards query --wiql …` prints **nothing** (empty stdout) when no work items match; both the `incident`-tag query and a 30-day any-type query returned nothing here. | treat empty stdout as `[]`; the work-item row shape stays **unverified** |

## Second capture (another repository) — what it added or changed

Same organisation, repository `repo-6` (project `repo-1`): 5 pull requests in the kept listings
(`pr_list` is the `--top 100` answer with 2 rows, `pr_list_repo` the `--top 5` answer with 5 —
4 active, 1 completed), 27 pipeline definitions project-wide, 2 environments, 2 variable groups.
Each row is a fact observed in the data, then where the code honours it and which test pins it.

| # | Fact | Where the code honours it |
|---|---|---|
| 1 | **`mergeStatus` ∈ `succeeded` · `conflicts` · `null`** — `conflicts` observed (PR 38702 in `pr_list_repo`), and that row's `lastMergeCommit` is `null` (nothing to trial-merge); the abandoned PR's `mergeStatus` is `null`. | Nothing reads `mergeStatus`; `ado_map.map_pr` and `ado_outcomes_map.pr_to_gh` treat a null `lastMergeCommit` as no merge commit, with no note (an open PR with conflicts is still just OPEN). `test_ado_import.py::test_merge_status_conflicts_and_null_are_tolerated_and_never_lend_a_merge_commit`. |
| 2 | **A run still going has `status: inProgress` and `result: null`** (seen in the live `runs list`; no in-flight row was kept — `runs_show.json` is the finished build 137780, `status: completed`, `result: failed`, `reason: individualCI`). | `ado_map.map_runs`: `RUN_RESULT[None]` is `None` and any status other than `completed` is `in_progress` → conclusion `None`, status `in_progress`, **never `"failure"`**. `test_ado_import.py::test_an_in_flight_run_has_no_conclusion_and_is_never_a_failure` (derived from the captured build). |
| 3 | **Timeline record `result` ∈ `succeeded` · `failed` · `skipped`** — `skipped` observed on a Stage of build 137780 (`timeline.json`; `type` here ∈ `Stage, Job, Task`; the one Job is `failed`). | `ado_map.RUN_RESULT["skipped"] == "skipped"`: its own word, neither green nor red — pipeline_proof's rollback check asks for `"success"`, so a skipped job never counts as a rollback that ran. `test_a_skipped_record_is_skipped_not_green_or_red`, `test_jobs_are_the_timeline_records_of_type_job`. |
| 4 | **Both system-comment wordings exist**: `"<Name> added <Name> as a reviewer"` (another person adding — `pr_threads.json` threads 229373 and 229503) and `"<Name> joined as a reviewer"` (self — first capture). | Reviewer-added events come **only** from the thread `properties` (`CodeReviewThreadType == ReviewersUpdate`, `CodeReviewReviewersUpdatedAddedIdentity`, `CodeReviewReviewersUpdatedNumAdded`), never from prose — `ado_map.map_threads`, `ado_outcomes_map.review_requests_from_threads`. `test_review_requested_comes_from_the_typed_properties_not_the_prose` (both test files), `test_host_story_parity.py`. |
| 5 | **`az pipelines list --repository repo-6 --repository-type tfsgit` returned `[]`** (`pipelines_list.json`) for a repository that has pipelines project-wide (the unfiltered list answered 27 — not kept as a fixture; `ado_fixtures.project_pipelines()` is a DERIVED stand-in built from the definitions the kept files name, with `pipeline_repository()` saying which repository each is bound to). **The repository filter cannot be trusted.** | `ado_pipelines._pipelines`: when the filtered list is empty, read the project-wide list and keep each definition whose `pipelines show --id` record has `repository.id` equal to this repository's GUID (`repos show`) or `repository.name` equal to the remote's repository — one `show` per definition, cached per process, behind a lock so concurrent rail reads pay once. `fetch_runs` says `no pipeline definition found for <repo> in project <project>` **only after** that fallback finds nothing; a missing FILE while other definitions are bound keeps the plain `pipeline definition for \`<file>\` not found in Azure Pipelines` (what pipeline_proof renders as NO_DATA). `test_ado_fetchers.py::TestPipelines`, `test_pipeline_proof.py::TestOnAzureDevOps`. |
| 6 | **No labels on any PR in this repository** — `labels` is `null` on every row of `pr_list`, `pr_list_repo` and every `pr show`; the first capture had `[]` and populated lists (`{active, id, name, url}`). | `pr.get("labels") or []` in `ado_map.map_pr` and `ado_outcomes_map.pr_to_gh`: null and `[]` both map to `[]`; a populated list maps to its names. `test_labels_null_or_empty_are_an_empty_list_and_names_ride_through`. |
| 7 | **`az repos pr policy list --id <active PR>` returned `[]` here too** (`pr_policy_list.json`, `pr_policy_list_active.json`), and `az repos policy list --repository-id … --branch master` returned `[]` (`policy_list.json`): "no policies on the target branch" is common. | Kept honest, and distinct from "unknown": an empty evaluation list is **no checks** (`map_checks([]) == []`, no `_checks_unavailable`), an empty configuration list is a ruleset with `enforcement: disabled` (`map_policies`), `connection_report` answers `branch_protected: no` with the reason, `pipeline_proof` renders "no enabled, blocking policy on the default branch"; only a failed read is `unknown` / "could not read". `test_ado_fetchers.py`, `test_connection_report.py`, `test_pipeline_proof.py`, `test_spec_status.py` (ADO classes). |
| 8 | **`lastMergeCommit` present on 5 of the 6 active PRs** the capture listed (one `null` — the `conflicts` row); the kept listings hold 4 of them: 3 with a trial merge, 1 null. | Rule unchanged (pitfall P7): trusted **only when `status == completed`** — `ado_map.map_pr`, `ado_outcomes_map.pr_to_gh`. `test_states_and_merge_fields`, `test_an_active_pr_never_lends_its_trial_merge_commit`. |

Also seen, unchanged from the first capture: `pr show` adds no keys over `pr list`; `isDraft` is
false everywhere; `reviewers[].isRequired` ∈ `null` · `true` (never `false`) and votes here are only
`0` and `10`; `pullRequestCommits` and `pullRequestThreads` work with `--api-version 7.1`;
environments and deployment records need `7.1-preview` (`result` ∈ `succeeded` · `failed`);
`runs show` carries no `_links` either (its `url` is the REST URL; `repository{id, name, …}` and
`definition{id, name}` ride along); `pipelines show` has `process{type, yamlFilename}` and
`repository{id, name, defaultBranch, …}`; `az boards query` prints nothing for both the `incident`
query and a 30-day any-type query (`boards_query`, `boards_query_recent`); `az devops user show` is
still Access Denied; `repos show` says `isFork: true` for this repository.

## Files kept hand-written (unverified) because nothing in the org exercised them

Draft PR rows, `rejected` / `running` policy evaluations, status-check policies, a non-empty
`boards query`, and the display-name lookup. An in-flight run row (`status: inProgress`,
`result: null`) and a skipped Job were observed live but not kept; the tests derive both from
captured records and say so.
