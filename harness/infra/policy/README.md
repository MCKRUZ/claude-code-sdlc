# Policy-as-code gate

Static rules that run against the **compiled ARM** (the output of `bicep build`)
**before any cloud call** — step 3 of the agent-safe IaC pipeline in
[`../README.md`](../README.md). The gate fails closed: a violation blocks the
deployment the same way a failing test blocks a merge. This is what makes
agent-generated IaC safe to propose — the agent cannot talk a human past a
hard rule.

## Starter rule set

These three are the non-negotiable minimum for a client dev environment. Add
engagement-specific rules (private networking, allowed SKUs, allowed regions,
diagnostic settings) at the hardening stage.

| Rule | Asserts | Why |
| --- | --- | --- |
| **No public storage / data planes** | Storage accounts and Key Vaults have `publicNetworkAccess: Disabled` (and storage `allowBlobPublicAccess: false`). | A public data plane is the most common accidental exposure. The starter Key Vault already sets this; the gate enforces it for everything. |
| **Encryption on** | Encryption at rest is enabled (HTTPS-only / TLS 1.2+ in transit; service-managed or CMK at rest). | Unencrypted resources fail audit and leak on compromise. |
| **Required tags present** | Every taggable resource carries `workload`, `environment`, `owner`, `costCenter`, all non-empty. | Cost attribution, ownership, and lifecycle all depend on tags. Untagged resources are orphans. |

## How to enforce

Pick one and wire it into the CI step that runs before `what-if`:

- **Azure Policy** (`Microsoft.Authorization/policy*`) evaluated via
  `az deployment group what-if` against a subscription with the policies
  assigned — violations surface as denied changes.
- **A policy-as-code engine** (e.g. Open Policy Agent / Conftest, or `az bicep`
  + a custom rule script) run against the compiled ARM JSON in the pipeline.

Whichever engine: the rule set lives **in this repo**, versioned and reviewed,
so a rule change is itself a reviewable PR — not a console click.

> This README is the specification of the gate. The actual rule files (Rego,
> Azure Policy JSON, or a validation script) are added per engagement against the
> client's chosen engine; they are intentionally not invented here.
