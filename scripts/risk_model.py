"""
risk_model.py — Single source of truth for the risk taxonomy and the checking ladder.

A spec's risk tier (HIGH / MEDIUM / LOW, assigned by a human at triage) sets how high its
change climbs the checking ladder in the Discern beat. This module encodes that mapping once,
so check_spec.py (Definition-of-Ready enforcement) and any other consumer resolve the required
review depth the same way instead of each re-deriving it from the prose.

The mapping is the playbook's, verbatim in spirit (build-loop.md §4 "Discern", the-rails.md §3-4):

  - CI mechanical gates (build/test/lint/coverage) block on EVERY change, every tier.
  - The grader runs on every change; it advises, it never blocks.
  - The correctness gate runs on every change; it blocks on a high-confidence defect.
  - A non-author approval is required on every PR, every tier — the author never approves their
    own work, and this rule survives every collapse of pod size.
  - HIGH adds a security pass (blocks) and a named human sign-off recorded in the PR.
  - The security pass also fires path-triggered (any PR touching a gated path), independent of tier.

What scales by tier is the DEPTH of the human review and whether the security pass + named
sign-off are mandatory — not whether checking happens at all. One depth for everything fails in
both directions: typo fixes drown in ceremony, auth changes get waved through on a glance.
"""

RISK_TIERS = ("HIGH", "MEDIUM", "LOW")

# What lands in each tier and what the tier triggers (the taxonomy that also lives in CLAUDE.md
# so agents see it). Examples are the standard's defaults; a project tunes them in risk-tier-map.md.
TAXONOMY = {
    "HIGH": {
        "lands_here": (
            "auth/identity, payments, personal or client data handling, schema migrations, "
            "public API contract changes, infrastructure and pipeline changes, AI-behavior "
            "changes (prompts, models, tool definitions), anything hard to undo"
        ),
        "triggers": "tight agent permissions, the full checking ladder, a security review pass, a named human sign-off in the PR",
    },
    "MEDIUM": {
        "lands_here": "new business logic, external integrations, changes to shared internal services",
        "triggers": "standard permissions, grader plus a human Checker",
    },
    "LOW": {
        "lands_here": "UI within existing patterns, copy, internal tooling, additive CRUD on established rails",
        "triggers": "lighter review; the grader and the mechanical gates still run",
    },
}

# review_depth is the human-look depth; the booleans are what the rails/merge-bar must enforce.
_LADDER = {
    "HIGH": {
        "review_depth": "full",
        "ci_blocks": True,
        "grader_runs": True,
        "correctness_blocks_on_defect": True,
        "non_author_approval": True,
        "security_pass_required": True,
        "named_signoff_required": True,
    },
    "MEDIUM": {
        "review_depth": "standard",
        "ci_blocks": True,
        "grader_runs": True,
        "correctness_blocks_on_defect": True,
        "non_author_approval": True,
        "security_pass_required": False,
        "named_signoff_required": False,
    },
    "LOW": {
        "review_depth": "light",
        "ci_blocks": True,
        "grader_runs": True,
        "correctness_blocks_on_defect": True,
        "non_author_approval": True,
        "security_pass_required": False,
        "named_signoff_required": False,
    },
}


def normalize_tier(tier) -> str | None:
    """Canonical upper-case tier from any source, or None if not a valid tier."""
    if tier is None:
        return None
    t = str(tier).strip().upper()
    return t if t in RISK_TIERS else None


def is_valid_tier(tier) -> bool:
    return normalize_tier(tier) is not None


def resolve_ladder(tier, touches_gated_path: bool = False) -> dict | None:
    """The required checking ladder for a tier.

    Pass touches_gated_path=True when the change touches a registered gated path (auth,
    migrations, infra, pipeline): the security pass fires regardless of tier (the-rails.md §3).
    Returns None for an unknown tier.
    """
    t = normalize_tier(tier)
    if t is None:
        return None
    ladder = dict(_LADDER[t])
    if touches_gated_path:
        ladder["security_pass_required"] = True
    return ladder


def required_rungs(tier, touches_gated_path: bool = False) -> list[str]:
    """Human-readable list of the gates a tier must clear, in ladder order."""
    ladder = resolve_ladder(tier, touches_gated_path)
    if ladder is None:
        return []
    rungs = ["CI (build/test/lint/coverage) — blocks", "grader — runs, advises", "correctness — blocks on a defect"]
    if ladder["security_pass_required"]:
        rungs.append("security pass — blocks")
    rungs.append(f"non-author approval — required ({ladder['review_depth']} review)")
    if ladder["named_signoff_required"]:
        rungs.append("named human sign-off in the PR")
    return rungs
