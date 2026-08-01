# Changelog

## 1.0.1 — 2026-08-01

**A patch release, and entirely corrective.** 1.0.0 changed what the gates enforce and left the
prose describing the old behaviour; everything here reconciles the two. Eight issues (#29–#36)
turned out to be four root causes.

**Nothing here makes a gate stricter.** One requirement is *removed* — Phase 1 no longer blocks on
`decision-list.md`, a file nothing ever produced, so no passing gate regresses. The receipts that
already blocked (`threat-model.md`, `drill-record.md`, `go-no-go-record.md`) still block; the
difference is that the plugin now tells you what to write and ships a template.

> **Ordering:** this releases from 1.0.0 and must land **before** the 1.1.0 kit sync, which is
> based on the same 1.0.0 tree.

### The 1.0.0 receipt migration is now actually wired (#31, #33, #34, #35)

1.0.0 added twelve required receipts to `phases/phase-registry.yaml` and updated almost none of the
prose around them. `check_gates.py` blocks on `artifacts.required` and nothing else, so the registry
was the only thing telling the truth — and it was telling it to nobody. Four separately-reported
issues turned out to be one unfinished migration.

**Two receipts were required by the gate and described nowhere.** A team hit them as a blocked phase
with no instruction anywhere for what the file should contain:

- `drill-record.md` — Phase 9 now has a **Step 4: Alert Drill** (the playbook is written first, so
  the drill tests `incident-response.md` as much as it tests the alert), an artifact spec, and a
  template. Steps 4–6 renumbered to 5–7.
- `go-no-go-record.md` — the Step 0 ceremony already existed and is the most consequential HITL
  gate in the lifecycle; only its receipt was missing. Added a spec, a template, and a line in
  Step 0 to record the decision *as it happens*. Silence is not agreement: a role that was not
  polled is recorded as not polled.

**`docs/phase-lifecycle.md` was missing eleven of the twelve** from its Required Artifacts tables,
and listed `go-no-go-record.md` and `drill-record.md` as *optional* — the direct contradiction that
makes a team skip an artifact and then fail the gate on it. All corrected.

**`threat-model.md` was documented `RECOMMENDED — required for any system handling auth, payments
or PII`** while the registry blocked on it unconditionally. The registry is right and the promotion
was deliberate: the phase body's own note asked for it to be promoted "on a major version with a
migration note", which is exactly what 1.0.0 was. The prose now says REQUIRED, with the `WAIVED:`
escape spelled out. Every system has guarded paths — deploy credentials and CI secrets at minimum —
and Phase 3 has nothing to wire its security gates from without the map.

**`decision-list.md` is gone; the work it named was already done by two shipped mechanisms.** The
phase-spanning `.sdlc/decision-log.md` (`DL-NN`, read by `track_decisions.py`, surfaced by
`/sdlc-status`) and a spec's own `## Decision List` section (enforced per-spec by `check_spec.py` at
Definition of Ready) already cover it, and three places in the repo warn against confusing the two.
A third file would have been the confusion. Dropped from `artifacts.required`; the Phase 1 spec now
points at the decision log; and because that log lives outside the phase's artifact directory where
the gate cannot see it, the exit gate gains a prose check so the approver is still asked — the same
pattern the `close` phase already uses for its off-gate receipts.

**A runaway code fence in `phases/01-requirements.md`** swallowed 59 lines, turning three artifact
specifications and a section heading into sample code. This was the migration's insertion landing
inside an existing fence. The fence now wraps only the `AQ-NN` example it was meant to.

### Report filenames use one convention (#36)

Three were in use simultaneously: the phase bodies wrote `phase09-report.html`, the registry's
optional lists said `phase9-report.html`, and `docs/commands.md` documented `<slug>-report.html`.
`03-foundation.md` alone used both the padded and unpadded forms.

Two things were actually broken by it, not merely untidy. `commands/sdlc-gate.md` pre-checks the
**visual** report by slug, so a team following the phase definition wrote `phase09-visual.html`
while the gate looked for `09-monitoring-visual.html` and reported it missing. And the registry's
`artifacts.optional` entries could never match a real file under either of the other conventions,
so those entries were dead.

All 38 references now use `<slug>-report.html` / `<slug>-visual.html`. The slug wins because it is
what `generate_phase_report.py` is invoked with, and the only form that survives the non-numeric
`build` and `close` phases.

### `/sdlc-spike` and `/sdlc-doctor` are documented (#32)

Both shipped and appeared nowhere in `docs/commands.md` — not the contents, the overview table, or
the additional-commands table. Spikes are a first-class part of the method with their own Phase 2
step, and `/sdlc-doctor` is the single most useful command for a first-time setup (it catches the
missing interpreter, the rails script without its executable bit, the unset secret — each of which
otherwise fails silently). A reader working from the reference would conclude neither existed.

Both added, and the stale "Eight commands" count corrected to ten.

### Gate 2 catches less than the docs claimed (#30)

`docs/templates-artifacts.md` stated that Gate 2 fails on "any remaining `[bracket text]`, `TODO`,
or `TBD`". It does not. The real set is exactly six strings — `TODO`, `TBD`, `${`, `PLACEHOLDER`,
`[INSERT`, `<!-- REQUIRED:` — and **bare bracket prose is not among them**, deliberately: templates
use `- [ ]` checkboxes and `[text](links)` throughout, so a general bracket rule would fail nearly
every artifact.

The consequence is that `[Describe the situation]` left in an ADR passes completeness. Overstating
what a gate checks is worse than understating it — it turns a tripwire into a proofreader in the
reader's head, and then the proofreading stops being done. All three docs that list the markers now
state the real set and name the gap.

The same docs described `<!-- REQUIRED: ... -->` as "not a placeholder to fill, but a validation
hint", which reads as *leave it in place* — while its presence is exactly what fails the artifact.
It is a template-enforcement marker: **delete it once you have written the section it names.** That
deletion is the completeness contract, and nothing had ever said so.

### The rails that catch the next one

`scripts/tests/test_registry_docs_consistency.py` asserts that:

- every registry-required artifact has a `### <name>` spec in its phase definition, appears in
  `docs/phase-lifecycle.md`'s Required Artifacts table, and is not simultaneously listed as optional
- report filenames use the registry slug, never `phase9-` or `phase09-`
- every shipped command appears in `docs/commands.md`, and the additional-commands count matches
  its own table
- all three docs that list Gate 2's placeholder markers match `check_gates.PLACEHOLDER_MARKERS`,
  with the specific `[bracket text]` false claim kept as a named regression

Every check was verified by reintroducing the original defect and confirming it fails — a guard
that has never failed is a configuration, not a control.

## 1.0.0 — 2026-07-31

**Breaking. Gates that previously passed will now block.** Read the migration note before upgrading
an engagement that is mid-flight.

### Human work now leaves a receipt (Fix 3)

Of the 110 artifacts across the standard's ten worked-example ledgers, 65 were machine artifacts,
**3** were human receipts — all in Phase C — and **42** were human work that left no trace at all.
The threat review. Every spike. The cold README checkout. The rollback rehearsal. The alert drill.
The go/no-go. Each one load-bearing, each one unauditable a year later.

They were triaged rather than mechanically converted, because "add an artifact for each of the 42"
would have been wrong for 24 of them and the standard warns against exactly that kind of scaffolding
growth. See `FIX-3-TRIAGE.md` in the delivery-standard repo for the full reasoning.

**Twelve required receipts** — the phase now blocks without them:

| Phase | Receipt |
|---|---|
| 1 | `decision-list.md` |
| 2 | `spike-findings.md`, `threat-model.md`, `nfr-proving-plan.md`, `walking-skeleton-definition.md` |
| 3 | `data-flow-brief.md` |
| 7 | `readme-verification.md`, `runbook-walkthrough.md` (service/app only) |
| 8 | `rollback-rehearsal.md`, `go-no-go-record.md`, `secrets-rotation-record.md` |
| 9 | `drill-record.md` |

Four of these already existed as optional entries (`go-no-go-record.md`, `drill-record.md`) or had a
spec but no registry entry (`threat-model.md`); the rest are new.

**Eleven optional receipts**, recorded when the work happens and surfaced to the approver at
sign-off rather than blocking: `po-decision-record.md`, `tooling-record.md`, `workshop-brief.md`,
`scope-out-record.md`, `adversarial-review-record.md`, `consistency-check-record.md`,
`spec-audit-record.md`, `rollout-shape-decision.md`, `what-healthy-table.md`,
`fatigue-review-record.md`, `outcome-metric-first-read.md`.

**Six items got no artifact deliberately** — branch protection, the deployed skeleton, the security
gates having fired, the outcome metric ticking, the per-merge metrics line and the provenance log.
These are states of the world, not documents. A markdown file asserting "branch protection is on" is
weaker than reading the setting, and goes stale silently. `/sdlc-doctor` already checks one of them;
two others are fleet observability, tracked separately.

**Six more got none** because they are already inside a parent artifact the gate checks (error
specs, the traceability matrix, user stories, the data model), or because the receipt would be
ceremony: the non-author approval is recorded by GitHub and enforced by branch protection, and a
"the grader was read" receipt records a claim rather than a fact.

### Waivers, in the artifact and never silent

Some of this work genuinely will not happen — there is no live carrier sandbox to spike against, no
client ops engineer to walk the RUNBOOK. A gate with no escape gets worked around, and the
workaround leaves no trace, so the escape is built in and made loud.

A required receipt may carry `WAIVED: <name> — <reason>`. The gate accepts it and reports it, **by
name**, in the record the approver signs against. Both halves are required: a waiver naming nobody
is the thing being prevented. A *missing* file still blocks — the escape is from the work, not from
the record.

### `risk-signoff` — the HIGH-risk sign-off is now enforced

The standard has always required a named human to accept the risk on a `risk:high` change — "a
person, by name. Not a thumbs-up." It was convention in a PR comment that nothing templated and
nothing checked.

A new required status check fails any `risk:high` PR with no line of the form
`SIGNED-OFF-BY: <name> — <sentence>` in the body or a comment. The sentence is required; a bare name
does not satisfy it. It is a check rather than a committed receipt because a file under `.sdlc/`
would describe a merge that already happened, and the acceptance has to exist before the merge.

Added to `branch-protection.json`'s required contexts. Existing repos must re-apply the ruleset
(`scripts/rails/apply-branch-protection.sh`) or the check will run without being required.

---

## Migration — engagements already in flight

**The failure is loud and local.** On the next `/sdlc-gate` the phase reports each missing receipt by
name, with the artifact spec in the phase body describing what it must contain. Nothing silently
changes behaviour; nothing is deleted.

**You have three honest options per receipt:**

1. **Write it** — if the work happened, record it now while people still remember. This is the case
   for most of them, and the reason the receipts exist.
2. **Waive it** — if the work genuinely did not happen, create the file with
   `WAIVED: <name> — <reason>`. The gate accepts it and the record says who decided and why.
3. **Do the work** — if it did not happen and should have, the gate has just told you something
   worth knowing. That is the point.

**What we do not recommend:** reverting to 0.10.0 to clear the gate. A phase that closed without a
threat model closed without a threat model; the previous version simply did not ask.

**Re-apply branch protection** so `risk-signoff` becomes required rather than merely present.

**Phase 7 is project-type aware.** `runbook-walkthrough.md` is required only for `service` and `app`
projects — a library, CLI or skill has no RUNBOOK to walk, and the gate now agrees with the phase
body about that.

---

## 0.10.0 — 2026-07-16

- **Every stale CI pin bumped, none blind.** `setup-dotnet` v4→**v6**, `checkout` v4→**v7**,
  `upload-artifact` v4→**v7**, `download-artifact` v4→**v8** (38 pins). `setup-node@v7` and
  `setup-python@v6` were already current. The filed issue named only setup-dotnet; the others were
  found by inventorying the whole surface and were *three and four* majors behind.
- **`NodeTool@0` is deprecated and was silently wrong.** The ADO pack mapped `node` to it; Learn says
  verbatim "This version of the task is deprecated; use `UseNode@1`". The migration renames the
  input — `versionSpec` → `version` — so bumping the task without the input would emit a broken
  pipeline. This is exactly the non-uniformity the `toolchain_map` exists to absorb: the fix is two
  values in one file, and the node stack pack never learned a thing. (`UseDotNet@2` and
  `UsePythonVersion@0` are confirmed current — no `@3`/`@1` successor exists for either.)
- **Runner floor:** the node24 line (setup-dotnet v5+, checkout v5+, upload-artifact v6+) requires
  **Actions Runner ≥ v2.327.1**. GitHub-hosted is well past it; a stale self-hosted runner fails all
  of them together. That is the one precondition this release carries.
- **Recorded because no release note says it:** setup-dotnet v5 dropped `signed` and `validated`
  from `dotnet-quality`, and passing them now *throws*. Visible only by diffing `src/setup-dotnet.ts`.
  The kit doesn't use the input; a client repo might.
- **Client-repo warning, documented in the pack:** setup-dotnet ≥ v5.4.0 validates `global.json`
  strictly, so `"version": "10.0.*"` now hard-errors (upstream #753, open). The wildcard was never
  supported per Microsoft's docs — the action was lax since 2022. This kit ships no `global.json`,
  but a client repo with a wildcard one fails at Setup toolchain.
- Verified as **not** applicable rather than assumed: checkout v7's new fork-PR block (its source
  returns early unless `workflow_run.event` starts with `pull_request` *and* the head repo is a fork;
  the deploy job is gated to `main` and checks out no fork ref), and download-artifact v5's path
  change (scoped to downloads *by ID*; deploy-dev downloads by name).
- The flagship golden test now pins `setup-dotnet@v6` / `dotnet-version: '10.x'`. It had **no**
  version assertion, which is why the pin rotted unnoticed — the Node profile had one and stayed
  current. A test cannot detect upstream staleness; that stays a periodic human check.

## 0.9.0 — 2026-07-16

- **The eval-gate seam is finished; the last .NET leak is closed.** The optional eval-gate job bound
  only its `--filter` to the stack and hardcoded `dotnet test` around it, so every stack — Node,
  Python — was shipped a .NET invocation. Binding the filter alone was the design error: a filter
  value is meaningless without the runner flag that consumes it, and that flag's syntax is
  runner-specific (`--filter "Category=X"` / `-t "@x"` / `-m "x"`). `<<CI_EVAL_TEST_FILTER>>` is
  replaced by `<<CI_EVAL_CMD>>`, filled from a whole `ci-profile.eval_gate.command`. The seam
  vocabulary is still nine tokens. A Node repo's pipeline now contains no `dotnet` anywhere, which
  the golden test asserts over the whole file rather than just the blocking job.
- **The .NET eval gate was fake, on every SDK, and now fails closed.** `dotnet test --filter`
  matching ZERO tests exits **0** — "No test matches the given testcase filter" is a *warning*, and
  the trx is still written with `total="0"` and `outcome="Completed"`. Verified empirically on SDK
  8.0.129, 9.0.316 and 10.0.301. So the flagship profile's gate would have gone green having run
  nothing, and its trx artifact would have looked like a clean pass. The command now ends with
  `-- RunConfiguration.TreatNoTestsAsError=true`, verified on all three SDKs in all three states:
  zero-match → 1, matching filter → 0, failing fixture → 1. (`/p:FailIfNoTestsFound` and
  `/FailWhenNoTestsFound` do not exist — they appear in no shipped SDK. Microsoft.Testing.Platform
  fails closed natively with exit 8; classic VSTest `dotnet test` does not.)
- **Recorded, because it is a silent-green trap:** `Category=` is xUnit's trait key. MSTest and NUnit
  spell it `TestCategory=`, and on MSTest a `Category=` filter matches zero tests *even when every
  fixture is correctly tagged* — which, before the setting above, was exit 0.
- **The Node eval gate would have been fake, and now fails closed.** `vitest run -t` matching ZERO
  tests exits **0** (verified on vitest 3.2.7 and 4.1.10) — so a renamed or typo'd tag would have
  passed the gate green having run nothing. The declared command carries a guard. The obvious guards
  don't work and were each verified not to: `--passWithNoTests=false` covers a different condition
  (no test *files*), the JSON's `success` is `true` on a zero-match run, and `numTotalTests` counts
  *collected*, not matched. Only `numPassedTests + numFailedTests` discriminates. Prior to this the
  Node pack's own comment recommended the unguarded command as the adaptation path.
- **The Python eval gate is real without a guard**, for a reason worth recording: pytest counts
  `testscollected` *after* deselection, so a marker matching nothing is "no tests collected" and
  exits 5. `--strict-markers` is kept but does **not** protect the `-m` expression — it catches a
  marker typo'd on a *test*, the mirror-image hole.
- `eval_gate.command` is covered by the single-line rule and fails the install closed when absent —
  a rule that held for four commands but not the fifth was a gap, not a policy.
- The eval results contract is now a plain `eval-results/` directory (the ADO pack no longer
  publishes from `$(Agent.TempDirectory)`): a platform variable inside a stack-declared command would
  leak ADO's vocabulary into the stack layer, which is the coupling the seam exists to break.

## 0.8.0 — 2026-07-16

- **Angular frontend pack.** The flagship microsoft-enterprise profile declares `angular-17`, which
  until now degraded to the framework-agnostic UX reviewer plus a warning. It now composes an
  Angular-aware `ux-reviewer` over the generic one — checks for the states the async pipe swallows,
  `OnPush` subtrees that never repaint after an in-place mutation, NG0100 (dev-only, so it goes
  silent rather than away in production), resolver-blocked navigation, `[disabled]` vs `disable()`,
  subscription teardown, and focus management on navigation. Version-gated: the reviewer reads
  `@angular/core` from `package.json` before citing syntax, because a v17 repo should not be
  reviewed against v20 features.
- **`angularjs` is explicitly unsupported** rather than merely unlisted — AngularJS 1.x is a
  different framework, and it degrades with a warning instead of quietly pulling the Angular pack
  (the same distinction that keeps `react-native` off the React web pack).
- **Every axis the flagship profile declares now has a pack**: a warning-free install is now pinned
  by a test, so any future axis that silently degrades fails the suite.

## 0.7.0 — 2026-07-16

- **Two new stack packs: `node-typescript` and `python`.** Every shipped profile now composes a
  realized stack instead of degrading to the neutral core: starter (typescript/node) and
  creative-tooling (python/uv) join microsoft-enterprise (csharp). Each pack brings its stack
  standards (spliced into `CLAUDE.md`), deep rules, an `api-pattern` skill, tooling permissions
  merged into `settings.json`, and a `ci-profile.yaml` — so its pipeline is realized through the
  mechanical seam rather than hand-adapted. Both are authored, not harvested; each README says so.
- **starter and creative-tooling now declare `ci_cd.platform: github-actions`.** Without it the
  CI/CD axis degraded and those repos kept the core's placeholder pipelines — which carry .NET
  reference commands. The core installs the same workflow files either way; declaring the platform
  replaces placeholders with realized ones.
- **The customer profile's `quality.coverage_minimum` now sets the CI coverage floor**, overriding
  the stack pack's declared default (the profile is the later, more specific layer). starter states
  60; its gate now enforces 60, where the pack's default would have imposed 80.
- The coverage gate accepts any cobertura report under `coverage/` (`coverage.cobertura.xml`,
  `cobertura-coverage.xml`, `coverage.xml`) — report names differ per stack and none is wrong, so
  the platform adapts instead of each stack renaming its output.

## 0.6.0 — 2026-07-16

- **The stack↔CI/CD seam is now mechanical.** It was documentation-only: the CI/CD packs hardcoded
  .NET commands with comments naming where a human had copied them from `ci-profile.yaml`, a file
  the installer never read and that never reached a repo. Composing a non-.NET stack with either
  CI/CD pack would have installed a .NET pipeline. The packs' workflows now carry a closed
  vocabulary of nine `<<CI_*>>` seam tokens which the installer fills at compose time from the
  resolved stack pack's `ci-profile.yaml` (commands, toolchain version, coverage floor) and the
  CI/CD pack's own `toolchain_map` (platform knowledge: which setup action installs a toolchain and
  what its version input is called). Adding a stack is now one `ci-profile.yaml`, not a per-stack
  copy of every pipeline.
- Fail-closed: an unmapped `toolchain.id`, a missing ci-profile value, a multi-line command, or a
  residual seam token in an installed file each fail the install with a clean error — a literal
  token can never reach a client repo. Phase-3 repo blanks (`{{SOLUTION_OR_PROJECT}}`,
  `<<CI_WORKFLOW_NAME>>`, …) pass through untouched.
- Degrade-independent: a CI/CD pack composed without a stack pack keeps its seam tokens and prints a
  warning naming the files to hand-adapt, rather than failing.
- Azure DevOps templates generalized: `use-dotnet.yml` → `setup-toolchain.yml`,
  `dotnet-restore-build-test.yml` → `restore-build-test.yml`.

## 0.5.0 — 2026-07-16

- **spec-gate** (harness): a deterministic blocking check — a pull request that changes source
  without a committed `specs/NNNN-*.md` in the diff is refused. "No spec, no build" was previously
  a grader warning; it is now mechanical. Recorded escape: the `no-spec:chore` label plus a reason
  in the PR description. Added to the required-status-check set on both CI platforms (the merge bar
  is now five blocking checks).
- **Coverage floor enforced** (harness): the GitHub CI rail gained the cobertura-parsing floor step
  the Azure DevOps pack already had — a sub-threshold run now exits non-zero instead of uploading a
  low number to a report nobody reads. Fails closed when no coverage report is produced.
- **Stop hook runs tests by default**: `RAILS_STOP_RUN_TESTS=0` opts out (was opt-in). The AI can no
  longer end a turn on red tests in a default install.
- Shakedown drills added for both new gates in the core and both CI/CD packs.

## 0.4.0 — 2026-07-16

- Install manifest: `install_harness.py` writes `.claude/harness-manifest.json` — plugin version,
  composed packs, and a sha256 of every file *as installed* (the pristine baseline that makes
  adaptation detectable later).
- `/sdlc-upgrade` + `scripts/upgrade_harness.py`: safe upgrades for installed harnesses. Files
  still factory-original are replaced with the new version; repo-adapted files are left alone;
  files changed on both sides are written beside the original as `<file>.harness-new` for a
  deliberate merge. Dry-run by default; `--apply` to execute. Legacy installs (no manifest) are
  adopted on first apply.

## 0.3.0 — 2026-07-16

- Profile-aware pack composition: the harness installer composes packs along four axes — stack
  (`stack.backend.language`), CI/CD (`stack.ci_cd.platform`), frontend (`stack.frontend`), and
  tools (`tools: [...]`) — on top of the neutral core; each axis degrades independently with a
  WARNING when no pack exists.
- Team `.mcp.json` composition: the installer writes the team's shared MCP server set at the repo
  root (core servers plus pack additions), re-merged on every run.
- CLAUDE.md splice data-loss fix: installing the harness no longer loses locally edited content in
  the governance `CLAUDE.md` sections it manages.
- Commands reference plugin files via `${CLAUDE_PLUGIN_ROOT}` instead of hardcoded install paths.
- Secret-scan gate added to the harness payload.
- Stop-gate hook fixed to the exit-0 + JSON block contract, so the block reason reaches Claude.

## 0.2.0

- SDLC lifecycle + initial harness payload.
