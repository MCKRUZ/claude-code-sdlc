# 5-Gate Validation System

Adapted from the AI-SDLC methodology. Every phase transition runs artifacts through five validation gates in order. A gate failure blocks the transition.

## Gate 1: Artifact Integrity

**Purpose:** Verify that required artifacts exist and are well-formed.

**Checks:**
- All required files for the phase exist in `.sdlc/artifacts/XX-phasename/`
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

**Severity:** MUST pass. Incomplete artifacts lead to downstream failures.

## Gate 3: Arithmetic / Metrics

**Purpose:** Verify quantitative thresholds from the profile.

**Checks:**
- Code coverage >= `quality.coverage_minimum` (Phase 6)
- Critical path coverage >= `quality.coverage_critical` (Phase 6)
- File line counts <= `quality.max_file_lines` (Phase 5)
- Function line counts <= `quality.max_function_lines` (Phase 5)
- No CRITICAL or HIGH severity issues in review reports (Phase 5)
- All E2E tests passing (Phase 6)

**Severity:** MUST pass for phases that produce measurable outputs. SHOULD be tracked for other phases.

## Gate 4: Classification

**Purpose:** Verify that artifacts are correctly categorized and labeled.

**Checks:**
- Requirements have priority labels (P0–P3)
- Design decisions have ADR status (proposed/accepted/deprecated/superseded)
- Test cases map to requirements (traceability matrix)
- Security review covers all identified threat vectors
- Compliance controls map to framework requirements

**Severity:** MUST pass for compliance-enabled profiles. SHOULD pass for others.

## Gate 5: Quality

**Purpose:** Holistic quality assessment of phase outputs.

**Checks:**
- Writing quality: clear, unambiguous, uses RFC 2119 keywords appropriately
- Technical accuracy: architecture decisions are sound, patterns are appropriate for the stack
- Consistency: naming conventions match profile, coding style aligns with conventions
- Completeness of thought: edge cases considered, error handling defined, rollback plans present

**Severity:** SHOULD pass. Quality gate failures generate warnings but MAY be overridden with justification.

## Gate Application by Phase

| Phase | G1: Integrity | G2: Completeness | G3: Metrics | G4: Classification | G5: Quality |
|-------|:---:|:---:|:---:|:---:|:---:|
| 0 Discovery | MUST | MUST | — | — | SHOULD |
| 1 Requirements | MUST | MUST | — | MUST | SHOULD |
| 2 Design | MUST | MUST | — | MUST | MUST |
| 3 Planning | MUST | MUST | — | — | SHOULD |
| 4 Implementation | MUST | MUST | SHOULD | — | SHOULD |
| 5 Quality | MUST | MUST | MUST | MUST | MUST |
| 6 Testing | MUST | MUST | MUST | MUST | SHOULD |
| 7 Documentation | MUST | MUST | — | — | MUST |
| 8 Deployment | MUST | MUST | SHOULD | — | SHOULD |
| 9 Monitoring | MUST | SHOULD | — | — | SHOULD |

## Override Protocol

When a gate fails but the team decides to proceed:

1. The override MUST be recorded in `state.yaml` history with:
   - `override: true`
   - `justification: "reason for override"`
   - `approved_by: "person/role"`
2. Compliance-enabled profiles MUST NOT override Gate 4 (Classification) failures
3. Gate 5 (Quality) MAY be overridden with documented justification
4. Gates 1–3 SHOULD NOT be overridden — they indicate objective failures
