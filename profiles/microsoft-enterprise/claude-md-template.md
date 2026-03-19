# SDLC Configuration (auto-injected by /sdlc-setup)

## SDLC Plugin Active
This project uses the claude-code-sdlc plugin for lifecycle management.
- State: `.sdlc/state.yaml`
- Profile: `microsoft-enterprise`
- Commands: `/sdlc`, `/sdlc-setup`, `/sdlc-status`, `/sdlc-next`, `/sdlc-gate`

## Stack: Microsoft Enterprise
- **Backend:** C# / .NET 8 / Entity Framework Core / xUnit
- **Frontend:** TypeScript / Angular 17 / NgRx / Playwright
- **Database:** SQL Server with EF Core migrations
- **Cloud:** Azure (App Service, Azure SQL, Key Vault, App Insights)
- **CI/CD:** GitHub Actions

## Quality Standards
- Code coverage: minimum 80%, critical paths 100%
- Max file size: 800 lines, max function: 50 lines
- TDD required: write tests first
- Code review required before merge
- Security review required for auth/payment/sensitive code

## Coding Conventions
- Commits: `type: description` (feat, fix, refactor, docs, test, chore)
- Branches: `type/ticket-description`
- Immutability: prefer immutable patterns (records, `with`, spread operators)
- No console.log in production code

## Compliance: SOC 2
- Audit trail maintained in `.sdlc/state.yaml`
- Change approval: peer review required
- Security review at Phase 5 gate
- Documentation current at Phase 7 gate

## Phase Awareness
Before making changes, check the current SDLC phase with `/sdlc`:
- During Implementation (Phase 4): follow section plans, use TDD
- During Quality (Phase 5): focus on review findings, not new features
- During Testing (Phase 6): fill coverage gaps, don't change architecture
