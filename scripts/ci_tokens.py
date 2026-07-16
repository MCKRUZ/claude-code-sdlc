#!/usr/bin/env python
"""The stack<->CI/CD seam, mechanized: build the compose-time <<CI_*>> token table.

A stack pack DECLARES its toolchain + commands in ci-profile.yaml. A CI/CD pack REALIZES them in
its platform's syntax, referencing each value as a `<<CI_*>>` token and mapping the declared
toolchain.id to its own platform vocabulary via a `toolchain_map:` block in pack.yaml. The
installer joins the two at compose time (install_harness.py): every file the CI/CD pack overlays
is substituted as it is copied, so a node repo gets a node pipeline instead of a .NET one.

The compose-time namespace is a CLOSED VOCABULARY (SEAM_TOKENS), not the `<<CI_*>>` prefix. The
prefix alone would be wrong: the packs already carry Phase-3 repo blanks that live in it —
<<CI_WORKFLOW_NAME>> (github deploy-dev.yml), <<CI_PIPELINE_NAME>> / <<CI_PIPELINE_RESOURCE>> (ADO
deploy-dev.yml) — which name the CI *pipeline* and have nothing to do with the stack seam. Those,
`{{...}}`, and every other `<<...>>` (<<SOLUTION_OR_PROJECT>>, <<EVAL_TEST_PROJECT>>,
<<DEFAULT_BRANCH>>, ...) are Phase-3 repo adaptation and pass through untouched.

Authoring faults raise ValueError; install_harness converts them to a fail-closed InstallError
(the house pattern — see harness_manifest.load_manifest). Fail closed everywhere: an unmapped
toolchain.id, a missing ci-profile value, or a multi-line command is a broken pack, never a
silently degraded install.
"""
from __future__ import annotations

import re
from pathlib import Path

from validate_profile import load_yaml

_CI_TOKEN_RE = re.compile(r"<<CI_[A-Z0-9_]*>>")

# Filled from the CI/CD pack's toolchain_map (the platform half of the seam), not the profile.
_TOOLCHAIN_TOKENS: tuple[str, str] = ("<<CI_TOOLCHAIN_ACTION>>", "<<CI_TOOLCHAIN_INPUT>>")

# token -> the ci-profile.yaml path it is filled from.
_PROFILE_TOKENS: tuple[tuple[str, tuple[str, str]], ...] = (
    ("<<CI_TOOLCHAIN_VERSION>>", ("toolchain", "version")),
    ("<<CI_RESTORE_CMD>>", ("commands", "restore")),
    ("<<CI_BUILD_CMD>>", ("commands", "build")),
    ("<<CI_TEST_CMD>>", ("commands", "test")),
    ("<<CI_LINT_CMD>>", ("commands", "lint")),
    ("<<CI_COVERAGE_FLOOR>>", ("coverage", "floor_percent")),
    ("<<CI_EVAL_CMD>>", ("eval_gate", "command")),
)

# The ENTIRE compose-time vocabulary. Membership — not the <<CI_ prefix — is what makes a token the
# installer's business, because the packs also carry Phase-3 blanks that share the prefix (see the
# module docstring). Extending the seam means adding to this table AND to packs/README.md.
SEAM_TOKENS = frozenset(_TOOLCHAIN_TOKENS + tuple(t for t, _ in _PROFILE_TOKENS))


def load_ci_profile(stack_pack_dir: Path, manifest: dict) -> dict:
    """Load + validate the ci-profile.yaml the stack pack declares in provides.ci_profile.

    The profile is a compose-time INPUT, not an installed artifact — nothing copies it into the
    target; the CI/CD pack's realized files carry its values.
    """
    rel = ((manifest.get("provides") or {}).get("ci_profile"))
    if not rel:
        raise ValueError(
            f"stack pack '{stack_pack_dir.name}' declares no provides.ci_profile; a stack paired "
            f"with a CI/CD pack must declare its commands (packs/stacks/<id>/ci-profile.yaml)"
        )
    path = stack_pack_dir / rel
    if not path.is_file():
        raise ValueError(f"stack pack '{stack_pack_dir.name}' declares provides.ci_profile: {rel}, "
                         f"but {path} does not exist")
    profile = load_yaml(path)
    if not isinstance(profile, dict):
        raise ValueError(f"{path} is not a YAML mapping")
    _validate_commands(profile, path)
    return profile


def _validate_commands(profile: dict, path: Path) -> None:
    """Every command must be a SINGLE line: a workflow splices it verbatim into one block scalar,
    so an embedded newline would silently emit an extra, unreviewed shell line. A folded (`>-`)
    scalar is already single-line at load; a trailing newline (a `>` clip) is benign.

    Covers eval_gate.command too — it is spliced into the eval job's `run:` block the same way, and
    a rule that held for four commands but not the fifth would be a gap, not a policy.
    """
    commands = profile.get("commands") or {}
    if not isinstance(commands, dict):
        raise ValueError(f"{path}: commands must be a mapping, got {type(commands).__name__}")
    checked = [(f"commands.{name}", value) for name, value in commands.items()]

    eval_gate = profile.get("eval_gate") or {}
    if not isinstance(eval_gate, dict):
        raise ValueError(f"{path}: eval_gate must be a mapping, got {type(eval_gate).__name__}")
    if eval_gate.get("command") is not None:
        checked.append(("eval_gate.command", eval_gate["command"]))

    for name, value in checked:
        if "\n" in str(value).strip():
            raise ValueError(
                f"{path}: {name} must be a single line (it is spliced into one CI "
                f"`run:` block); use a folded '>-' scalar or ' && ' instead of a newline"
            )


def build_token_table(ci_profile: dict, cicd_manifest: dict, cicd_pack_id: str,
                     coverage_floor: int | None = None) -> dict[str, str]:
    """Join the stack's declared ci-profile with the CI/CD pack's platform vocabulary.

    Values are stringified: they are spliced into YAML text, and an unquoted `80` or `10.x` must
    land as the pack authored the surrounding quoting, not as a YAML int/float.

    `coverage_floor` is the customer profile's quality.coverage_minimum. It OVERRIDES the stack
    pack's declared default, because the composition order makes the profile (layer 6) authoritative
    over the stack pack (layer 2) — a coverage bar is the customer's policy, not the stack's. The
    pack's ci-profile still declares a floor: it states the standard's bar for that stack and is what
    a profile-less composition would use. Profiles must state coverage_minimum, so in practice the
    profile's number is the one the gate enforces.
    """
    table = dict(zip(_TOOLCHAIN_TOKENS,
                     _resolve_toolchain(ci_profile, cicd_manifest, cicd_pack_id)))
    for token, (section, key) in _PROFILE_TOKENS:
        table[token] = str(_require(ci_profile, section, key))
    if coverage_floor is not None:
        table["<<CI_COVERAGE_FLOOR>>"] = str(coverage_floor)
    return table


def _resolve_toolchain(ci_profile: dict, cicd_manifest: dict, cicd_pack_id: str) -> tuple[str, str]:
    """Map ci-profile.toolchain.id through the CI/CD pack's toolchain_map. An id the pack has no
    entry for FAILS CLOSED naming both — installing a pipeline that sets up the wrong runtime is
    worse than not installing one."""
    tid = str(_require(ci_profile, "toolchain", "id"))
    tmap = cicd_manifest.get("toolchain_map")
    if not isinstance(tmap, dict) or not tmap:
        raise ValueError(f"CI/CD pack '{cicd_pack_id}' declares no toolchain_map; it cannot realize "
                         f"any stack's toolchain (add a toolchain_map: block to its pack.yaml)")
    entry = tmap.get(tid)
    if not isinstance(entry, dict):
        raise ValueError(
            f"CI/CD pack '{cicd_pack_id}' has no toolchain_map entry for ci-profile toolchain.id "
            f"'{tid}' (mapped: {sorted(tmap)}); add one to packs/cicd/{cicd_pack_id}/pack.yaml"
        )
    for field in ("action", "input"):
        if not entry.get(field):
            raise ValueError(f"CI/CD pack '{cicd_pack_id}' toolchain_map.{tid} is missing "
                             f"'{field}'")
    return str(entry["action"]), str(entry["input"])


def _require(ci_profile: dict, section: str, key: str):
    block = ci_profile.get(section)
    if not isinstance(block, dict) or block.get(key) is None:
        raise ValueError(f"ci-profile.yaml is missing {section}.{key}; the CI/CD pack references it "
                         f"as a <<CI_*>> token and cannot install without it")
    return block[key]


def substitute(text: str, tokens: dict[str, str]) -> str:
    """Fill every compose-time token. Non-CI tokens are not in the table and so pass through."""
    for token, value in tokens.items():
        text = text.replace(token, value)
    return text


def residual_tokens(text: str) -> list[str]:
    """Every distinct unfilled SEAM token, sorted. Non-empty after substitution = fail closed;
    non-empty with no stack pack = the Phase-3 work the degrade warning reports.

    Scoped to SEAM_TOKENS, so a Phase-3 blank that merely shares the prefix (<<CI_WORKFLOW_NAME>>)
    is never mistaken for an installer bug.
    """
    return sorted(set(_CI_TOKEN_RE.findall(text)) & SEAM_TOKENS)
