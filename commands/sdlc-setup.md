# /sdlc-setup — Interactive Setup Wizard

Initialize SDLC lifecycle management for a project.

## Instructions

### Step 1: Check Existing Setup
Look for `.sdlc/state.yaml` in the current directory.
- If exists: warn the user that SDLC is already initialized. Ask if they want to view status (`/sdlc-status`) or re-initialize (destructive — requires confirmation).
- If not exists: proceed with setup.

### Step 2: Profile Selection
List available profiles from the plugin's `profiles/` directory (exclude `_schema.yaml`):

Present choices to the user:
- **microsoft-enterprise** — C#/.NET 8 + Angular 17 + Azure, SOC 2 compliance, 80% coverage minimum, TDD required
- **starter** — Minimal profile, no compliance gates, quick start for any stack

Ask the user to select a profile.

### Step 3: Project Configuration
Ask the user for:
- **Project name** (default: current directory name)
- Confirm the selected profile settings are appropriate

### Step 4: Initialize .sdlc/
Run the init script:
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/init_project.py \
  --profile <plugin-root>/profiles/<selected-profile>/profile.yaml \
  --target . \
  --name "<project-name>"
```

This creates:
```
.sdlc/
├── state.yaml          # Phase tracking (Phase 0: Discovery active)
├── profile.yaml        # Frozen copy of selected profile
├── constitution.md     # Project constitution
└── artifacts/          # Per-phase artifact directories (00–09)
```

### Step 5: Update CLAUDE.md
Read the profile's `claude-md-template.md` and append its contents to the project's `CLAUDE.md` file:
- If `CLAUDE.md` exists: append the SDLC section
- If `CLAUDE.md` doesn't exist: create it with the SDLC section

### Step 6: Confirmation
Display:
```
SDLC initialized successfully!

Profile: <profile-id>
Phase: 0 — Discovery (active)
Artifacts: .sdlc/artifacts/00-discovery/

Next steps:
1. Run /sdlc to see Phase 0 guidance
2. Create your problem statement in .sdlc/artifacts/00-discovery/problem-statement.md
3. Run /sdlc-gate when ready to check exit criteria
4. Run /sdlc-next to advance to Phase 1
```

### Step 7: Validate
Run the profile validator to confirm the setup is healthy:
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/validate_profile.py .sdlc/profile.yaml
```

## Error Handling
- If uv is not installed: tell the user to install it (`pip install uv` or `brew install uv`)
- If profile validation fails: show errors and suggest fixes
- If directory permissions prevent creation: report the error clearly
