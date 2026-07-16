# /sdlc-setup — Interactive Setup Wizard

Initialize SDLC lifecycle management for a project.

## Instructions

### Step 1: Check Existing Setup
Look for `.sdlc/state.yaml` in the current directory.
- If exists: warn the user that SDLC is already initialized. Ask if they want to view status (`/sdlc-status`) or re-initialize (destructive — requires confirmation).
- If exists but missing `.sdlc/context/` directory: offer to upgrade the project structure by creating the missing `context/layers/` directory. This is non-destructive — it only adds new directories, doesn't modify existing state or artifacts. Run: `mkdir -p .sdlc/context/layers`
- If not exists: proceed with setup.

### Step 2: Profile Selection
List available profiles from the plugin's `profiles/` directory (exclude `_schema.yaml`):

Present every profile found there to the user. The current built-ins:
- **microsoft-enterprise** — C#/.NET 8 + Angular 17 + Azure, SOC 2 compliance, 80% coverage minimum, TDD required
- **starter** — Minimal profile, no compliance gates, quick start for any stack
- **creative-tooling** — Python/uv-scripts + pytest for creative pipelines (ComfyUI registry/inventory tooling); 80% coverage, TDD + code/security review required, schema- and cross-reference-integrity evaluation criteria, no compliance frameworks

If the directory listing shows profiles not in this list, present those too (describe them from their
`profile.yaml`). Ask the user to select a profile.

### Step 3: Project Configuration
Ask the user for:
- **Project name** (default: current directory name)
- Confirm the selected profile settings are appropriate

### Step 4: Initialize .sdlc/
Run the init script:
```bash
uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/init_project.py \
  --profile ${CLAUDE_PLUGIN_ROOT}/profiles/<selected-profile>/profile.yaml \
  --target . \
  --name "<project-name>"
```

This creates:
```
.sdlc/
├── state.yaml          # Phase tracking (Phase 0: Discovery active)
├── profile.yaml        # Frozen copy of selected profile
├── constitution.md     # Project constitution
├── context/            # Cross-phase context (frozen layers)
│   └── layers/         # Phase completion summaries
└── artifacts/          # Per-phase artifact directories, one per registry slug
                        # (00-discovery … 03-foundation, build, 07-documentation … 09-monitoring, close)
```

### Step 5: Install the delivery harness
Install the standard-aligned harness (the kit) from the plugin's bundled `harness/` payload into
the repo. This lays down the governance `CLAUDE.md`, `.claude/{settings,hooks,agents,skills}`, the
CI workflows in `.github/workflows/` (7 files: 5 rail gates — ci, grader, correctness, security,
deploy-dev — plus 2 eval workflows), the `profile/` rubrics + branch-protection ruleset, and the
`infra/` starters. Idempotent — existing files are left in place and reported as SKIPPED (pass
`--force` only when you intend to overwrite). One exception: the JSON merge targets (`.mcp.json`
and `.claude/settings.json`) are re-merged on every run by design — the installer deep-merges the
payload's entries into them rather than skipping, so pack additions always land.

Pass `--profile .sdlc/profile.yaml` so the installer **composes the stack + CI/CD packs the profile
selects** on top of the neutral core: the profile's `stack.backend.language` picks the stack pack
(realized `CLAUDE.md` standards, `.claude/rules`, the stack skill, .NET tooling permissions merged
into `settings.json`) and `stack.ci_cd.platform` picks the CI/CD pack (the platform's realized
pipeline workflows, which overlay the core placeholders). A profile may also list `tools: [id, ...]`
(the third, multi-select pack axis) to compose optional tools packs — e.g. `gitnexus`; those overlay a
small static surface and the installer PRINTS their manual setup steps (self-installing tools are never
run by the installer). The install also writes `.mcp.json` at the repo root — the team's shared MCP
servers (core: context7, sequential-thinking, playwright; the dotnet pack adds microsoft-learn; the
azure-devops pack adds the Azure DevOps server with an `<<ADO_ORGANIZATION>>` token to fill). Each
developer approves the set once when they first open the repo; auth-requiring servers authenticate
per developer (e.g. `az login`) — no credentials ever go in the file. If the profile declares a
frontend (`stack.frontend`), the frontend axis also composes: the generic `ux-reviewer` agent, plus
a framework-aware version on top when a pack exists for the declared framework (currently `react`;
an unmapped framework keeps the generic reviewer and prints a WARNING). Each axis degrades independently: if no pack exists yet for the repo's language,
platform, or a named tool, that axis prints a `WARNING:` and the neutral core is left in place to adapt
by hand — setup never fails for lack of a pack. If the output shows a "MANUAL SETUP" block, run those
commands (and read the referenced `SETUP.md`) after setup completes.
```bash
uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/install_harness.py \
  --payload ${CLAUDE_PLUGIN_ROOT}/harness --target . --profile .sdlc/profile.yaml
```
Run this BEFORE Step 6 so the governance `CLAUDE.md` exists before the SDLC section is appended.

### Step 6: Update CLAUDE.md
Read the profile's `claude-md-template.md` (at `${CLAUDE_PLUGIN_ROOT}/profiles/<selected-profile>/claude-md-template.md`)
and append its contents to the project's `CLAUDE.md` (the governance base written in Step 5):
- If `CLAUDE.md` exists: append the SDLC section
- If `CLAUDE.md` doesn't exist: create it with the SDLC section

If the profile has no `claude-md-template.md`, print a WARNING naming the missing file and append
this generic SDLC section instead (fill in the selected profile id) — never stop the setup over a
missing template:

```markdown
# SDLC Configuration (auto-injected by /sdlc-setup)

## SDLC Plugin Active
This project uses the claude-code-sdlc plugin for lifecycle management.
- State: `.sdlc/state.yaml`
- Profile: `<selected-profile>`
- Commands: `/sdlc`, `/sdlc-setup`, `/sdlc-status`, `/sdlc-next`, `/sdlc-gate`

## Phase Awareness
Before making changes, check the current SDLC phase with `/sdlc`. Gated opening phases
(0 Discovery – 3 Foundation) produce documents; the continuous Build loop builds one spec at a
time (Intent → Delegate → Discern — checking happens per change, and the author never approves
their own work); gated closing phases (7 Documentation – 9 Monitoring, then Close & Transfer)
prove the system can be operated and handed over. Quality thresholds and conventions live in
`.sdlc/profile.yaml`.
```

### Step 7: Apply branch protection (optional — needs GitHub + `gh`)
The harness ships a branch-protection ruleset (`.github/rulesets/branch-protection.json`) and an
applier. If the repo is on GitHub and `gh` is authenticated, offer to apply it:
```bash
bash scripts/rails/apply-branch-protection.sh
```
This makes the four blocking checks (build-and-test, grader, correctness-review, security-review)
+ a non-author approval mandatory at merge; deploy-dev runs post-merge and is not a merge check.
Skip if the repo isn't on GitHub yet; the ruleset stays in the repo to apply later.

### Step 8: Confirmation
Display:
```
SDLC + delivery harness installed!

Profile: <profile-id>
Phase: 0 — Discovery (active)
Harness: CLAUDE.md, .claude/, .github/workflows (7 workflows: 5 rails + 2 eval), infra/

Next steps:
1. Fill the {{PLACEHOLDER}} tokens in CLAUDE.md (stack, glossary, gated paths);
   on Azure DevOps, also replace <<ADO_ORGANIZATION>> in .mcp.json
   (docs/harness.md explains every installed piece — point the team there)
2. PROVE THE RAILS before trusting them — run the shakedown drills in .github/RAILS.md
3. Run /sdlc to start the Phase 0 discovery interview
4. Run /sdlc-gate when ready to check exit criteria; /sdlc-next to advance
```

### Step 9: Validate
Run the profile validator to confirm the setup is healthy:
```bash
uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/validate_profile.py .sdlc/profile.yaml
```

## Error Handling
- If uv is not installed: tell the user to install it (`pip install uv` or `brew install uv`)
- If profile validation fails: show errors and suggest fixes
- If directory permissions prevent creation: report the error clearly
- If the harness install reports SKIPPED files you wanted replaced: re-run install_harness.py with `--force`.
  **`--force` rewrites `CLAUDE.md` from the pristine template** — the appended SDLC section (Step 6) and any
  local edits to it are lost and must be re-applied. Prefer deleting just the specific files you want
  re-installed and re-running without `--force`.
