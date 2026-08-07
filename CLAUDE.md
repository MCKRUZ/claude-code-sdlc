# claude-code-sdlc — Development Instructions

## What This Is
A Claude Code plugin that orchestrates the full SDLC lifecycle using company-configurable profiles. It makes the AI-SDLC methodology executable within Claude Code.

## Architecture
- `plugin.json` — Plugin manifest (entry point for Claude Code)
- `SKILL.md` — Main skill definition (loaded when plugin activates)
- `commands/` — 26 slash commands (`/sdlc`, `/sdlc-setup`, `/sdlc-status`, `/sdlc-next`, `/sdlc-gate`, `/sdlc-enhance`, `/sdlc-coach`, `/sdlc-review`, `/sdlc-intake`, `/sdlc-brief`, `/sdlc-spec`, `/sdlc-phase-report`, `/sdlc-audit`, `/sdlc-feature`, `/sdlc-experience`, `/sdlc-data`, `/sdlc-rules`, `/sdlc-channel`, `/sdlc-evals`, `/sdlc-harness`, `/sdlc-upgrade`, `/sdlc-revise`, `/sdlc-audit-artifacts`, `/sdlc-version`, `/sdlc-refresh`, `/sdlc-retro`)
- `agents/` — 13 agents (orchestrator, requirements-analyst, compliance-checker, section-evaluator, narrative-enhancer, gate-repair, multi-reviewer, discovery-analyst, feature-architect, visual-designer, conversation-designer, data-analyst, bizreq-analyst)
- `channels/` — Cross-profile channel descriptor library (`_schema.yaml`, `ag-ui.yaml`, `voice.yaml`, `chat.yaml`) — the delivery-surface vocabulary the channel layer reads
- `profiles/` — Company/stack YAML configs with compliance gates
- `phases/` — Phase definitions (9 phases: 0, 1, 2, 3 Foundation, build loop, 7, 8, 9, close). The 4/5/6 gap is intentional — the batch Implementation/Quality/Testing phases are replaced by the continuous Build loop. Phase identity/ordering is owned by `scripts/phase_model.py` reading `phases/phase-registry.yaml`.
- `references/` — Progressive disclosure docs (loaded on-demand)
- `templates/` — Artifact templates copied to target projects
- `scripts/` — Python automation (uv runtime)
- `hooks/` — PowerShell hooks for session/phase context injection

## Conventions
- Profile YAML validated against `profiles/_schema.yaml`
- Phase definitions use RFC 2119 keywords (MUST/SHOULD/MAY)
- Scripts use Python 3.12+ via uv
- State tracked in target project's `.sdlc/state.yaml`

## Design Rule: Standalone or Workflow
Every agent and command is a library part, not just a pipeline stage. Each one MUST be runnable
two ways: (1) composed into the phase workflow (reading `.sdlc/state.yaml` and the intake
catalog), and (2) standalone, pointed at arbitrary inputs with no `.sdlc/` present (degrade
gracefully: provisional IDs, explicit output paths, note the missing context in output headers).
When adding a new agent or command, document both modes in its file. `discovery-analyst` /
`/sdlc-brief --docs <path>` is the reference implementation of this pattern.

## Key Features
- **Frozen layers** — Token-efficient phase summaries in `.sdlc/context/layers/` for cross-phase continuity
- **3-tier context** — Foundation (always loaded), frozen layers (per-phase), references (on-demand)
- **7-gate validation** — Integrity, completeness, metrics, compliance, consistency, quality, exit criteria
- **Narrative enhancement** — `/sdlc-enhance` generates stakeholder-friendly `.narrative.md` companions
- **Conversational coaching** — `/sdlc-coach` for adaptive guided dialogue through phases
- **Artifact checksums** — SHA-256 dirty tracking; gate checks skip unchanged artifacts
- **Smart repair** — `gate-repair` agent auto-fixes structural gate failures (missing templates, placeholders)
- **Dependency enforcement** — `check_dependencies.py` validates section DAG and implementation order
- **Multi-perspective review** — `/sdlc-review` with adversarial, edge-case, and council modes
- **Brownfield detection** — Auto workspace scan in Phase 0 for existing codebases
- **Structured error specs** — Accepts/Returns/Errors required for P0/P1 requirements
- **Cross-artifact validation** — File reference checking between markdown artifacts
- **Question-to-file** — HITL open questions persisted to `open-questions.md` for audit trail
- **Test expansion** — Healer/Expander/bug-to-test patterns in the Build loop
- **Parallel review resolution** — Batch review findings by file in the Build loop
- **Session health check** — Opt-in pre-flight build verification at the start of Build-loop sessions (agent-executed, cross-platform)
- **Visual regression testing** — Optional screenshot capture during Build-loop E2E with baseline comparison (requires orchestrator integration)
- **Single-change guardrail** — Intentionally redundant constraints preventing concurrent spec work in the Build loop
- **Phase-scoped evaluation criteria** — `evaluation_criteria` with optional `phases` array for non-code artifact quality rubrics
- **Empirical metrics** — JSONL logging in `check_gates.py`, `validate_frozen_layer.py`, and `section-evaluator` agent to `.sdlc/metrics/`
- **Document intake** — Opt-in corpus analysis in Phase 0: scans external docs (RFPs, API specs, vendor docs), generates per-doc summaries with DOC-NNN IDs, creates token-budgeted intake index (Tier 1.5), enables Phase 1 requirement-to-source traceability
- **Spec authoring & Definition-of-Ready enforcement** — `/sdlc-spec` is the Build-loop Intent beat: `new_spec.py` scaffolds `specs/NNNN-name.md` (auto-allocated id, risk tier a first-class frontmatter field) and `check_spec.py` enforces the DoR — required sections, valid risk tier, scope in *and* out, no placeholders — plus a vague-line lint that flags acceptance checks likely to fail the vague-line test (advisory). The agent proposes the risk tier; a human confirms it. Runs standalone or in-workflow (logs to `.sdlc/metrics/spec-log.jsonl`)
- **Risk tier drives gate depth** — `risk_model.py` is the single source of truth for the risk taxonomy and the checking ladder (every tier blocks on CI + grader + correctness + non-author approval; HIGH adds a security pass and named sign-off; a gated path forces the security pass regardless of tier). `check_spec.py` enforces a spec's Checking Plan depth against its risk tier, so the tier sets the climb mechanically rather than as a label
- **Spec-backlog tracking (specs are the Build unit)** — the Build loop is spec-driven (one spec = one branch = one PR); `track_specs.py` derives backlog progress (status/risk breakdown, in-flight list, WIP-cap breaches) straight from spec frontmatter, so there is no separate tracker to drift. The section-plan/`sections-progress.json` model was retired from the Build loop; `check_dependencies.py` + `/deep-plan` sections are now Phase-2 *design* aids that feed the spec backlog
- **Steering scorecard (outcomes, not activity)** — `scorecard.py` records loop outcomes to `.sdlc/metrics/loop-events.jsonl` and reports the standard's numbers (accepted-as-is, review-wait median, rework/revert, bounce-back, escaped bugs, the DORA four; security-review wait on its own line). Reads "no data" rather than a fabricated zero, and *refuses* to record the forbidden activity metrics (velocity, story points, PR count, LOC). `steering-scorecard.md` is the client-facing artifact
- **Finding memory & disposition tracking (Context Repair, Increment A)** — `/sdlc-review` now writes a machine-readable `## Gate Results` block (id/category/severity/target/disposition/detail) that `record_findings.py` parses into an append-only ledger `.sdlc/metrics/findings-log.jsonl`, so a finding survives the report being overwritten and its disposition is tracked across rounds. `findings_model.py` is the single source of truth for the severity↔gate mapping and the disposition state machine (FIXED/SPLIT/ACCEPTED_RISK/POSTPONED/OPEN) with honest counting — a mislabeled disposition (SPLIT without id+owner, an AI signing ACCEPTED_RISK) still counts as debt. The review stays **advisory** (the grader advises, never blocks); only the **FIXED-claim check** may block (`report --strict` exits 2) — a finding marked FIXED whose target file never changed is a factual false claim, not a judgment. The ledger is what later makes a recurring finding promotable into a permanent check (Phase C: "findings become new checks"). Runs standalone (`--repo`) or in-workflow (`--state`). See `docs/proposals/context-repair-loop.md`
- **Multi-discipline channel layer** — an additive layer giving Data, Design, and Bizreq first-class seats and organizing a feature around its **customer channel of use**. `channels/` holds schema-guarded YAML descriptors (`ag-ui`, `voice`, `chat`) whose acceptance dimensions ride a spec's *existing* `## Acceptance Checks`; `validate_channel.py` guards the library and `check_channel.py` is an advisory (exit 0) DoR lint that never changes a ready/not-ready verdict. Six commands (`/sdlc-feature`, `/sdlc-experience`, `/sdlc-data`, `/sdlc-rules`, `/sdlc-channel`, `/sdlc-evals`, `/sdlc-harness`, `/sdlc-upgrade`) drive five interview-driven discipline agents (`feature-architect`, `visual-designer`, `conversation-designer`, `data-analyst`, `bizreq-analyst`) that also serve as `/sdlc-review` council lenses (7 viewpoints). A spec's optional `channel:` frontmatter field binds the surface; a phase-spanning `.sdlc/decision-log.md` (owner + 2-business-day clock, surfaced in `/sdlc-status` via `track_decisions.py`) and optional discipline sign-offs on the state sign-off record round it out. The protected core (`check_spec.py`, `check_gates.py`, `section-evaluator`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `/sdlc-coach`, `/sdlc-spec`) is byte-for-byte unchanged. See `references/channel-model.md` and `references/team-model.md`
- **Close handoff-report generation** — Phase C Step 4 ("Hand over the record") is a two-pass draft: `generate_handoff_report.py` does the deterministic assembly first — phase report index, per-phase gate/sign-off table (from `state.yaml`), metrics history (reusing `scorecard.py`), spec backlog (reusing `track_specs.py`) — filling the existing `final-handoff-report.md` template and marking the judgment sections (outcomes vs the Phase 0 statement, debt log, open items, dashboard handover) with `[Fill: ...]` slots for the Explore agent to enrich. Honest by design (missing data reads "no data", never a fabricated zero) and refuses to clobber a human-edited report without `--force`. Runs standalone (`--repo`) or in-workflow (`--state`)
- **Artifact update & audit** — an additive, advisory layer for *changing* a pre-Build artifact after the fact and auditing the trail. `artifact_model.py` owns the change-ledger entry shape and the staleness disposition state machine (`OPEN → REFRESHED | ACKNOWLEDGED | NOT_AFFECTED`) with honest counting (ACKNOWLEDGED needs an owner, NOT_AFFECTED a reason, or it still counts as debt); `artifact_lineage.py` harvests declared `upstream → downstream` edges (frozen-layer `source_artifacts`, id references, explicit markdown paths) with a labeled **coarse** phase-order fallback and cycle-safe traversal. `audit_artifacts.py` (`record` / `impact` / `report`, **exit 0 always**) records changes to an append-only `.sdlc/metrics/artifact-log.jsonl` — its **own** JSONL, never inside `gate_results`, so `/sdlc-audit` output is byte-identical with or without it — and flags a downstream as a *stale candidate* when an upstream changed after it last did. `/sdlc-revise <id|file#section>` is the PM-facing write path (discipline agent proposes, named human decides; records the why to the ledger **and** a linked `DL-NN` decision-log item; re-gates; shows impact to disposition). `/sdlc-audit-artifacts` is the read-only sibling to `/sdlc-audit` (freshness dashboard, `--impact`, `--history`). A `record --scan` step in `/sdlc-next` captures direct edits at advance time; `/sdlc-status` surfaces a stale rollup. The protected core (incl. `advance_phase.py`) is byte-for-byte unchanged. See `references/artifact-lifecycle.md`
- **Artifact versioning & draft+confirm auto-refresh** — an additive, advisory package built on the artifact-update-audit layer that (1) gives every pre-Build artifact a **content history** (diff/rollback) and (2) back-propagates a merged spec's shipped reality **up** into `requirements.md`/`epics.md`/`feature-brief.md`/`business-rules.md`. One new **pure** module `version_model.py` derives the ordinal-keyed version list `v1..vN` straight from the change-ledger's existing 16-hex SHA-256 hashes — the content-addressed object store (`.sdlc/versions/objects/<xx>/<16hex>`) is just those hashes rehydrated to bytes, so there is **no second index** to drift (a dup-hash rollback is its own ordinal, rendered "restored from vX"; a pre-existing file with no ledger entry synthesizes a `v1` baseline, never a crash). The `version` + `refresh` verbs **fold into `audit_artifacts.py`** (the sanctioned extend target; its existing `record`/`impact`/`report` output stays byte-identical) so one best-effort `capture()` seam keeps content↔hash lockstep. `/sdlc-version {list,show,diff,rollback,gc}` is the read/undo path (rollback is preview→named-human-confirm, append-only, `--ack-signoff` for signed-off artifacts, refuses on an uncaptured version; `gc` is cross-ledger refcounted and protects unknown sign-offs). `/sdlc-refresh {detect,scan,draft,apply,reject,status}` is the reverse-propagation path: **review-first / divergence-aware** (a faithful spec drafts nothing without `--draft`), the discipline agent edits only a `.proposed`, a named human echoes the reviewed diffhash to `apply` (One Rule), and the refresh lands as a rollback-able `refreshed` version attributed to the spec via a `source_spec` **rider key** (`artifact_model.py` unchanged). Both write **nothing** to `state.yaml` (re-gating stays the command layer's `/sdlc-gate` job) and exit 0 on every path; the object store and `.proposed` drafts are **gitignored** local safety nets (a fresh clone/CI degrades to "content not captured", documented override to commit). The protected core is byte-for-byte unchanged. See `references/artifact-versioning.md`
- **Cross-ledger retro roll-up** — `retro_report.py` (surfaced as `/sdlc-retro`) is the read-only report that turns the accumulated ledgers into retro input: recurring findings grouped by category+target across review rounds (candidates for a permanent check — the "findings become new checks" feed), repeat-stale artifacts, the **refresh funnel** per merged spec and per upstream stem (detected → drifted → refreshed → rejected → open — the tuning signal for the divergence heuristic), and a combined disposition-debt rollup naming each source ledger. Same discipline as the scorecard: "no data" over fabricated zeros, patterns keyed by category/artifact/stem and **never by actor** (no ranking flag exists), refuses activity metrics, writes nothing, exit 0 on every path, dual-mode `--repo`/`--state`
- **Command contract lint** — `scripts/tests/test_command_contracts.py` is the static half of the command-prose safety harness: it extracts every `uv run … scripts/<name>.py` invocation from fenced blocks in `commands/*.md` and validates script existence, subcommand chains, and every `--flag` against live `--help` output (cached subprocesses), plus agent-name and `references/`/`templates/` path cross-references. Conservative by design (ambiguous → skipped, never a false violation; intentional exceptions live in an explained allowlist) with self-tests proving each detection class fires. Live "does-the-model-follow-the-doc" evals remain out of scope

## Testing
```bash
uv run scripts/validate_profile.py profiles/microsoft-enterprise/profile.yaml
uv run scripts/init_project.py --profile profiles/microsoft-enterprise/profile.yaml --target /tmp/test
uv run scripts/check_gates.py --state /tmp/test/.sdlc/state.yaml --phase 0
uv run scripts/validate_frozen_layer.py --state /tmp/test/.sdlc/state.yaml --phase 0
uv run scripts/track_artifacts.py --state /tmp/test/.sdlc/state.yaml --snapshot
uv run scripts/check_dependencies.py --state /tmp/test/.sdlc/state.yaml
uv run scripts/intake_documents.py --state /tmp/test/.sdlc/state.yaml
uv run scripts/new_spec.py --repo /tmp/test --name "duplicate claim 409" --risk HIGH
uv run scripts/check_spec.py --spec /tmp/test/specs/0001-duplicate-claim-409.md
uv run scripts/track_specs.py --state /tmp/test/.sdlc/state.yaml
uv run scripts/scorecard.py record --state /tmp/test/.sdlc/state.yaml --type spec_merged --field accepted_as_is=true
uv run scripts/scorecard.py report --state /tmp/test/.sdlc/state.yaml --window-days 14
uv run scripts/generate_handoff_report.py --state /tmp/test/.sdlc/state.yaml
uv run scripts/record_findings.py record --report /tmp/test/.sdlc/artifacts/02-design/review-report.md --repo /tmp/test
uv run scripts/record_findings.py report --repo /tmp/test --strict
uv run scripts/audit_artifacts.py record --scan --repo /tmp/test
uv run scripts/audit_artifacts.py impact FR-012 --repo /tmp/test
uv run scripts/audit_artifacts.py report --repo /tmp/test --json
uv run scripts/audit_artifacts.py version list requirements.md --repo /tmp/test
uv run scripts/audit_artifacts.py version diff requirements.md prev latest --repo /tmp/test
uv run scripts/audit_artifacts.py version rollback requirements.md prev --repo /tmp/test
uv run scripts/audit_artifacts.py refresh detect --spec specs/0001-duplicate-claim-409.md --repo /tmp/test
uv run scripts/audit_artifacts.py refresh scan --repo /tmp/test --json
uv run scripts/audit_artifacts.py refresh status --spec specs/0001-duplicate-claim-409.md --repo /tmp/test
uv run scripts/retro_report.py --state /tmp/test/.sdlc/state.yaml --json
uv run scripts/retro_report.py --repo /tmp/test --window-days 30
uv run --project scripts python -m pytest scripts/tests/ -q
```
