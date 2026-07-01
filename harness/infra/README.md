# Infrastructure (IaC) — agent-safe Bicep starter

This directory is the **dev-environment starter** for a client engagement
(delivery standard, Phase 3 Foundation). It is intentionally minimal:
[`main.bicep`](./main.bicep) provisions an app host, a Key Vault the app reads
through a managed identity, and the identity itself — nothing more.

> **IaC is HIGH risk on EVERY change.** There is no "small infra change." Every
> apply goes through the full pipeline below with named human approval. The
> Bicep file is an *input* to that pipeline, never an apply-on-save.

> **Maturity flag.** Letting an agent author and run IaC is an **emerging**
> practice. The safety here comes from the pipeline gates (static policy, dry-run
> what-if, cost review, human approval, least-privilege apply, drift assessment),
> not from trusting the generator. Keep the gates even as confidence grows.

---

## What the starter provisions

| Resource | Why it's here | Notes |
| --- | --- | --- |
| User-assigned managed identity | The app's identity with no stored credentials | Granted Key Vault Secrets User on the vault only. |
| Key Vault | Holds secrets the app reads at runtime | RBAC-authorized, public network access **disabled**, soft-delete on. Secrets are **not** authored in Bicep. |
| App Service (Linux, B1) | A stand-in app host | HTTPS-only, TLS 1.2+, uses the identity to resolve Key Vault references. Swap for Container Apps / Functions per engagement. |

Everything client-specific is a **parameter or a documented placeholder**
(`owner`, `costCenter`, reader principal ids). No fake resource names, no
secrets, no invented subscription/tenant values.

Scope is **resource group**: deploy into a pre-provisioned dev RG so RG-level
RBAC bounds the blast radius of an apply.

---

## The agent-safe IaC pipeline

An agent may *generate* and *propose* infrastructure. It does not get to change
cloud state unsupervised. Every change runs this pipeline in order; a failure at
any stage stops the line.

```
  generate ──▶ build / schema-validate ──▶ static policy-as-code gate ──▶
  dry-run (what-if) ──▶ cost review ──▶ HUMAN APPROVAL ──▶
  scoped least-privilege apply ──▶ drift assessment
```

1. **Generate** — agent writes/edits Bicep. Reviewable diff, like any code.
2. **Build / schema-validate** — `bicep build` (or `az bicep build`) compiles to
   ARM and fails on schema/type errors. No invalid template advances.
3. **Static policy-as-code gate** — automated rules run against the compiled ARM
   *before* any cloud call. Blocks on violations. See [`policy/`](./policy).
4. **Dry-run (`bicep what-if`)** — `az deployment group what-if` shows exactly
   what would create/modify/delete. A delete or unexpected modify is a stop sign.
5. **Cost review** — estimate the spend delta (e.g. Azure pricing / a cost tool)
   and put the number in front of a human. No silent cost increases.
6. **Human approval** — named sign-off, recorded. This is the HIGH-risk gate;
   it is never skipped, never delegated to the agent.
7. **Scoped, least-privilege apply** — apply with a deployment identity scoped to
   the target RG with only the roles the change needs. Not Owner, not subscription
   scope. The apply credential is the smallest one that works.
8. **Drift assessment** — after apply, re-run what-if (expect no diff) and record
   that live state matches the template. Investigate any drift before closing.

The pipeline is enforced in CI (a workflow that runs steps 2-4 on PR, then gates
the apply on the recorded approval). Wire it to the same branch-protection model
as the eval-regression gate: a required check that fails closed.

---

## Environments

This starter is **dev only**. Test and prod are added at the **hardening stage**,
not now:

- Separate parameter files per environment (`main.dev.bicepparam`,
  `main.test.bicepparam`, `main.prod.bicepparam`) over the same module.
- Tighter policy at higher environments (private networking, stricter SKUs,
  longer retention, mandatory diagnostic settings).
- Prod apply requires the same human approval plus change-management sign-off.

Do not promote this file to prod as-is. It is a seed, and it says so.

---

## Using it

```bash
# 1. Build / validate (no cloud call)
az bicep build --file main.bicep

# 2. Dry-run against a pre-provisioned dev resource group
az deployment group what-if \
  --resource-group <dev-rg> \
  --template-file main.bicep \
  --parameters workloadName=<name> \
               requiredTags='{"workload":"<name>","environment":"dev","owner":"<team>","costCenter":"<cc>"}'

# 3. Apply ONLY after the policy gate, cost review, and recorded human approval
az deployment group create \
  --resource-group <dev-rg> \
  --template-file main.bicep \
  --parameters workloadName=<name> ...
```

Replace every `<placeholder>` with real values at deploy time. The four required
tags (`workload`, `environment`, `owner`, `costCenter`) must be non-empty or the
policy gate rejects the template.
