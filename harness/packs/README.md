# Packs — the adaptation layer of the kit

The core kit (`kit/`, everything outside this folder) is the **neutral, stack-agnostic standard**:
the build loop, the gates, the checking ladder, the spec format. It is identical in every repo.

A **pack** fills the core's deliberate blanks — the `<<PLACEHOLDER>>` tokens in the workflows and
the `{{STACK}}` section of `CLAUDE.md` — with realized, working content. Packs are authored once,
here, and reused by every repo that needs them.

## Three independent axes

Packs compose along axes that are **orthogonal** — you pick from each:

| Axis | Folder | Answers | Select | Examples |
|---|---|---|---|---|
| **Stack** | `packs/stacks/<id>` | *How do we build in this technology?* | one | `dotnet`, `angular`, `python` |
| **CI/CD** | `packs/cicd/<id>` | *Which pipeline platform runs the rails?* | one | `github`, `azure-devops` |
| **Frontend** | `packs/frontend/<id>` | *Does this repo have screens, and in what framework?* | generic + one | `generic`, `react` |
| **Tools** | `packs/tools/<id>` | *Which optional tools does the team wire in?* | any (0+) | `gitnexus` |

A repo pulls **one stack pack + one CI/CD pack + frontend packs when it has a frontend + any number
of tools packs**. `dotnet` + `github` and `dotnet` + `azure-devops` reuse the *same* stack pack — the
technology conventions don't change because the pipeline platform did.

**The frontend axis is layered within itself:** whenever the profile declares `stack.frontend`, the
framework-agnostic `generic` pack installs first (the `ux-reviewer` agent), then the framework pack
(`react`; `angular` when built) composes on top and overlays what it specializes — last wins. A
framework with no pack yet gets the generic reviewer plus a warning, never a failed setup.

**Stack and CI/CD packs OVERLAY realized files** (they replace the core's placeholder blanks). A **tools
pack is different**: it integrates an optional, often self-installing third-party tool. It ships only what
the tool does *not* generate (a config template, a `SETUP.md`), and the installer surfaces the manual
setup step — it never copies tool-generated skills/hooks or runs the tool. See `packs/tools/gitnexus`.

## MCP servers — how packs contribute them

The core installs `.mcp.json` at the repo root with the team-standard servers (context7,
sequential-thinking, playwright — stateless, no accounts, versions pinned). A pack that has a
stack- or platform-specific server ships an `mcp.fragment.json` and an overlay entry
`{ src: mcp.fragment.json, dest: .mcp.json, merge: true }` — the installer deep-merges it, so
core entries survive and fragments only add. Current contributors: `stacks/dotnet` →
`microsoft-learn`; `cicd/github` → `github` (hosted server, per-developer OAuth sign-in);
`cicd/azure-devops` → `azure-devops` (org name is the `<<ADO_ORGANIZATION>>`
Phase-3 token; authentication is per-developer via `az login`, never a committed credential).
Hard rules for any new entry: pin the exact version (no `@latest`), and no secrets in the file —
auth is always per-developer. Every developer approves the repo's server set once on first open;
that consent prompt is Claude Code's, not ours.

## The seam between the two

The stack pack **declares its commands** in `ci-profile.yaml` (restore / build / test / lint /
coverage, plus the toolchain). A CI/CD pack **realizes** those commands into its platform's syntax
(GitHub Actions YAML, Azure Pipelines YAML). This is what keeps the axes independent: add a new
stack and every CI/CD pack can run it; add a new CI platform and every stack works on it.

## Composition order (who wins)

Applied in order; a later layer overrides the one before, so the most specific wins:

```
1. core             (kit/)                        — everyone
2. stack pack       (packs/stacks/<id>)           — all repos on that stack
3. CI/CD pack       (packs/cicd/<id>)             — all repos on that pipeline platform
4. frontend packs   (packs/frontend/generic+<id>) — repos with screens; framework pack wins
5. tools packs      (packs/tools/<id>)            — additive; each team's opted-in tools
6. customer profile (plugin: profiles/<company>)  — one company's products
7. repo adaptation  (the product repo itself)     — one product
```

## Selected by the profile

The installer resolves packs from the customer `profile.yaml`'s own stack block — no separate
`pack:` field to drift out of sync:

```yaml
stack:
  backend:
    language: csharp       # → packs/stacks/dotnet   (resolver: language → stack pack)
  ci_cd:
    platform: github-actions  # → packs/cicd/github  (resolver: platform → CI/CD pack)
tools: [gitnexus]          # → packs/tools/gitnexus  (explicit, multi-select; id = pack dir)
```

`install_harness.py --profile <profile.yaml>` reads these and composes: overlay the stack pack, overlay
the CI/CD pack, overlay each tools pack, then splice the stack standards into `CLAUDE.md`. Each axis
degrades independently — a language/platform/tool with no pack installs neutral core for that axis and
prints a warning; setup never fails for a missing pack.
```
