# Skill Mapping Reference

Maps each SDLC phase to the Claude Code skills/commands that execute it.

## Phase → Skill Matrix

| Phase | Primary Skills | Secondary Skills | Notes |
|-------|---------------|-----------------|-------|
| 0 Discovery | `/plan` | — | Manual elicitation + structured planning |
| 1 Requirements | `/deep-project` | `/plan` | Decompose into planning units |
| 2 Design | `/deep-plan` | `/plan`, `/visual-explainer` | Architecture + ADRs via deep planning. Visual diagrams via `/visual-explainer`. |
| 3 Foundation | `/deep-plan` | `/tdd`, `/e2e` | Section-level planning with TDD; stand up rails + walking skeleton through the full Build loop |
| build Build Loop | — | `/deep-implement`, `/tdd`, `/code-review`, `/security-review`, `/e2e`, `/test-coverage` | Continuous Intent → Delegate → Discern per change. Replaces batch Implementation/Quality/Testing; checking is per change, no batch gate. |
| 7 Documentation | `/update-docs` | — | Sync docs with code |
| 8 Deployment | `/e2e` | — | Smoke tests via `e2e-runner`; `devops-automator` agent for deployment execution |
| 9 Monitoring | — | `/session-insights` | Retrospective analysis; `performance-benchmarker` agent for baseline |
| close Close & Transfer | — | — | Prove unassisted client run end-to-end; harness audit + access revocation + harvest. Orchestrate agents per phase definition. |

## Skill Details

### /deep-project
- **Phase:** Requirements (1)
- **Purpose:** Decomposes vague, high-level project requirements into well-scoped planning units
- **Input:** Problem statement, stakeholder notes
- **Output:** Structured requirements, acceptance criteria

### /deep-plan
- **Phases:** Design (2), Foundation (3)
- **Purpose:** Creates detailed, sectionized, TDD-oriented implementation plans through research, stakeholder interviews, multi-LLM review, and parallel section generation
- **Phase 2 usage (steps 1–15):** Research → Interview → Spec synthesis → Plan generation → External review
  - **Input:** `planning/spec.md` (synthesized from Phase 1 artifacts via `scripts/synthesize_spec.py`)
  - **Output:** `planning/claude-plan.md`, `planning/claude-research.md`, `planning/claude-interview.md`, `planning/reviews/`
  - **Maps to:** `design-doc.md`, `api-contracts.md`, `phase3-handoff.md` (via `scripts/map_deep_plan_artifacts.py --phase 2`)
- **Phase 3 (Foundation) usage (steps 16–22):** TDD planning → Section index → Parallel section generation
  - **Input:** `planning/claude-plan.md` (from Phase 2), human-approved section boundaries
  - **Output:** `planning/claude-plan-tdd.md`, `planning/sections/index.md`, `planning/sections/section-NN-*.md`
  - **Maps to:** `section-plans/SECTION-NNN.md`, `tdd-plan.md`, `dependency-map.md` (via `scripts/map_deep_plan_artifacts.py --phase 3`)
- **Checkpoint:** Session continuity across phases via `.sdlc/artifacts/02-design/deep-plan-checkpoint.yaml`
- **See also:** `references/deep-plan-integration.md` for full artifact mapping and troubleshooting

### /deep-implement
- **Phase:** Build loop (`build`) — Delegate beat
- **Purpose:** Implements code from /deep-plan section files with TDD methodology
- **Input:** Section plan files
- **Output:** Source code, tests, git commits

### /tdd
- **Phases:** Foundation (3, walking skeleton), Build loop (`build`)
- **Purpose:** Enforce test-driven development workflow
- **Input:** Feature specification
- **Output:** Tests first, then implementation

### /code-review
- **Phase:** Build loop (`build`) — Discern beat
- **Purpose:** Expert code review for quality, security, maintainability
- **Input:** Code diffs
- **Output:** Review report with severity ratings

### /security-review
- **Phase:** Build loop (`build`) — Discern beat
- **Purpose:** Security vulnerability detection
- **Input:** Code handling user input, auth, APIs, sensitive data
- **Output:** Security report with OWASP Top 10 analysis

### /e2e
- **Phases:** Build loop (`build`) — Discern beat; Deployment (8) smoke tests
- **Purpose:** Generate and run end-to-end tests
- **Input:** Critical user flows
- **Output:** Playwright tests, screenshots, traces

### /test-coverage
- **Phase:** Build loop (`build`) — Discern beat
- **Purpose:** Analyze and report test coverage
- **Input:** Test suite
- **Output:** Coverage report vs. profile thresholds

### /visual-explainer
- **Phase:** Design (2)
- **Purpose:** Generate self-contained HTML pages with rendered architecture diagrams (Mermaid flowcharts, CSS layer diagrams, dependency DAGs, trust boundary models)
- **Input:** Architecture details from `design-doc.md`, component lists, data flows, section dependencies, trust boundaries
- **Output:** `.sdlc/reports/architecture-diagrams.html` — self-contained HTML with interactive Mermaid diagrams, zoom controls, and sticky TOC navigation
- **Required diagrams:** Architecture layers, core flow, data flow, section dependencies, trust boundaries
- **Fallback:** If `/visual-explainer` skill is not installed, generate equivalent HTML directly using Mermaid CDN. Never fall back to ASCII art.

### /update-docs
- **Phase:** Documentation (7)
- **Purpose:** Sync documentation with code changes
- **Input:** Code changes, existing docs
- **Output:** Updated README, API docs, guides

## Agent Mapping

| Agent | Phase(s) | Purpose |
|-------|----------|---------|
| sdlc-orchestrator | All | Coordinates phase transitions and skill invocation |
| requirements-analyst | 0, 1 | Guides discovery interviews and requirement decomposition |
| compliance-checker | All (if compliance enabled) | Validates compliance gates at phase transitions |
