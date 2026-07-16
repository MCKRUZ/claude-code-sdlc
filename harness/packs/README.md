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
| **Stack** | `packs/stacks/<id>` | *How do we build in this technology?* | one | `dotnet`, `node-typescript`, `python` |
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

The stack pack **declares** its toolchain and commands in `ci-profile.yaml`. A CI/CD pack
**realizes** them into its platform's syntax. This is what keeps the axes independent: add a new
stack and every CI/CD pack can run it; add a new CI platform and every stack works on it.

The join is **mechanical** — the installer does it, not a human with a copy buffer.

**The two halves.** Each side owns exactly what it knows:

| Half | Lives in | Knows |
| --- | --- | --- |
| `ci-profile.yaml` | `packs/stacks/<id>/` | *Which* toolchain (`toolchain.id` + `version`) and *what* the commands are (`commands.{restore,build,test,lint}`, `coverage.floor_percent`, `eval_gate.test_filter`) |
| `toolchain_map:` | `packs/cicd/<id>/pack.yaml` | *How this platform installs* a given `toolchain.id` — its setup action/task and that action's version-input name |

Neither knows the other. `dotnet` says "I need dotnet 10.x"; the github pack says "on me, `dotnet`
means `actions/setup-dotnet@v4` and the input is called `dotnet-version`"; the ADO pack says
"`UseDotNet@2`, input `version`". The input name is genuinely not uniform across platforms
(`version` vs `versionSpec` on ADO), which is why it is **mapped, not assumed**.

**The tokens.** A CI/CD pack's workflows reference every stack value as a `<<CI_*>>` token. At
install time (`install_harness.py`, `ci_tokens.py`) the two halves are joined into a token table and
substituted into **every file the CI/CD pack overlays**, as it is copied:

| Token | Filled from |
| --- | --- |
| `<<CI_TOOLCHAIN_ACTION>>` | CI/CD pack `toolchain_map[<toolchain.id>].action` |
| `<<CI_TOOLCHAIN_INPUT>>` | CI/CD pack `toolchain_map[<toolchain.id>].input` |
| `<<CI_TOOLCHAIN_VERSION>>` | `ci-profile` `toolchain.version` |
| `<<CI_RESTORE_CMD>>` / `<<CI_BUILD_CMD>>` / `<<CI_TEST_CMD>>` / `<<CI_LINT_CMD>>` | `ci-profile` `commands.*` |
| `<<CI_COVERAGE_FLOOR>>` | `ci-profile` `coverage.floor_percent` |
| `<<CI_EVAL_TEST_FILTER>>` | `ci-profile` `eval_gate.test_filter` |

Those nine are the **whole** compose-time vocabulary — it is a closed list, **not** the `<<CI_*>>`
prefix. The prefix is not free: `deploy-dev.yml` in both packs already carries `<<CI_WORKFLOW_NAME>>`
/ `<<CI_PIPELINE_NAME>>` / `<<CI_PIPELINE_RESOURCE>>`, which name the CI *pipeline* and are ordinary
Phase-3 blanks. Those, `{{SOLUTION_OR_PROJECT}}`, `<<EVAL_TEST_PROJECT>>`, `<<DEFAULT_BRANCH>>` and
every other blank are **Phase-3 repo adaptation** and pass through untouched — including when they
ride *inside* a substituted command (`dotnet restore {{SOLUTION_OR_PROJECT}}` lands exactly like
that). Adding a seam token means adding it to `ci_tokens.SEAM_TOKENS` and to the table above.

`ci-profile.yaml` is a compose-time **input**, not an installed artifact: nothing copies it into the
target repo. What lands there is the realized pipeline carrying its values.

**The rules.**

- **Fail closed on an unmapped toolchain.** A `toolchain.id` with no entry in the resolved CI/CD
  pack's `toolchain_map` aborts the install (rc 2), naming the id and the pack. Installing a
  pipeline that sets up the wrong runtime is worse than installing none.
- **Fail closed on a surviving token.** After substitution, any remaining `<<CI_*>>` in a file the
  installer wrote aborts the install, naming file and token. A literal token never reaches a repo.
- **Commands must be single-line.** Each is spliced verbatim into one `run:`/`script:` **block
  scalar**, so an embedded newline would emit an extra, unreviewed shell line — the installer
  rejects it. (A folded `>-` scalar is single-line once loaded; that is the authoring escape hatch.)
  Block scalars are also why a value containing quotes or colons — `--collect:"XPlat Code
  Coverage"` — can never break the emitted YAML.
- **The axes still degrade independently.** A CI/CD pack with **no stack pack** (a language with no
  pack built yet) does **not** substitute: the `<<CI_*>>` tokens are deliberately **left in place**
  and the installer prints a WARNING listing the affected files and tokens as Phase-3 work. Setup
  still exits 0 — a missing stack pack never breaks setup, exactly as before.

**Known gap.** The optional eval-gate job binds only its `--filter` to the stack; the runner
invocation around it is still written in .NET's vocabulary in both CI/CD packs, because `ci-profile`
declares no eval-runner command. That job is hand-adapted per repo regardless (it carries a
`<<EVAL_TEST_PROJECT>>` blank and is deleted unless `eval_gate.enabled` is true).

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
