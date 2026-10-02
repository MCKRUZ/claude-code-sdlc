# SDLC Studio — every remaining command, as deterministic as it can be (v2)

**Date:** 2026-10-02 · **Repo:** `C:\Users\kruz7\OneDrive\Documents\Code Repos\MCKRUZ\claude-code-sdlc` (master @ 903bf03; `feat/pipeline-evidence` read for its shapes and pattern) · **Plugin** 1.6.2 (+unreleased) · **Studio** `studio/` 0.1.0 · **CLI measured:** Claude Code 2.1.288

---

## 0. What changed from v1, and why

v1 answered "how do I get every command into the app" and reached for the chat (a per-command thread) or a headless model run for almost every GROUP 3 command. That was the wrong problem. The owner's principle is: **take every command and make it *more* deterministic — a script, a form, a structured editor: same input, same output, no model in the loop — and keep chat only where judgment or an interview is genuinely needed.**

So v2:
- **Decomposes every command** into deterministic / LLM-assisted / judgment parts, after reading the command and its scripts, and maximises the deterministic share (§3–§5).
- **Drops the chat-thread machinery** from v1 — activity-scoped threads, the thread switcher, the "adapter block", grouped proposal cards, new-instance proposals. The structured editor (`DocumentView` + `FieldEditor` + `add-instance`) already is the deterministic way to author a shaped document, and it already has an audited per-field "Draft with Claude". One stage chat, as today, reached by a *Talk it through* step with a one-line pre-seed (§2.3).
- **Counts "a button that runs a model" separately.** Five commands keep exactly one such step (review, enhance, intake summaries, brief analysis, refresh draft); each is labelled *Drafted by Claude*, shown as a candidate, and written only on *Keep*.
- **Keeps what was good:** the measured sub-agent-cannot-write finding (§6b), activities declared by the plugin (now in a separate file, because `phase-registry.yaml` is named as protected core), capability gating for older plugins, the safety rules, the file inventory, and the dependency-ordered sequencing.

**The split across the 23 commands (GROUP 2 + GROUP 3 + PARTIAL):** 10 become pure deterministic buttons; 7 become "create from template → structured editor → deterministic checks" with the chat optional; 5 keep one LLM-assisted button beside deterministic buttons; 1 (`/sdlc-coach`) stays chat. v1 had 12 commands in chat or headless-draft; v2 has 1 in chat and 5 with a single model step.

---

## 1. The labels, applied rigorously

- **DETERMINISTIC (button)** — a script, a form, or a structured-editor action. Same input, same output. No model. Examples found in the commands: scaffold from a template, allocate the next id, validate (Definition of Ready, shapes, gates, channel coverage), compute status, inject a channel's acceptance dimensions from its descriptor, append to a ledger, list, diff, export, apply the risk raise/lower rule, open a decision-log row with its 2-business-day clock.
- **LLM-ASSISTED (button that runs a model)** — not deterministic. Counted separately, shown as a candidate, written only on an explicit *Keep*, recorded in the draft ledger with its outcome (the rule `FieldEditor` already enforces for a field).
- **JUDGMENT (chat)** — an interview, contradiction analysis across a corpus, prose the person has not yet thought through, a review. Chat is used only where a form *cannot* ask the question because the question depends on the previous answer.
- **HYBRID** — a deterministic step that puts the person in the right place and then hands them to the existing stage chat: *create this document from its template, open the editor at this section, and say so to the chat*.

Two rules that follow from reading the code:
- Studio's one write path for a shaped document is `documents.setField` through `document_shape_cli.py write`; its one "new instance" path is `add-instance`. Everything deterministic below writes through those or through a plugin script — never through a model.
- A document can only be edited in the structured editor if its template has a shape. **Shapes are therefore the gating plugin work** (they were in v1 too, for a different reason).

---

## 2. The interaction model (v2)

### 2.1 Still no 22 buttons

The plugin declares each phase's **activities**; `stage_readiness.py` emits them with a computed status; the Workflow tab draws them in the plugin's declared order next to the required documents and the sign-off step. Studio hardcodes no list. Each activity has exactly one of five kinds, and the kind decides the only control it gets:

| Kind | Deterministic? | The one control | Precedent |
|---|---|---|---|
| **Run** | yes | *Run* → script → plain-language result (optionally "Export") | `PipelineEvidencePanel.tsx` on `feat/pipeline-evidence` |
| **Create** | yes | *Create* → file(s) from template(s) (and ids allocated) → opens the editor | `ensureDocumentFromTemplate` in `studio/electron/main/documents.ts` (needs an IPC) |
| **Check** | yes | *Check* → validation → PASS / ADVISE rows, each linking to the field | `SpecReadinessPanel.tsx`, `stage_readiness.py` findings |
| **Draft** | **no** (LLM-assisted) | *Draft with Claude* → candidate → *Keep* / *Discard*, recorded | `FieldEditor.tsx` per field; frozen-layer draft in `signOff.ts` |
| **Talk it through** | n/a (judgment) | Focuses the existing stage chat with a one-line pre-seed | `ChatPanel.tsx` |

Cross-stage, read-only reports live where their subject already lives — *How it is going* (retro, gate effectiveness), Settings (environment check, harness status), the document rows and editor (freshness, impact, dispositions). No new top-level screen.

### 2.2 Where activities are declared — not in `phase-registry.yaml`

v1 put the block in `phases/phase-registry.yaml`. That file is named, with `phase_model.py`, in `CLAUDE.md`'s "protected core … byte-for-byte unchanged" lists. v2 keeps that promise: activities live in a new `phases/activities.yaml`, keyed by phase id, read by a new pure module `scripts/activities_model.py` (dual-mode, tests pin that every referenced command, script, template and shape exists), and emitted by `stage_readiness.py` as an additive `activities` array. An older plugin emits nothing and the Workflow tab shows today's documents + sign-off.

```yaml
"1":
  - id: feature-brief
    label: "Decompose an epic into features and specs"
    command: sdlc-feature            # the command file the step describes; shown in the Guide tab
    kind: create                     # run | create | check | draft | talk
    creates: [".sdlc/artifacts/01-requirements/feature-brief.md"]
    then: [check: feature-brief-checks, talk: "feature-brief"]    # follow-on controls the panel offers
    optional: true
    after: [epics]
    done_when: { exists: ".sdlc/artifacts/01-requirements/feature-brief.md", complete: true }
```

### 2.3 One stage chat, with a pre-seed — and why the pre-seed is needed

The chat today is scoped to a stage and told (system prompt, `studio/electron/main/chatArgs.ts`): *follow the phase file's own step order; if the person free-types something the interview has not reached yet, acknowledge briefly and redirect back*. The optional artifacts (feature-brief, business-rules, data contract, experience docs) are conditional steps (3a, 3b, 6a, 7a) the interview may never "reach". So a person who creates `feature-brief.md` with a button and asks the chat for help would be redirected. That is the one honest reason a pre-seed is needed.

The design: *Talk it through* sends one Studio-authored user turn through the existing `sendChatMessage` — `[Studio] The person has opened .sdlc/artifacts/01-requirements/feature-brief.md (step 3a, /sdlc-feature) and is on the "Spec decomposition" section. Help with this document now.` — and `buildSystemPrompt` gains one sentence: *a message beginning "[Studio]" names the document and section the person has just opened in the editor; treat it as the current step and the owning discipline sub-agent's brief.* No new thread, no switcher, no adapter block, no tool change. `CHAT_TOOLS` and its exact-list test are untouched. One new assertion in `studio/test/chatArgs.test.ts`.

---

## 3. GROUP 2 — decomposed

Columns: **Deterministic part (button, exact contract)** · **LLM-assisted part** · **Judgment part (chat)** · **Why a form/script cannot do the judgment part** · **Plugin additions**.

| Command | Deterministic (button) | LLM-assisted | Judgment (chat) | Why not a form | Plugin additions |
|---|---|---|---|---|---|
| **`/sdlc-audit-artifacts`** | **Freshness** (Documents tab chips, stage rollup): `audit_artifacts.py report --state --json` → per artifact FRESH / STALE / dispositioned, last change, declared-vs-coarse edges labelled. **Refresh freshness** button: `record --scan --state` (ledger-only write; the button says so). **What depends on this** (editor panel): `impact <path\|id> --state --json`. **History**: already the History panel. **Disposition** (dialog on an open STALE chip): *Acknowledge* requires an owner (roster pick) → `record --disposition ACKNOWLEDGED --downstream --upstream --owner --state`; *Not affected* requires a reason → `--disposition NOT_AFFECTED --reason`. `REFRESHED` is never offered (derived by the next scan). Never touches `state.yaml`. | none | none | — | none (all verbs already have `--json`) |
| **`/sdlc-revise <id>`** | The command's eight steps are all mechanical except the new wording. **Revise…** on a section/instance in the editor runs, in order: (1) `impact <target> --state --json` shown as "changing this puts N documents at risk"; (2) `record --scan --state` (pre-image, so rollback works); (3) the editor opens on that instance for the person to edit the field(s) — the existing `setField` path; (4) a **Record this change** form: reason (required), owner defaults to the signed-in account → `track_decisions.py open --decision "Revised FR-012: <reason>" --owner <name> --state` allocates `DL-NN` and the due date (2 business days, weekend-aware, the script's own `clock_business_days`), then `record --artifact <path> --target FR-012 --event revised --actor --reason --decision-ref DL-NN --state`; (5) **Re-gate**: `check_gates.py --state --phase <id>` (the same call sign-off makes; a real gate run, shown as PASS/FAIL with the plugin's words); (6) `impact` again with disposition chips. | Optional: *Draft with Claude* on the field being revised (`FieldEditor`, already audited). | *Talk it through* if the person wants the owning discipline's view before rewording (the command's routing table is in the Guide tab; the `[Studio]` pre-seed names the target). | The ledger, decision clock, re-gate and impact are all mechanical; only the new wording is judgment, and the editor plus an optional per-field draft already covers it. A per-command thread would re-create the editor in prose. | `track_decisions.py open` (new verb, see §6); shape for `decision-log.md` (one `table` field) |
| **`/sdlc-refresh`** | On a **merged** spec (Build board): **Detect** `refresh detect --spec --state --json` (candidates tagged declared / coarse / trace-only; zero candidates shows the script's nudge verbatim). **Draft** `refresh draft --spec [stem] --state` creates the `.proposed` copies; Studio then **opens the `.proposed` in the structured editor** with the stem's shape (path `.sdlc/refresh/<spec>/<stem>.proposed` → shape `templates/phases/01-requirements/<stem>.shape.yaml`), so the person edits the proposed upstream themselves, field by field. **Preview** `refresh apply --spec <stem> --state` (no `--reviewed`) → diff + diffhash. **Apply** requires the actor to confirm the shown diff → `--actor --reviewed <hash> --reason --decision-ref DL-NN` (DL-NN from `track_decisions.py open`), `--ack-signoff` an explicit separate tick; refusals ("upstream moved since draft") shown verbatim. **Reject** requires reason + owner. **Status** `refresh status`. **Scan** across all merged specs backs the stage rollup. | **Draft the whole update with `<discipline agent>`** — one headless run (read access, no write tools) producing the full proposed stem text, written **only into the `.proposed`** on *Keep*. Labelled *Drafted by Claude*. | *Talk it through* on the `.proposed`. | Deciding what shipped vs what the requirement said is judgment, but the person can do it in the editor; the model is an optional accelerator, not the path. | none for verbs; `.sdlc/refresh/` opened by the editor (Studio allowlist, local only) |
| **`/sdlc-retro`** | *How it is going* → "What keeps happening": `retro_report.py --state --window-days N --json`; sections honour `has_data`; funnel reading guide as help text. Export rides the scorecard export. | none | none | — | none |
| **`/sdlc-audit`** (gate effectiveness) | *How it is going → Checks and gates* → "How the gates have performed": `audit_gates.py --state --json`; the <3–4 completed phases warning shown. | none | none | — | `audit_gates.py --json`, `--repo` (dual mode) |
| **`/sdlc-doctor`** | Settings → **Check this machine**: `doctor.py --repo <project> [--offline] --json` → PASS / FAIL / WARN rows with the fix line verbatim; harness-not-installed stops with the `/sdlc-setup` pointer. Fixes are not applied from Studio (chmod and secrets are a developer's). | none | none | — | `doctor.py --json` (exit codes unchanged) |
| **`/sdlc-upgrade`** | Settings → **Delivery harness**: `upgrade_harness.py --payload <plugin>/harness --target <project> --profile .sdlc/profile.yaml --json` (dry run) → classification table in the command's own words; the developer's exact `/sdlc-upgrade` line. **Apply stays out** (rewrites CI workflows, hooks, `CLAUDE.md`, `.claude/settings.json` — outside Studio's sync allowlist, and `.harness-new` conflicts need a developer). | none | none | — | `upgrade_harness.py --json` for the dry run |
| **`/sdlc-harness`** | Same panel: reads `.claude/harness-manifest.json`; absent → "No delivery harness is installed yet — a developer runs `/sdlc-harness`." (Studio's own setup wizard runs only `init_project.py`; this makes the gap visible.) Install stays out, same reason. | none | none | — | none |

---

## 4. GROUP 3 — decomposed

| Command | Deterministic (button) | LLM-assisted | Judgment (chat) | Why not a form | Plugin additions |
|---|---|---|---|---|---|
| **`/sdlc-coach`** | Nothing — there is no mechanical part. (The "step list instead" request is the Guide tab, §5.) | — | **The stage chat, as today**, plus two system-prompt lines: read `references/conversational-coaching.md` and the phase file's "Coaching Prompts"; choose Opening / Progress / Ready from artifact state. | Adaptive dialogue is the definition of this command. | none |
| **`/sdlc-intake`** (Discovery 0c) | **Catalogue**: `intake_documents.py --state --json [--rescan]` → DOC-NNN / file / type / tokens table. **Review** (form over that table): skip / priority order → stored by the script (`--skip DOC-003`, `--priority DOC-001,DOC-004`). **Registry & index**: `intake_documents.py --registry --state` writes `document-registry.md`'s Corpus Summary metrics and Document Index from `catalog.json` and the summaries that exist, and `index.md` within `index_budget_tokens` (trimming rule from the command: clusters first, then one-liners) — all mechanical given the summaries. **Lock**: `intake_documents.py --lock`. Shown only when the profile has `documentation.intake_path` (activity precondition). | **Summarise**: one headless run per document (ordered by priority), each a candidate `DOC-NNN-<slug>.md` under `.sdlc/context/intake/`; >~100K-token documents flagged *partial extraction*; progress + cancel; *Keep all* writes them. "Topic clusters" in the registry stays a field with *Draft with Claude*. | none beyond the stage chat | Summarising a vendor PDF is prose generation; no script can do it. Everything around it is bookkeeping and is scripted. | `--json`, `--lock`, `--registry`, `--skip`, `--priority`, `--repo`, `--docs` on `intake_documents.py`; shapes for `document-registry.md`, `document-summary.md` |
| **`/sdlc-brief`** (Discovery 0d) | **Curate** (form, the command's HITL gate made deterministic): checkboxes over every `CON-NN` (severity shown; `blocks-outcome` / `shapes-design` pre-ticked as the command recommends) and every `Q-NN` by agenda block (pre-workshop-routed ones listed as "email these"), 3–5 "decisions the room must leave with" text rows, logistics fields (date, location, attendees + roles from the roster, duration, facilitator). **Build the brief**: `workshop_brief.py build --state --contradictions CON-01,… --questions Q-02,… --decisions-json … --logistics-json …` fills `templates/phases/00-discovery/workshop-brief.md` mechanically (one page above appendices; every claim carries its DOC-NNN from the source lists; the "questions only" rule enforced as an advisory lint on lines ending without `?`). Opens the brief in the editor. Precondition: intake locked. | **Analyse the corpus**: one headless `discovery-analyst` run → candidate `contradiction-list.md` and `question-list.md`; *Keep* writes them; **Re-analyse** maps to `--refresh`. | *Talk it through* on the brief. | Finding contradictions across documents is analysis; selecting which make the page and filling logistics is a form; assembling the page from selections is a template fill. | `workshop_brief.py` (new, dual-mode); shapes for `contradiction-list.md` (`### CON-NN` repeats), `question-list.md`, `workshop-brief.md` |
| **`/sdlc-feature`** (Requirements 3a) | **Create** `feature-brief.md` from its template (`startDocument`), editor opens; epic picked from `epics.md`'s `EP-NN` ids (deterministic list). **Decomposition rows** via the table `add-row` form: spec name, channel (pick-list from `channels/*.yaml` + "— channel-agnostic"), persona, proposed risk (enum HIGH/MEDIUM/LOW; `llm_powered` channel floors at HIGH — shown as a fact from the descriptor), traces-to (FR/EP/US ids validated against the documents). **Open a decision** form → `track_decisions.py open`. **Create the specs from this decomposition**: one click runs `new_spec.py --state --name --risk --source` per row and then `bind_channel.py` per channel-bound row (§4 `/sdlc-channel`) — the command's "Next" paragraph, done mechanically. **Decisions line** on the stage home from `track_decisions.py --json`. | Optional per-field *Draft with Claude* in the editor (Outcome, Feature, Channels × personas narrative). | *Talk it through* — the "which epic, what single slice of value, who reaches it how" interview, when the person does not yet know. | The interview is judgment; the brief's structure, ids, channel vocabulary, risk floor, decision clock and spec scaffolding are all mechanical. | `document_shape_cli.py add-row` (§6); `track_decisions.py open`; shape for `feature-brief.md` (decomposition table as a `table` field) |
| **`/sdlc-rules`** (Requirements 3b) | **Create** `business-rules.md` + `golden-scenarios.md`. **Add a rule** form → `add-row`: `BR-NN` allocated, condition, outcome, source (DOC-NNN / policy), approver (roster); "outcome not yet decided" → opens `DL-NN` via `track_decisions.py open` and writes `pending DL-NN` in Outcome. **Add a scenario** → `SCEN-NN`, input, expected behaviour. **Check**: a `rules_check.py` advisory — every BR has source + approver, every SCEN references a BR, pending rules listed with their DL id. | Optional per-field draft. | *Talk it through* for the elicitation ("where is the policy silent?"). | Rules and scenarios are rows with ids; the analyst's job is asking the questions, and the person can type answers straight into rows. | `add-row`; shapes for both (`table` fields); `rules_check.py` (new, advisory, exit 0) |
| **`/sdlc-data`** (Design 6a) | **Create** the three `data/` documents. **Add a field** → `add-row` (field, type, source, PII? enum yes/no, note). **PII summary** computed by `data_contract.py summary --json` (count + list of PII fields; "pushes dependent specs toward HIGH" shown as the rule from `risk_model.TAXONOMY`). **Readiness gaps** → `add-row` + **Open a decision**. **Check**: unclassified rows flagged. | Optional per-field draft (lineage narrative). | *Talk it through* for "which fields, from where". | Classification is a per-row yes/no the person owns; the only prose is lineage. | `add-row`; shapes for `data-contract.md`, `data-readiness.md`, `lineage-audit.md`; `data_contract.py summary` (new, read-only) |
| **`/sdlc-experience`** (Design 7a) | **Pick the channel** (pick-list from `channels/*.yaml`; or taken from the spec / feature-brief row). **Create** the three `experience/` documents (the channel id written into the identity section). **Interaction-spec rows** → `add-row` with the dimension column as a **pick-list of that channel's `acceptance_dimensions` ids**, contract text, acceptance check (the vague-line lint from `check_spec.py` reused as an advisory on each line). **Journey rows** → `add-row`. **Check**: every descriptor dimension has a row (same logic as `check_channel.py`'s coverage, run against the interaction spec). | Optional per-field draft. | *Talk it through* for the journey's dead-ends. | The contract table is dimension → contract → check, and the dimensions are enumerated in the descriptor; routing to the designer is a channel lookup. | `add-row`; shapes for the three `experience/` templates; `check_channel.py --interaction-spec --json` |
| **`/sdlc-channel`** (Build) | **Bind to a channel** on a spec: pick-list → `bind_channel.py --spec --channel [--interaction-spec] --state`: sets `channel:` (targeted frontmatter edit via `set_frontmatter_field`), seeds `harness_context` from `harness_context_seed` if empty, appends one line per **uncovered** dimension to `## Acceptance Checks` (the interaction-spec's "→ Acceptance check" cell for that dimension where present, else the descriptor's `example_check`), tagged `(channel: <id>)`; idempotent; refuses if a *different* channel is already bound; prints the risk-floor implication. **Risk floor**: if the floor is above the current tier, `spec_transition.py risk <floor>` (a raise needs nothing) after the person confirms — never a lower. Then **Check**: `check_channel.py --json` (advisory) beside the existing `spec_readiness.py` (unchanged). The injected lines are then ordinary fields in the editor. | none | *Talk it through* to tighten a line that "could be built two ways". | The descriptor enumerates the dimensions and ships an example check per dimension; the interaction spec carries the feature-specific line in a fixed column. Injection is a merge of two tables. | `bind_channel.py` (new, dual-mode); `check_channel.py --json` |
| **`/sdlc-evals`** (Build, `llm_powered`) | **Seed the golden set**: offered only when the spec's channel descriptor says `llm_powered: true` (else explained, with a *do it anyway* toggle = `--force`). `seed_golden_set.py --spec --state [--threshold --trials]` fills the skill's own template (`harness/eval-datasets/golden-set.template.yaml`) with one case per `SCEN-NN` from `golden-scenarios.md` and one per descriptor `eval_hooks` entry, grader type defaulting deterministic-first (`state_check` / `transcript_constraint`), writing `eval-datasets/specs/<feature>/golden-set.yaml`. **Threshold & trials** form writes those keys. **Status** shows case count, threshold, trials, "judges sanity-checked: not recorded" until a person ticks it (recorded, with name). | none | *Talk it through* — reference answers, which failures matter, when an `llm_rubric` is unavoidable. Case authoring beyond the seed is a developer's (YAML; Studio has no YAML editor). | Choosing graders and reference answers is judgment; seeding from scenarios and hooks is a template fill. | `seed_golden_set.py` (new); fix the skill's `kit/` vs `harness/` template path first |
| **`/sdlc-review`** | **Mode picker** (Council / Adversarial / Edge cases / All, with the command's "when to use"). **Keep report** writes `review-report.md` then `record_findings.py record --report --state`. **Standing picture**: `record_findings.py report --state --json` → open HIGH+ debt, `FIXED_CLAIM_MISMATCH` named. **Strict check** button: `report --strict` (exit 2 shown as the honesty failure it is). | **Run the review**: one headless `multi-reviewer` run (read access to the stage's artifacts, profile, frozen layers; no write tools) → candidate `review-report.md` with its `## Gate Results` table rendered. | *Talk it through* about findings. | A review is judgment by definition; recording, counting and the FIXED-claim check are mechanical and already scripted. | Template + shape for `review-report.md` (the `## Gate Results` block as a `table` field) |
| **`/sdlc-enhance`** | **Coverage**: `narrative_status.py --state --json` → per artifact none / present / older than its source (hash compare). | **Write the narrative(s)**: one headless `narrative-enhancer` run per selected artifact, in parallel; candidates; *Keep* writes `<name>.narrative.md`; the forbidden-metrics rule restated in the panel. | none | Narratives are prose generation; the only mechanical part is knowing which are missing or stale. | `narrative_status.py` (new, read-only, dual-mode) |
| **`/sdlc-spike`** | **Open a spike** form: the unknown, why it cannot be specced yet, **box**, **opened by** (roster), **unblocks** (`DL-NN` / story / `ADR-NNNN`) → `new_spike.py --state --name --box --opened-by --unblocks --json`, then `setField` for the two prose fields. Refuses an empty box/opener as the script does. **Spikes list** on the board from `spikes/`. Branch work, the finding, disposal: a developer's — the result card says so and names `spike/NNNN-*` and spike-guard. | none | none | The two named-human inputs are form fields; nothing here needs a model. | `new_spike.py --json`; shape for `spike.md` |
| **`/sdlc-phase-report`** | Stage home → **Export this stage's report** / **Export all**: `generate_phase_report.py --state --phase <id> [--all]`, then `shell.openPath`; the inventory the script reports (found / missing-as-placeholder / gate status). Reports are not synced (stated). | none | none | — | none |

---

## 5. The PARTIAL items

| Item | Deterministic (button) | LLM-assisted | Judgment (chat) | Plugin additions |
|---|---|---|---|---|
| **`/sdlc-spec`** (authoring) | **New spec** form: name, source (story / REQ id validated against the documents), owner, team (roster) → `new_spec.py --state --name --source --owner --team --json` → opens the spec in the editor (the spec template **is** shaped). **Definition of Ready**: the existing `SpecReadinessPanel` (`spec_readiness.py`) live, each finding linking to its field. **Risk tier** form: the taxonomy from `risk_model.TAXONOMY` and the rungs from `required_rungs(tier)` shown as the rule; floors from the channel descriptor and from the data contract's PII summary shown as facts; the person picks; raise needs nothing, lower needs a name (`spec_transition.py risk`, already wired). **Mark ready**, **Hand off**: existing. | Optional per-field draft (Goal, Why, Scope). | *Talk it through* for a proposed tier or a vague acceptance line. | `new_spec.py --json` |
| **`/sdlc`** (guidance) | **Guide tab** on the stage home: the phase file's Purpose, Guidance, Exit Criteria, Coaching Prompts via `MarkdownView` from `${pluginRoot}/<definition>` (emitted by `stage_readiness.py`); Team & RACI from `references/team-model.md` (skipped silently if absent); previous phase's *Resolved Questions*; each activity's command description. Read from the plugin at open time. | none | — | `stage_readiness.py` emits `definition` |

---

## 6. Plugin-side additions the deterministic buttons need

| Addition | Contract | Why it is plugin work, not Studio |
|---|---|---|
| `phases/activities.yaml` + `scripts/activities_model.py` + `stage_readiness.py` `activities` | Per phase: id, label, command, kind, creates, then, optional, after, requires, done_when; status computed by the plugin (`done` / `available` / `blocked: <reason>`); exit 0; dual-mode | Studio draws, never decides; keeps `phase-registry.yaml` and `phase_model.py` byte-identical |
| `generate_status.py --json` → `capabilities: [...]` | A list of verbs this plugin supports (`activities`, `add-row`, `bind-channel`, `doctor-json`, …), pinned by a test against real `--help` output | Older-plugin gating without a failed call (§7d) |
| `document_shape_cli.py add-row --doc --shape --section --field --values-json` | For a `table` field: allocate the next `<PREFIX>-NN` by scanning the whole document (same rule as `next-number`), append one row, byte-identical elsewhere, UTF-8/CRLF preserved | Row-level operations on the four table documents (BR, SCEN, DL, decomposition) are the deterministic path; the shape library owns byte-exact writes |
| `track_decisions.py open --decision --owner [--phase]` / `decide --id --by --resolution` | Allocates `DL-NN`, `opened` today, `due` = +2 business days (the script's own `clock_business_days`), status `open`; `decide` sets `decided` + resolution; exit 0; prints the id | The clock rule lives in the plugin already; Studio must not re-derive it |
| `bind_channel.py --spec --channel [--interaction-spec] [--state]` | As in §4; idempotent; refuses a different existing channel; JSON report of injected lines, seeded context, floor implication; never edits other fields | The injection is the command's steps 4–5 made mechanical; `check_spec.py` untouched |
| `--json` on `doctor.py`, `audit_gates.py`, `check_channel.py`, `upgrade_harness.py` (dry run), `new_spec.py`, `new_spike.py` | Text output byte-identical without the flag | Studio parses JSON only |
| `intake_documents.py --json --lock --registry --skip --priority --repo --docs` | As in §4; `--docs` makes the command's documented standalone mode real | The command prose already promises `--docs` |
| `workshop_brief.py build` | As in §4; advisory "questions only" lint | Template fill with id validation |
| `rules_check.py`, `data_contract.py summary`, `narrative_status.py`, `seed_golden_set.py` | Read-only / seed; exit 0; dual-mode | Status rules belong to the plugin |
| Shapes (16) | `00-discovery/{workshop-brief,contradiction-list,question-list,document-registry,document-summary}`, `01-requirements/{feature-brief,business-rules,golden-scenarios,decision-log,user-stories}`, `02-design/data/*` (3), `02-design/experience/*` (3), `build/spike`; plus a `review-report.md` template + shape (`cadence-plan` and `risk-tier-map` shapes arrive with `feat/pipeline-evidence`) | Without a shape there is no editor and no `add-row` |

---

## 7. Cross-cutting (unchanged where v1 was right)

**(a) Navigation** — §2. Activities in the Workflow tab, kinds decide controls, reports in existing homes, Build-board actions on a spec row.

**(b) Chat** — The measured finding stands and matters more now:

```
CAUSE:     A Task-spawned sub-agent inherits the session's tool denial: under the chat's exact allow-list,
           discovery-analyst's Write failed ("No such tool available: Write. Write is disabled for this
           session, in subagents as well as here."); no file was created.
CONTROL:   Same invocation with Write allowed: sub-agent and main agent both created their files.
           Claude Code 2.1.288, 2026-10-02, scratch dirs, --plugin-dir at this checkout.
COVERAGE:  The whole question for this CLI version; Edit/Bash not separately re-probed.
```
`CHAT_TOOLS` in `studio/electron/main/chatArgs.ts` is unchanged; the only prompt changes are the two coaching lines and the one `[Studio]` sentence (§2.3). The chat remains a judgment tool whose only writes are accepted `ProposeWrite` cards. The LLM-assisted buttons run *outside* the chat (a headless `claude -p` with `--plugin-dir`, `--add-dir <project> <plugin>`, `--tools Read,Grep,Glob`, cwd `claudeWorkingDirectory()`, through `runCommand` with `onChunk`), produce text, and Studio writes it only on *Keep* through one new audited whole-file write (`documents.ts` `writeWholeDocument`, guarded by `resolveProjectDocument`, recorded via `record_draft.py` and `audit_artifacts.py record --event drafted`).

**(c) Standalone or Workflow** — Studio is a workflow-mode client by construction; it passes `--state` wherever a script accepts it (so `check_spec.py`'s `spec-log.jsonl` and friends record; standardise `board.ts`'s mixed `--repo`/`--state`); every new script above is dual-mode with tests for both; command files keep their standalone sections.

**(d) Older plugin** — `capabilities` gates every new trigger with a one-line reason ("needs a newer plugin: lacks `add-row`"); no `activities` → today's Workflow tab; no shape → plain-text document with the existing `plugin-behind` notice and no *Create*/*Add row* controls; `explainIfVersionMismatch` stays the backstop.

**(e) Testing** — pytest for every verb/flag with fixtures (`scripts/tests/fixtures/`), `test_shapes_cover_templates.py` extends to the new shapes, a byte-identical round-trip test for `add-row`, a test that `activities.yaml`'s references all exist; vitest adapters pinning exact argv (the `pipelineEvidence.test.ts` style) and null-not-zero; jsdom component tests per panel/form; Playwright in the real window against the real plugin via `requirePlugin` (fail loud) with `init_project.py` fixtures — the hermetic cases first (no intake path → step absent; no GitHub → says so; older plugin → today's screen); the sub-agent-cannot-write probe codified as an opt-in live test beside the hostile-scratch proof.

---

## 8. Work by file

**Plugin (`C:\Users\kruz7\OneDrive\Documents\Code Repos\MCKRUZ\claude-code-sdlc\`)** — `phases/activities.yaml` (new); `scripts/activities_model.py` (new); `scripts/stage_readiness.py` (activities, definition); `scripts/generate_status.py` (capabilities); `scripts/document_shape_cli.py` + `scripts/document_shape.py` (`add-row`); `scripts/track_decisions.py` (`open`, `decide`); `scripts/bind_channel.py`, `scripts/workshop_brief.py`, `scripts/rules_check.py`, `scripts/data_contract.py`, `scripts/narrative_status.py`, `scripts/seed_golden_set.py` (new); `--json` on `scripts/doctor.py`, `scripts/audit_gates.py`, `scripts/check_channel.py`, `scripts/upgrade_harness.py`, `scripts/new_spec.py`, `scripts/new_spike.py`; `scripts/intake_documents.py` (verbs); 16 shapes under `templates/phases/**`; `templates/phases/02-design/review-report.md` (+ shape); `harness/skills/eval-builder/SKILL.md` path fix; tests under `scripts/tests/`; `CLAUDE.md` bullets; `docs/commands.md`; each affected command's "In SDLC Studio" paragraph.

**Studio (`…\claude-code-sdlc\studio\`)** — `src/workflowSteps.ts` (merge documents + activities + sign-off; five kinds); `src/components/WorkflowTab.tsx` (one control per kind); `src/components/GuideTab.tsx` (new) + `StageHome.tsx`; `electron/main/documents.ts` (`startDocument` IPC over `ensureDocumentFromTemplate`, extended to nested paths `02-design/data/*`, `experience/*`, and to `.sdlc/refresh/**/*.proposed` with shape-by-stem; `writeWholeDocument`); `electron/main/readiness.ts`; `electron/main/chatArgs.ts` (three prompt lines) + `chat.ts` (no change beyond passing the pre-seed as an ordinary turn); `electron/main/agentRun.ts` (new, the LLM-assisted runner); per-feature handler modules so `index.ts` (814 lines, over the 800 cap) stops growing: `electron/main/{artifactAudit,revise,refresh,retro,gateAudit,environment,intake,brief,review,narratives,reports,spike,decisions,channel,goldenSet}.ts`; `electron/preload/index.ts`; `shared/types.ts`; forms/panels `src/components/{DispositionDialog,RecordChangeDialog,RefreshPanel,RetroSection,EnvironmentCheck,HarnessStatus,IntakePanel,BriefCuration,ReviewPanel,NarrativesPanel,SpikeDialog,NewSpecDialog,DecisionDialog,DecisionsLine,ChannelBindPanel,RiskTierForm,AddRowDialog,CandidateView}.tsx`; edits to `DocumentsTab.tsx`, `DocumentView.tsx`, `ExplainViews.tsx` (split), `SettingsScreen.tsx` (split), `SpecStatusView.tsx`, `BuildBoard.tsx`; `electron/main/projectPaths.ts` allowlist: `.sdlc/context/intake/`, `spikes/`, `eval-datasets/` (synced) and `.sdlc/refresh/` (local only, never pushed), each with a comment naming its spec.

---

## 9. Sequencing — dependency-ordered (specs `0020`–`0025`)

| Wave | Spec | Contents | Depends on |
|---|---|---|---|
| 1 | `0020-plugin-deterministic-verbs` | Everything in §6: activities + capabilities, `add-row`, decision verbs, `bind_channel.py`, `workshop_brief.py`, the small read-only scripts, every `--json`, intake verbs, 16 shapes, review-report template, eval-builder path fix. | `feat/pipeline-evidence` merged |
| 2 | `0021-studio-activities-editor-and-guide` | Workflow tab draws the five kinds; Guide tab; `startDocument` (nested paths, `.proposed`); `add-row` dialog in the editor; decision dialog + decisions line; `[Studio]` pre-seed + the three prompt lines; capability gating; handler-module split; first proofs: phase report, spike, new spec, risk-tier form. | 0020 |
| 3 | `0022-studio-deterministic-reports` | Freshness / impact / dispositions; retro; gate effectiveness; environment check; harness status; revise sequence (impact → scan → edit → record → re-gate → impact). | 0021 |
| 4 | `0023-studio-foundation-authoring` | Feature (+ create specs from the decomposition), rules (+ check), data (+ summary), experience (+ coverage check), intake (deterministic verbs + the one LLM batch), brief (curation form + build + the one LLM analysis). Introduces `agentRun.ts` + `CandidateView` + `writeWholeDocument`. | 0021, 0022 |
| 5 | `0024-studio-build-actions` | Bind channel, refresh (editor path + optional LLM draft), review (+ record/report/strict), enhance (+ status). | 0021, 0023 (runner) |
| 6 | `0025-studio-golden-set` | Seed + threshold/trials form + status; `eval-datasets/` allowlist. Last: the only writer outside `.sdlc/` + `specs/` + `spikes/`. | 0024 |

Waves 3 and 4 can run in parallel worktrees after 2; 5 needs 4's runner.

---

## 10. Assumptions I could not verify

- `add-row` on a `table` field keeps the shape library's byte-identical round-trip guarantee without touching anything outside the field span — designed to, not yet prototyped against `document_shape.py`.
- Whether `claude -p` in 2.1.288 has an `--agent <plugin:name>` flag for the headless runner; fallback is the agent file's body as the system prompt (the `signOff.ts` frozen-layer approach).
- That the `[Studio]` pre-seed plus one prompt sentence reliably re-focuses the chat (the current redirect instruction is strong); needs one live-window e2e to confirm, as spec 0016's own checks were.
- Edit/Bash inheritance not re-probed separately.
- PR #81 (`feat/pipeline-evidence`) merges substantially as read.

## 11. Decisions only Matt can make (recommended answer in italics)

1. Declare activities in a new `phases/activities.yaml` (keeping `phase-registry.yaml` and `phase_model.py` byte-identical) rather than inside the registry? *Yes.*
2. Add a generic `add-row` verb to the shape CLI for `table` fields (BR-NN, SCEN-NN, DL-NN, decomposition rows), rather than per-document scripts? *Yes — one verb, one round-trip test.*
3. One stage chat with a `[Studio]` pre-seed and one prompt sentence — no per-activity threads, no tool changes? *Yes.*
4. Allow exactly five LLM-assisted buttons (review, enhance, intake summaries, brief analysis, refresh whole-draft), each a candidate written only on *Keep* and labelled *Drafted by Claude*, plus the per-field draft the editor already has? *Yes.*
5. Mechanical channel binding writes acceptance-check lines into the spec on one click (editable after), and a channel floor raises the tier after a confirm? *Yes.*
6. "Create the specs from this decomposition" scaffolds N spec files and binds their channels in one click? *Yes — it is the command's own "Next" made mechanical; each spec still has to pass the DoR.*
7. Harness install/upgrade apply stays out of the app (report + developer command only)? *Yes.*
8. `/sdlc-evals`: seed + threshold form in the app; case authoring stays with the chat or a developer? *Yes, last wave.*
9. `record --scan` only on an explicit *Refresh freshness* and at sign-off (never on poll)? *Yes.*
10. One audited whole-file write path, used only for LLM-assisted candidates and the `.proposed` drafts? *Yes.*

## 12. Top risks

1. **`add-row` is a shape-library change.** `document_shape.py` is not in the protected-core list, but its byte-exact guarantees are the reason Studio can edit documents at all; the round-trip and tiling tests must extend to the new verb before anything else lands.
2. **Table-as-one-field editing** (business rules, decision log) is coarse for manual edits outside `add-row`; acceptable because every row operation Studio offers goes through `add-row`.
3. **Pre-seed fidelity** — the chat may still redirect; one live e2e per authoring stage.
4. **LLM-assisted batches** (intake summaries, council review) are long; every such panel ships with streaming activity, a running clock and cancel from day one.
5. **Allowlist growth** (four prefixes) is security-relevant; each justified in `projectPaths.ts` and covered by sync tests; `.sdlc/refresh/` must never be pushed.
6. **Version skew** — ship `capabilities` in the same plugin wave as the new flags.
7. **`index.ts` is already over the 800-line cap** — wave 2 must split handler registration before adding any.
