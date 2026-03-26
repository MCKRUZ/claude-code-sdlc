# Feature Parity Analysis: AI-SDLC → claude-code-sdlc

**Date:** 2026-03-26
**Purpose:** Identify features in the AI-SDLC methodology repo that haven't been fully incorporated into the claude-code-sdlc Claude Code plugin.

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ At Parity | Feature fully implemented in claude-code-sdlc |
| ⚠️ Partial | Referenced or partially implemented |
| ❌ Missing | Not present in claude-code-sdlc |
| 🔀 Diverged | claude-code-sdlc took a different (valid) approach |
| N/A | Not applicable to the plugin format |

---

## Summary Scorecard

| Category | At Parity | Partial | Missing | Diverged |
|----------|:---------:|:-------:|:-------:|:--------:|
| Phase Structure | 1 | 0 | 0 | 1 |
| Context System | 0 | 1 | 2 | 0 |
| Quality Gates | 1 | 0 | 1 | 0 |
| Output System | 0 | 0 | 2 | 0 |
| Agent/Skill Model | 0 | 1 | 2 | 0 |
| Compliance | 1 | 0 | 0 | 0 |
| Tooling | 1 | 1 | 0 | 0 |
| **Totals** | **4** | **3** | **7** | **1** |

---

## Detailed Comparison

### 1. Phase Structure

| Feature | AI-SDLC | claude-code-sdlc | Status |
|---------|---------|------------------|--------|
| Phase definitions with exit criteria | 4 phases (Discovery → Specification → Planning → Implementation) | 10 phases (Discovery → Monitoring) | 🔀 Diverged |
| Phase activities & artifacts | Per-phase agent with 5-7 skills each | Per-phase markdown with activities + artifact lists | ✅ At Parity |

**Notes:** claude-code-sdlc has *more* granular phases (10 vs 4), covering the full lifecycle through deployment and monitoring. AI-SDLC packs more detail into fewer phases via discrete skill definitions. Both approaches are valid — the 10-phase model is arguably better for a plugin guiding users through a complete lifecycle.

---

### 2. Context System (TOKEN EFFICIENCY)

| Feature | AI-SDLC | claude-code-sdlc | Status | Priority |
|---------|---------|------------------|--------|----------|
| **Frozen Layers** — condense 10K+ tokens to ~2K handoff between phases | Full implementation via `phase-completion` skill; outputs `context/layers/phaseN-name.md` | Referenced in docs but no generation mechanism in scripts or agents | ⚠️ Partial | **HIGH** |
| **3-Tier Context Architecture** — Foundation (~500 tok), Frozen Layers (~2K), Reference (on-demand) | Formal `context-operations` skill with read/update/validate operations | Not implemented; state.yaml tracks phase but no tiered context loading | ❌ Missing | **HIGH** |
| **Context Manifest** — YAML file tracking what context is loaded, versions, cross-file consistency | `context-manifest.yaml` with 7 SYNC validation checks | Not present | ❌ Missing | **MEDIUM** |

**Why this matters:** The context system is AI-SDLC's core innovation for making multi-phase AI workflows practical. Without frozen layers, each new phase conversation starts cold or requires manually re-reading prior artifacts. This is the single highest-value feature to port.

**Recommendation:** Create a `scripts/generate_frozen_layer.py` that reads all artifacts from a completed phase and produces a token-efficient summary. Integrate into `advance_phase.py`. Add a `context/` directory to the `.sdlc/` structure.

---

### 3. Quality Gates

| Feature | AI-SDLC | claude-code-sdlc | Status | Priority |
|---------|---------|------------------|--------|----------|
| 5-gate validation system | Gates 0-4 (Integrity, Completeness, Arithmetic, Compliance, Quality) | Gates 1-5 (Integrity, Completeness, Metrics, Compliance, Quality) | ✅ At Parity |  |
| **Cross-phase locked metrics** — certain values (budget, timeline, scope) can't change without decision log entry | Formal rules in `cross-phase-consistency.reference.md` with change protocol | Not implemented; gates validate within a phase but don't enforce cross-phase metric locks | ❌ Missing | **MEDIUM** |

**Recommendation:** Add a `references/cross-phase-consistency.md` doc defining locked metrics and change protocol. Update `check_gates.py` to read prior phase frozen layers and flag metric drift.

---

### 4. Output System

| Feature | AI-SDLC | claude-code-sdlc | Status | Priority |
|---------|---------|------------------|--------|----------|
| **Narrative Enhancement (Dual Output)** — every artifact has standard (.md) + narrative (.narrative.md) for stakeholders | Full `narrative-enhancer` meta-skill; mandatory after every creation skill; `/enhance-artifact` command | Not present | ❌ Missing | **HIGH** |
| **DOCX Export** — professional Word documents for executives/boards | `docx-artifact-generator` meta-skill; 6 document types | Not present (though the `/docx` skill exists in Claude Code globally) | ❌ Missing | **LOW** |

**Why this matters:** The narrative enhancement is a key differentiator for stakeholder communication. A requirements spec is great for engineers, but executives need a prose version. This makes the SDLC output accessible to non-technical stakeholders.

**Recommendation:** Create an `agents/narrative-enhancer.md` agent or a `/sdlc-enhance` command that takes any artifact and produces a `.narrative.md` companion. Leverage the existing `visual-explainer` and `humanizer` skills as building blocks.

---

### 5. Agent/Skill Model

| Feature | AI-SDLC | claude-code-sdlc | Status | Priority |
|---------|---------|------------------|--------|----------|
| **Core Primitives Framework** — formal definitions for Agent, Skill, Artifact, Context as composable patterns | `core/primitives/` with design patterns (handoff, context layers, human gates, parallel execution, skill chaining) | Not present; agents defined but no formal primitive/pattern library | ❌ Missing | **LOW** |
| **Formal Skill Context Contracts** — each skill declares consumed/produced context | Per-skill SKILL.md with `consumes:` and `produces:` declarations | Agents exist but skills don't have formal context contracts | ❌ Missing | **MEDIUM** |
| **Conversational Agent Mode** — phase agents act as adaptive coaches with flexible dialogue | Per-phase `CONVERSATIONAL-AGENT.md` with coaching patterns, personality, flexible execution | Not implemented; agents follow structured workflows | ⚠️ Partial | **MEDIUM** |

**Recommendation:**
- Conversational mode is the highest value here. Add a `references/conversational-coaching.md` doc that the orchestrator agent can load, enabling a coaching dialogue style alongside the structured approach.
- Skill contracts could be added to existing agent definitions as metadata, but the ROI is lower since Claude Code's agent system works differently than AI-SDLC's skill composition model.

---

### 6. Compliance & Governance

| Feature | AI-SDLC | claude-code-sdlc | Status |
|---------|---------|------------------|--------|
| SOC2 compliance gates | Defined in methodology | 10 gates mapped to phases 1-9 in profile YAML | ✅ At Parity |
| HIPAA/GDPR/PCI-DSS frameworks | Referenced | Referenced in `references/compliance-frameworks.md` | ✅ At Parity |
| Compliance audit command | Via validation skills | `/sdlc-audit` command + `audit_gates.py` script | ✅ At Parity |

**Notes:** claude-code-sdlc actually has *better* compliance integration with the profile-driven gate system and dedicated audit command.

---

### 7. Tooling & Automation

| Feature | AI-SDLC | claude-code-sdlc | Status |
|---------|---------|------------------|--------|
| Report generation | `html-report-generator` meta-skill (multi-page interactive dashboards) | `generate_phase_report.py` (Markdown + basic HTML) | ⚠️ Partial |
| Profile/config system | Company profiles in YAML | 3 profiles + schema validation | ✅ At Parity |
| State management | Context manifest + frozen layers | `state.yaml` + `advance_phase.py` | ✅ At Parity |
| Session hooks | Not present (tool-agnostic) | PowerShell hooks for Claude Code integration | ✅ claude-code-sdlc ahead |

**Recommendation:** The `generate_phase_report.py` could be enhanced to produce the multi-level interactive HTML dashboards that AI-SDLC's `html-report-generator` creates (Level 1: overview, Level 2: phase detail, Level 3: artifact drill-down).

---

### 8. Features claude-code-sdlc Has That AI-SDLC Doesn't

These are areas where the plugin has gone *beyond* the methodology repo:

| Feature | Description |
|---------|-------------|
| **10-phase lifecycle** | Covers deployment, monitoring — AI-SDLC stops at implementation |
| **Native Claude Code integration** | Plugin manifest, hooks, slash commands |
| **Python automation scripts** | 9 scripts for validation, reporting, initialization |
| **Section evaluator agent** | Grades implementation against rubric |
| **Profile schema validation** | `_schema.yaml` with jsonschema validation |
| **Deep-plan integration** | Maps `/deep-plan` artifacts into SDLC phases 2-3 |
| **Phase report generation** | `/sdlc-phase-report` command with artifact inventory |
| **Creative-tooling profile** | Specialized profile for plugin/tool development |

---

## Prioritized Recommendations

### Tier 1 — High Value, Should Port

| # | Feature | Effort | Impact | Approach |
|---|---------|--------|--------|----------|
| 1 | **Frozen Layer Generation** | Medium | Very High | New script `generate_frozen_layer.py`; integrate into `advance_phase.py`; add `context/layers/` to `.sdlc/` structure |
| 2 | **Narrative Enhancement** | Medium | High | New agent `narrative-enhancer.md` or `/sdlc-enhance` command; dual output for all artifacts |
| 3 | **3-Tier Context Loading** | Medium | High | Update hooks to implement tiered context injection; foundation always loaded, frozen layers per-phase, references on-demand |

### Tier 2 — Medium Value, Nice to Have

| # | Feature | Effort | Impact | Approach |
|---|---------|--------|--------|----------|
| 4 | **Conversational Coaching Mode** | Medium | Medium | New reference doc + orchestrator update to support coaching dialogue alongside structured execution |
| 5 | **Cross-Phase Locked Metrics** | Low | Medium | New reference doc + update `check_gates.py` to compare metrics across phases |
| 6 | **Skill Context Contracts** | Low | Medium | Add `consumes:`/`produces:` metadata to existing agent definitions |
| 7 | **Context Manifest** | Medium | Medium | New `context-manifest.yaml` template; track loaded context versions |

### Tier 3 — Low Priority

| # | Feature | Effort | Impact | Approach |
|---|---------|--------|--------|----------|
| 8 | **Core Primitives Library** | Low | Low | Reference doc only; pattern definitions for extensibility |
| 9 | **DOCX Export** | Low | Low | Already available via global `/docx` skill; just needs wiring |
| 10 | **Multi-Level HTML Dashboards** | High | Low | Enhance `generate_phase_report.py` for drill-down navigation |

---

## Implementation Order

If tackling these, I'd recommend this sequence:

1. **Frozen Layers + Context Tiers** (1 + 3) — These are tightly coupled. Build the frozen layer generator first, then update the hooks to implement tiered loading. This is the foundation everything else builds on.

2. **Narrative Enhancement** (2) — Once frozen layers exist, the narrative enhancer can operate on both standard artifacts and frozen summaries.

3. **Cross-Phase Consistency** (5) — Quick win once frozen layers are in place, since you can compare values across layer files.

4. **Conversational Mode** (4) — Adds a human-friendly interaction pattern on top of the existing structured workflow.

5. **Everything else** — As needed/requested.
