#!/usr/bin/env python
"""Install the delivery harness (the kit) from the plugin's bundled payload into a target repo.

Called by /sdlc-setup after .sdlc/ is initialized. Idempotent: existing files are left in place
and reported as SKIPPED unless --force is given. The payload is the plugin's `harness/` directory,
a generated copy of delivery-standard/kit (see scripts/sync_kit.py).

Two modes:
  * core-only (no --profile): copy the neutral kit — CLAUDE.md full of {{TOKENS}}, placeholder
    workflows. The base case a repo adapts by hand.
  * profile-aware (--profile <profile.yaml>): compose core + the stack pack + the CI/CD pack + any
    tools packs the profile selects. The packs' realized files OVERLAY the core placeholders (last
    wins), the .NET tooling permissions are MERGED into settings.json, pack MCP fragments are MERGED
    into the repo's .mcp.json (core ships context7 / sequential-thinking / playwright; the stack and
    CI/CD packs add their own, e.g. microsoft-learn, azure-devops), and the stack pack's standards
    are spliced into CLAUDE.md's "## Stack standards — {{STACK}}" section. Tools packs (the third axis,
    multi-select via a top-level `tools: [id, ...]`) integrate optional, often self-installing tools:
    they overlay only a small static surface (config + a SETUP guide) and the installer PRINTS their
    manual setup steps — it never runs them. Selection is driven entirely by the profile's own stack
    block (language -> stack pack, ci_cd.platform -> CI/CD pack) plus the `tools` list; the mapping
    lives in one place (the resolver tables below). The two axes degrade independently: a valid stack
    or platform with no pack built yet installs the neutral core for that axis and prints a WARNING
    (setup never fails just because a pack is missing), while an incompatible pair or a pack that is
    mapped but absent from the payload still fails closed (real breakage, not "not built yet").

  This does NOT fill per-repo tokens ({{SOLUTION_OR_PROJECT}}, <<GATED_PATHS>>, deploy wiring,
  reviewer models): those are genuinely repo-level Phase-3 adaptation, not something a profile
  knows. The profile drives which packs compose, not repo-specific values.

Usage:
  uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/install_harness.py \
    --payload ${CLAUDE_PLUGIN_ROOT}/harness --target . [--profile <profile.yaml>] [--force]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

# Reuse the tested profile loader/validator rather than reinventing it.
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
from validate_profile import SCHEMA_PATH, load_yaml, validate_profile  # noqa: E402

# (source-relative-to-payload, dest-relative-to-repo). Directories end with "/".
# Mirrors kit/README.md "Install map (authoritative)".
FILE_MAP: list[tuple[str, str]] = [
    ("CLAUDE.md.template", "CLAUDE.md"),            # governance base; SDLC section appended by setup
    ("spec-template.md", "specs/spec-template.md"),
    ("settings.json", ".claude/settings.json"),
    ("mcp.json", ".mcp.json"),                      # team MCP servers; packs merge their fragments in
    ("HARNESS.md", "docs/harness.md"),              # the developer-facing tour of what's installed
]
DIR_MAP: list[tuple[str, str]] = [
    ("hooks/", ".claude/hooks/"),
    ("agents/", ".claude/agents/"),
    ("skills/", ".claude/skills/"),
    ("workflows/", ".github/workflows/"),           # RAILS.md/README.md ride along; harmless
    ("profile/rubrics/", ".github/profile/rubrics/"),
    ("profile/rulesets/", ".github/rulesets/"),
    ("profile/scripts/", "scripts/rails/"),
    ("eval-datasets/", "eval-datasets/"),
    ("prompts/", "prompts/"),
    ("infra/", "infra/"),
]
# Single files that live at a repo path different from their payload dir.
EXTRA_FILES: list[tuple[str, str]] = [
    ("workflows/RAILS.md", ".github/RAILS.md"),
    ("profile/eval-bypasses.md", ".github/eval-bypasses.md"),
    ("profile/CODEOWNERS", ".github/CODEOWNERS"),
]
GITIGNORE_LINES = [".claude/.review-receipts/", ".claude/settings.local.json"]

# Profile -> pack resolution. The profile's own stack block is the single source of truth; these
# tables are the ONE place profile vocabulary maps to pack ids. A language/platform with no entry
# fails closed (there is no pack for it yet) — never a silent core-only install.
STACK_PACK_BY_LANGUAGE = {
    "csharp": "dotnet",
    # add "typescript": "angular", "python": "python" when those stack packs exist.
}
CICD_PACK_BY_PLATFORM = {
    "github-actions": "github",
    "azure-devops": "azure-devops",
}
# Frontend axis (packs/frontend/<id>): whenever the profile declares stack.frontend, the
# framework-agnostic 'generic' pack composes first, then a framework pack ON TOP (last wins).
# Keys are the first alphabetic token of stack.frontend.framework, lowercased — so
# "React 18" / "react-18" both resolve to "react", "angular-17" will resolve to "angular"
# when that pack exists.
FRONTEND_PACK_BY_FRAMEWORK = {
    "react": "react",
    # add "angular": "angular" when that frontend pack exists.
}

# The section heading in CLAUDE.md the stack pack replaces. Everything from this line to the next
# '## ' heading (or EOF) is swapped for the pack's realized standards — but only while the {{STACK}}
# marker survives (i.e. the section is still the untouched template; a repo's Phase-3 adaptation is
# never clobbered). Content around the section — e.g. the SDLC section setup appends — is preserved.
CLAUDE_STACK_HEADING = "## Stack standards"
CLAUDE_STACK_MARKER = "{{STACK}}"


class InstallError(Exception):
    """A fail-closed install problem (bad profile, unresolved/incompatible pack)."""


def _copy(src: Path, dest: Path, force: bool, written: set[Path], log: list[str]) -> None:
    """Copy src->dest. A dest written earlier THIS run (a core placeholder a pack overlays) is
    overwritten; a dest that pre-existed the run (a repo's own file) is preserved unless --force."""
    rel = str(dest)
    composed_this_run = dest in written
    existed = dest.exists()
    if existed and not force and not composed_this_run:
        log.append(f"SKIP    {rel}  (exists)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    written.add(dest)
    if composed_this_run:
        log.append(f"OVERLAY {rel}")
    else:
        log.append(f"{'FORCE ' if existed else 'WRITE '}  {rel}")


def _copy_core(payload: Path, target: Path, force: bool, written: set[Path], log: list[str]) -> None:
    for src_rel, dest_rel in FILE_MAP + EXTRA_FILES:
        src = payload / src_rel
        if not src.is_file():
            log.append(f"MISS    {src_rel}  (not in payload)")
            continue
        _copy(src, target / dest_rel, force, written, log)

    # RAILS.md is remapped by EXTRA_FILES; don't also copy it via the workflows dir.
    remapped = {"workflows/RAILS.md"}
    for src_rel, dest_rel in DIR_MAP:
        src_dir = payload / src_rel
        if not src_dir.is_dir():
            log.append(f"MISS    {src_rel}  (not in payload)")
            continue
        for src in sorted(p for p in src_dir.rglob("*") if p.is_file()):
            key = src.relative_to(payload).as_posix()
            if key in remapped:
                continue
            dest = target / dest_rel / src.relative_to(src_dir)
            _copy(src, dest, force, written, log)


# ── Profile-aware composition ──────────────────────────────────────────────────

def _load_profile(profile_path: Path) -> dict:
    if not profile_path.is_file():
        raise InstallError(f"profile not found: {profile_path}")
    profile = load_yaml(profile_path)
    if not isinstance(profile, dict):
        raise InstallError(f"profile is not a YAML mapping: {profile_path}")
    schema = load_yaml(SCHEMA_PATH)
    errors = validate_profile(profile, schema)
    if errors:
        joined = "\n".join(f"  - {e}" for e in errors)
        raise InstallError(f"profile failed validation ({len(errors)} error(s)):\n{joined}")
    return profile


def _resolve_pack(axis: str, pack_id: str, payload: Path) -> tuple[Path, dict]:
    pack_dir = payload / "packs" / axis / pack_id
    manifest_path = pack_dir / "pack.yaml"
    if not manifest_path.is_file():
        raise InstallError(
            f"{axis} pack '{pack_id}' not found at {pack_dir} "
            f"(is the payload synced with packs/? run sync_kit.py)"
        )
    manifest = load_yaml(manifest_path)
    if not isinstance(manifest, dict) or "overlays" not in manifest:
        raise InstallError(f"{axis} pack '{pack_id}' manifest is missing an 'overlays' map")
    return pack_dir, manifest


def _resolve_packs(profile: dict, payload: Path):
    """Resolve the stack + CI/CD packs the profile selects. The two axes degrade INDEPENDENTLY: a
    valid-but-unmapped stack or platform (no pack built for it yet) yields None on that axis plus a
    warning — never a hard failure, so /sdlc-setup can never break just because a pack doesn't exist.
    A pack that IS mapped but missing from the payload, or an incompatible pair, still fails closed:
    those are real breakage (a stale sync, a misconfigured profile), not "not built yet".

    Returns (stack_pack | None, cicd_pack | None, warnings) where each pack is a (dir, manifest) tuple.
    """
    stack = profile.get("stack", {}) or {}
    language = (stack.get("backend", {}) or {}).get("language")
    platform = (stack.get("ci_cd", {}) or {}).get("platform")
    warnings: list[str] = []

    stack_pack = None
    if language in STACK_PACK_BY_LANGUAGE:
        stack_pack = _resolve_pack("stacks", STACK_PACK_BY_LANGUAGE[language], payload)
    else:
        warnings.append(
            f"no stack pack for backend language {language!r}; installed neutral core, adapt the "
            f"stack standards in CLAUDE.md by hand (supported: {sorted(STACK_PACK_BY_LANGUAGE)})"
        )

    cicd_pack = None
    if platform in CICD_PACK_BY_PLATFORM:
        cicd_pack = _resolve_pack("cicd", CICD_PACK_BY_PLATFORM[platform], payload)
    else:
        warnings.append(
            f"no CI/CD pack for ci_cd.platform {platform!r}; no pipeline workflows installed, "
            f"wire CI by hand (supported: {sorted(CICD_PACK_BY_PLATFORM)})"
        )

    # Cross-check the pair only when both axes resolved — each manifest's own compatibility list.
    if stack_pack and cicd_pack:
        stack_id = STACK_PACK_BY_LANGUAGE[language]
        cicd_id = CICD_PACK_BY_PLATFORM[platform]
        allowed_cicd = stack_pack[1].get("requires_cicd_pack", [])
        allowed_stack = cicd_pack[1].get("requires_stack_pack", [])
        if allowed_cicd and cicd_id not in allowed_cicd:
            raise InstallError(
                f"stack pack '{stack_id}' does not support CI/CD pack '{cicd_id}' "
                f"(requires_cicd_pack: {allowed_cicd})"
            )
        if allowed_stack and stack_id not in allowed_stack:
            raise InstallError(
                f"CI/CD pack '{cicd_id}' does not support stack pack '{stack_id}' "
                f"(requires_stack_pack: {allowed_stack})"
            )
    return stack_pack, cicd_pack, warnings


def _resolve_frontend(profile: dict, payload: Path):
    """Resolve the frontend axis. If the profile declares a frontend (stack.frontend present),
    the 'generic' pack (framework-agnostic UX reviewer) composes first; a mapped framework pack
    composes on top and overlays what it specializes (last wins). A declared framework with no
    pack yet degrades to generic + a warning — the repo still gets a UX reviewer, just not a
    framework-aware one. A payload missing packs/frontend/generic fails closed (stale sync),
    like any mapped-but-absent pack. Returns (list, warnings) of (dir, manifest) tuples."""
    frontend = (profile.get("stack", {}) or {}).get("frontend")
    resolved: list[tuple[Path, dict]] = []
    warnings: list[str] = []
    if not isinstance(frontend, dict) or not frontend:
        return resolved, warnings
    resolved.append(_resolve_pack("frontend", "generic", payload))
    raw = frontend.get("framework")
    framework = None
    if raw:
        tokens = [t for t in re.split(r"[^a-z]+", str(raw).strip().lower()) if t]
        framework = tokens[0] if tokens else None
    if framework in FRONTEND_PACK_BY_FRAMEWORK:
        resolved.append(_resolve_pack("frontend", FRONTEND_PACK_BY_FRAMEWORK[framework], payload))
    elif framework:
        warnings.append(
            f"no frontend pack for framework {framework!r}; installed the generic UX reviewer "
            f"only (supported: {sorted(FRONTEND_PACK_BY_FRAMEWORK)})"
        )
    return resolved, warnings


def _resolve_tools(profile: dict, payload: Path):
    """Resolve the optional tools packs a profile opts into via a top-level `tools: [id, ...]` list.
    Tools are the third axis: they compose INDEPENDENTLY of stack/CI and are MULTI-SELECT, and the id
    IS the pack dir (packs/tools/<id>) — no derivation table. An id with no pack is a warn-and-skip
    (a typo or an un-built tool never fails setup). Returns (list, warnings) of (dir, manifest) tuples.
    """
    ids = profile.get("tools") or []
    resolved: list[tuple[Path, dict]] = []
    warnings: list[str] = []
    if not isinstance(ids, list):
        warnings.append(f"profile 'tools' must be a list of pack ids, got {type(ids).__name__}; skipped")
        return resolved, warnings
    for tid in ids:
        pack_dir = payload / "packs" / "tools" / str(tid)
        manifest_path = pack_dir / "pack.yaml"
        if not manifest_path.is_file():
            warnings.append(
                f"no tools pack {str(tid)!r} at {pack_dir}; skipped (typo, or not built/synced yet)"
            )
            continue
        manifest = load_yaml(manifest_path)
        if not isinstance(manifest, dict) or "overlays" not in manifest:
            warnings.append(f"tools pack {str(tid)!r} manifest missing an 'overlays' map; skipped")
            continue
        resolved.append((pack_dir, manifest))
    return resolved, warnings


def _merge_list(base: list, overlay: list) -> list:
    out = list(base)
    seen = {json.dumps(x, sort_keys=True) for x in base}
    for x in overlay:
        key = json.dumps(x, sort_keys=True)
        if key not in seen:
            out.append(x)
            seen.add(key)
    return out


def _deep_merge(base, overlay):
    """Recursively merge overlay into base: dicts merge key-wise, lists concat with de-dup, scalars
    take the overlay. Keys starting with '//' (JSON-comment convention) are dropped."""
    if isinstance(base, dict) and isinstance(overlay, dict):
        result = {k: v for k, v in base.items() if not str(k).startswith("//")}
        for k, v in overlay.items():
            if str(k).startswith("//"):
                continue
            result[k] = _deep_merge(result[k], v) if k in result else v
        return result
    if isinstance(base, list) and isinstance(overlay, list):
        return _merge_list(base, overlay)
    return overlay


def _merge_json(fragment: Path, dest: Path, log: list[str]) -> None:
    if not dest.exists():
        raise InstallError(f"cannot merge {fragment.name}: {dest} does not exist (core not copied?)")
    base = json.loads(dest.read_text(encoding="utf-8"))
    frag = json.loads(fragment.read_text(encoding="utf-8"))
    merged = _deep_merge(base, frag)
    dest.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    log.append(f"MERGE   {dest}  (+{fragment.name})")


def _overlay_pack(pack_dir: Path, manifest: dict, target: Path, force: bool,
                  written: set[Path], log: list[str]) -> None:
    for entry in manifest.get("overlays", []):
        src = pack_dir / entry["src"]
        dest = target / entry["dest"]
        if not src.is_file():
            log.append(f"MISS    {entry['src']}  (not in pack {pack_dir.name})")
            continue
        if entry.get("merge"):
            _merge_json(src, dest, log)
        else:
            _copy(src, dest, force, written, log)


def _splice_claude_stack_section(stack_pack_dir: Path, manifest: dict, target: Path,
                                 force: bool, log: list[str]) -> None:
    """Replace CLAUDE.md's stack-standards section (heading to the next '## ' heading, or EOF)
    with the pack's realized one; everything before and after the section is preserved. Only
    fires while the {{STACK}} marker survives IN THE SECTION, so Phase-3 edits are safe."""
    claude = target / "CLAUDE.md"
    provides = manifest.get("provides", {}) or {}
    rel = provides.get("claude_standards")
    if not rel:
        return
    section_src = stack_pack_dir / rel
    if not claude.is_file() or not section_src.is_file():
        log.append("MISS    CLAUDE.md stack section  (CLAUDE.md or pack standards absent)")
        return

    text = claude.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    heading_idx = next((i for i, ln in enumerate(lines) if ln.startswith(CLAUDE_STACK_HEADING)), None)
    if heading_idx is None:
        log.append("MISS    CLAUDE.md stack section  (no '## Stack standards' heading)")
        return

    # The section ends at the next same-level heading (or EOF if it is the last section).
    end_idx = next((i for i in range(heading_idx + 1, len(lines)) if lines[i].startswith("## ")),
                   len(lines))
    already_adapted = CLAUDE_STACK_MARKER not in "".join(lines[heading_idx:end_idx])
    if already_adapted and not force:
        log.append("SKIP    CLAUDE.md stack section  (already adapted)")
        return

    # Strip a leading HTML-comment block from the pack section so the splice is clean.
    section = section_src.read_text(encoding="utf-8")
    marker = section_src.name
    if section.lstrip().startswith("<!--") and "-->" in section:
        section = section.split("-->", 1)[1].lstrip("\n")
    head = "".join(lines[:heading_idx]).rstrip("\n")
    tail = "".join(lines[end_idx:]).strip("\n")
    out = f"{head}\n\n{section.rstrip()}\n"
    if tail:
        out += f"\n{tail}\n"
    claude.write_text(out, encoding="utf-8")
    log.append(f"SPLICE  CLAUDE.md stack section  (<- {marker})")


def install(payload: Path, target: Path, force: bool, profile_path: Path | None = None) -> int:
    if not payload.is_dir():
        print(f"ERROR: payload not found: {payload}", file=sys.stderr)
        return 2

    log: list[str] = []
    written: set[Path] = set()
    stack_pack = cicd_pack = None
    frontend_packs: list[tuple[Path, dict]] = []
    tools_packs: list[tuple[Path, dict]] = []
    warnings: list[str] = []

    if profile_path is not None:
        try:
            profile = _load_profile(profile_path)
            stack_pack, cicd_pack, warnings = _resolve_packs(profile, payload)
            frontend_packs, fe_warnings = _resolve_frontend(profile, payload)
            tools_packs, tool_warnings = _resolve_tools(profile, payload)
            warnings = warnings + fe_warnings + tool_warnings
        except InstallError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 2

    _copy_core(payload, target, force, written, log)

    if stack_pack or cicd_pack or frontend_packs or tools_packs:
        parts = [f"stack pack '{p[0].name}'" for p in (stack_pack,) if p]
        parts += [f"CI/CD pack '{p[0].name}'" for p in (cicd_pack,) if p]
        parts += [f"frontend pack '{d.name}'" for d, _ in frontend_packs]
        parts += [f"tools pack '{d.name}'" for d, _ in tools_packs]
        log.append(f"\n-- composing {' + '.join(parts)} --")
        if stack_pack:
            _overlay_pack(stack_pack[0], stack_pack[1], target, force, written, log)
            _splice_claude_stack_section(stack_pack[0], stack_pack[1], target, force, log)
        if cicd_pack:
            _overlay_pack(cicd_pack[0], cicd_pack[1], target, force, written, log)
        for fe_dir, fe_manifest in frontend_packs:
            _overlay_pack(fe_dir, fe_manifest, target, force, written, log)
        for tool_dir, tool_manifest in tools_packs:
            _overlay_pack(tool_dir, tool_manifest, target, force, written, log)

    _ensure_gitignore(target, log)

    written_n = sum(1 for line in log if line.startswith(("WRITE", "FORCE", "OVERLAY", "SPLICE")))
    merged_n = sum(1 for line in log if line.startswith("MERGE"))
    skipped_n = sum(1 for line in log if line.startswith("SKIP"))
    print("\n".join(log))
    print(f"\nHarness install: {written_n} written, {merged_n} merged, {skipped_n} skipped "
          f"(use --force to overwrite).")
    _print_tool_setup(tools_packs)
    if warnings:
        print(f"\nWARNING: {len(warnings)} pack(s) not composed:", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
    print("NEXT: review CLAUDE.md placeholders, then prove the rails "
          "(.github/RAILS.md shakedown drills) before trusting them.")
    return 0


def _print_tool_setup(tools_packs: list[tuple[Path, dict]]) -> None:
    """Surface each tools pack's manual setup steps. The installer never RUNS these — self-installing
    tools (e.g. GitNexus) register their own MCP server + generate their own footprint; we only point
    the operator at the commands the pack declares in its `setup` block."""
    with_setup = [(d, m) for d, m in tools_packs if m.get("setup")]
    if not with_setup:
        return
    print("\nMANUAL SETUP - tools packs install themselves; run these after the harness install:")
    for tool_dir, manifest in with_setup:
        setup = manifest["setup"]
        name = manifest.get("pack", {}).get("name", tool_dir.name)
        print(f"  {name}: {setup.get('summary', '')}")
        for cmd in setup.get("commands", []):
            print(f"      {cmd}")
        guide = manifest.get("provides", {}).get("setup_guide")
        if guide:
            print(f"      guide: .claude/tools/{tool_dir.name}/{guide}")


def _ensure_gitignore(target: Path, log: list[str]) -> None:
    gi = target / ".gitignore"
    existing = gi.read_text(encoding="utf-8").splitlines() if gi.exists() else []
    missing = [ln for ln in GITIGNORE_LINES if ln not in existing]
    if not missing:
        return
    with gi.open("a", encoding="utf-8") as fh:
        if existing and existing[-1].strip():
            fh.write("\n")
        fh.write("# delivery harness\n" + "\n".join(missing) + "\n")
    log.append(f"WRITE   .gitignore  (+{len(missing)} lines)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Install the delivery harness into a repo.")
    ap.add_argument("--payload", required=True, type=Path, help="plugin harness/ directory")
    ap.add_argument("--target", default=Path("."), type=Path, help="target repo root")
    ap.add_argument("--profile", type=Path, default=None,
                    help="profile.yaml selecting the stack + CI/CD packs to compose (optional)")
    ap.add_argument("--force", action="store_true", help="overwrite existing files")
    args = ap.parse_args()
    profile = args.profile.resolve() if args.profile else None
    return install(args.payload.resolve(), args.target.resolve(), args.force, profile)


if __name__ == "__main__":
    raise SystemExit(main())
