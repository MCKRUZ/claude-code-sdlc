# 7-Gate Validation System

Adapted from the AI-SDLC methodology. Every gated phase transition runs artifacts through seven validation gates in order. A gate failure blocks the transition. The **Build loop** (`build`) has no batch artifact gate — these checks run per change in its Discern beat instead of at a phase boundary.

## Gate 1: Artifact Integrity

**Purpose:** Verify that required artifacts exist and are well-formed.

**Checks:**
- All required files for the phase exist in `.sdlc/artifacts/<slug>/` (the registry `slug`, e.g. `00-discovery`, `03-foundation`, `build`, `close`)
- Files are non-empty (> 0 bytes)
- Files use expected format (markdown headers present, YAML parses, etc.)
- No placeholder content remaining (e.g., `TODO`, `TBD`, `${VARIABLE}`)

**Severity:** MUST pass. Missing artifacts = immediate block.

## Gate 2: Completeness

**Purpose:** Verify that artifacts contain all required sections and content.

**Checks:**
- Required markdown sections present (matched against template headers)
- Required YAML fields populated
- Cross-references between artifacts resolve (e.g., requirements referenced in design doc exist)
- Acceptance criteria have measurable conditions (not vague statements)
- Section plan files contain Verification Criteria and Evaluator Contract sections (Phase 3 Foundation)
- Build loop checkpoint protocol enforced: each change must be committed and evaluated (Discern beat) before the next change begins (progress derived from each spec's frontmatter `status` via `track_specs.py`; the spec is the unit of work, one spec = one branch = one PR)

**Severity:** MUST pass. Incomplete artifacts lead to downstream failures.

## Gate 3: Arithmetic / Metrics

**Purpose:** Verify quantitative thresholds from the profile.

**Checks:**
- Code coverage >= `quality.coverage_minimum` (Build loop, per change)
- Critical path coverage >= `quality.coverage_critical` (Build loop, per change)
- File line counts <= `quality.max_file_lines` (Build loop, per change)
- Function line counts <= `quality.max_function_lines` (Build loop, per change)
- No CRITICAL or HIGH severity issues in review reports (Build loop, per change)
- All E2E tests passing (Build loop, per change)

**Severity:** MUST pass for phases that produce measurable outputs. In the Build loop these thresholds are enforced per change in the Discern beat (not as a batch gate). SHOULD be tracked for other phases.

## Gate 4: Compliance

**Purpose:** Verify that artifacts are correctly categorized, labeled, and meet compliance framework requirements.

**Checks:**
- Requirements have priority labels (P0–P3)
- Design decisions have ADR status (proposed/accepted/deprecated/superseded)
- Test cases map to requirements (traceability matrix)
- Security review covers all identified threat vectors
- Compliance controls map to framework requirements

**Severity:** MUST pass for compliance-enabled profiles. SHOULD pass for others.

## Gate 5: Cross-Phase Consistency

**Purpose:** Detect drift in locked metrics across phase transitions.

**Checks:**
- Read frozen layers from all prior completed phases
- Identify "Locked Metrics" and "Constraints Carried Forward" sections
- Flag for manual review: Claude compares locked values against current phase artifacts
- Verify decision log exists if any locked metrics have changed

**Locked Metrics:** Budget, timeline, scope boundaries, stakeholder roster, quality thresholds, compliance requirements. See `references/cross-phase-consistency.md` for the full list and change protocol.

**Severity:** SHOULD pass. Consistency warnings surface drift for human review but do NOT block phase transitions. Legitimate scope changes are documented via decision log entries.

## Gate 6: Quality

**Purpose:** Holistic quality assessment of phase outputs.

**Checks:**
- Writing quality: clear, unambiguous, uses RFC 2119 keywords appropriately
- Technical accuracy: architecture decisions are sound, patterns are appropriate for the stack
- Consistency: naming conventions match profile, coding style aligns with conventions
- Completeness of thought: edge cases considered, error handling defined, rollback plans present

**Severity:** SHOULD pass. Quality gate failures generate warnings but MAY be overridden with justification.

## Gate 7: Exit Criteria

**Purpose:** Show the approver the phase's own exit checklist at the moment they are asked to sign.

Each phase declares `exit_gate.conditions[]` in `phases/phase-registry.yaml`. Conditions naming an artifact (`{artifact: design-doc.md, check: exists_and_complete}`) are already covered by Gates 1 and 2. The rest are prose judgments — *"The rails are proven, not just present"* — that no script can evaluate. Gate 7 renders those, one review item each, so the human sees the checklist rather than approving against an unstated standard.

**Checks:**
- Every prose condition declared for the phase is surfaced as a review item
- Artifact-bearing conditions are not re-emitted (Gates 1 and 2 own those)

**Severity:** Always REVIEW, never PASS or FAIL. Gate 7 reports; it cannot block. Only a MUST *failure* stops an advance, and a condition nobody evaluated has not failed. The block is `advance_phase.py`'s existing `--confirmed` requirement, unchanged.

Phases 0–2 declare no prose conditions today, so Gate 7 is silent there.

## Gate Application by Phase

Gates apply at the exit of each **gated** phase. The Build loop (`build`) is omitted from the table on purpose — it has no batch artifact gate; the same checks (G1–G3, G6) run per change in its Discern beat.

| Phase | G1: Integrity | G2: Completeness | G3: Metrics | G4: Compliance | G5: Consistency | G6: Quality | G7: Exit criteria |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 0 Discovery | MUST | MUST | — | — | — | SHOULD | — |
| 1 Requirements | MUST | MUST | — | MUST | SHOULD | SHOULD | — |
| 2 Design | MUST | MUST | — | MUST | SHOULD | MUST | — |
| 3 Foundation | MUST | MUST | SHOULD | — | SHOULD | SHOULD | REVIEW (3) |
| build Build Loop | per change | per change | per change | — | SHOULD | per change | REVIEW (1) |
| 7 Documentation | MUST | MUST | — | — | SHOULD | MUST | REVIEW (2) |
| 8 Deployment | MUST | MUST | SHOULD | — | SHOULD | SHOULD | REVIEW (3) |
| 9 Monitoring | MUST | SHOULD | — | — | SHOULD | SHOULD | REVIEW (2) |
| close Close & Transfer | MUST | MUST | — | — | SHOULD | SHOULD | REVIEW (3) |

`REVIEW (n)` is the number of prose conditions that phase declares. A dash means the gate is not evaluated.

## Dirty Tracking (Incremental Validation)

Gate checks support incremental validation via artifact checksums. When a checksum baseline exists in `state.yaml`, the gate checker compares current file hashes against stored hashes:

- **New files** — full validation
- **Modified files** — full validation
- **Unchanged files** — skipped (reported as PASS)
- **Deleted files** — flagged if they were required

Checksums are snapshotted automatically by `advance_phase.py` on phase completion. To manually create a baseline, run `track_artifacts.py --snapshot`.

The `dirty-tracking` result in gate output is severity `INFO` — it never blocks transitions. It reports the artifact change summary to help understand what was validated.

## Override Protocol

When a gate fails but the team decides to proceed:

1. The override MUST be recorded in `state.yaml` history with:
   - `override: true`
   - `justification: "reason for override"`
   - `approved_by: "person/role"`
2. Compliance-enabled profiles MUST NOT override Gate 4 (Compliance) failures
3. Gate 5 (Consistency) findings SHOULD be reviewed but MAY proceed if drift is intentional
4. Gate 6 (Quality) MAY be overridden with documented justification
5. Gates 1–3 SHOULD NOT be overridden — they indicate objective failures
6. Gate 7 (Exit Criteria) has nothing to override — it never fails. Its items are answered by the human who signs the advance
