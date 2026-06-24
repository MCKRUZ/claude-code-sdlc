"""Enforce the Definition of Ready on a Build-loop spec (specs/NNNN-name.md).

This is the "Intent rail": a story becomes buildable only by clearing the Definition of Ready.
The checks here are the mechanical floor of that bar — structure, the risk tier, scope in/out,
no unfilled placeholders — plus a vague-line *lint* that surfaces acceptance-check lines likely
to fail the vague-line test. The lint advises (SHOULD); the real vague-line test
("could two people build different things from this line?") is a human/grader judgment, exactly
as the grader advises but never blocks in the Discern beat.

MUST findings block (exit 1); SHOULD findings advise (exit 0). Mirrors check_gates.py severities.

Standalone or Workflow (CLAUDE.md design rule):
  - Standalone: --spec specs/NNNN-name.md      (no .sdlc/ required)
  - Workflow:   --spec ... --state .sdlc/state.yaml  (also logs metrics to .sdlc/metrics/)
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import risk_model as rm

VALID_RISK = rm.RISK_TIERS

# Sections every ready spec must carry. Matched as `## <heading>` (case-insensitive).
REQUIRED_SECTIONS = [
    "Goal",
    "Why",
    "Scope",
    "Acceptance Checks",
    "Risk Tier",
    "Delegation Plan",
    "Checking Plan",
]

# Unfilled-template markers — a ready spec has none of these.
PLACEHOLDER_RE = re.compile(r"(\bTODO\b|\bTBD\b|\bFIXME\b|\[\.\.\.\]|\bNNNN\b|<title>|<what |short-kebab-name)")

# Vague words that signal a wish rather than a check (word-boundary, case-insensitive).
VAGUE_WORDS = [
    "gracefully", "appropriately", "properly", "correctly", "as needed", "as appropriate",
    "where applicable", "if necessary", "etc", "and so on", "user-friendly", "intuitive",
    "robust", "scalable", "performant", "seamless", "reasonable", "sensible", "flexible",
    "reliable", "efficient", "fast", "quickly", "handle errors", "various", "some", "several",
    "good", "nice", "clean", "simple",
]
VAGUE_RE = re.compile(r"(?<![\w-])(" + "|".join(re.escape(w) for w in VAGUE_WORDS) + r")(?![\w-])", re.IGNORECASE)

# A check line is "concrete" if it carries at least one verifiable signal.
CONCRETE_RE = re.compile(r"(\d|`[^`]+`|\"[^\"]+\"|'[^']+'|\{|=>|==|<=|>=|->|/\w)")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body). Empty dict if no parseable frontmatter block."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    block = text[3:end].strip("\n")
    body = text[end + 4:]
    fm: dict[str, str] = {}
    for line in block.splitlines():
        line = line.split("#", 1)[0].rstrip() if "#" in line else line
        if ":" in line:
            key, _, val = line.partition(":")
            fm[key.strip()] = val.strip().strip('"').strip("'").strip()
    return fm, body


def extract_section(body: str, heading: str) -> str | None:
    """Body of a `## <heading>` section up to the next `## `. None if the heading is absent."""
    pattern = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.IGNORECASE | re.MULTILINE)
    m = pattern.search(body)
    if not m:
        return None
    start = m.end()
    nxt = re.compile(r"^##\s+", re.MULTILINE).search(body, start)
    return body[start: nxt.start() if nxt else len(body)]


def strip_comments_and_blanks(section: str) -> list[str]:
    """Content lines of a section: HTML comments and blank lines removed."""
    no_comments = re.sub(r"<!--.*?-->", "", section, flags=re.DOTALL)
    return [ln.rstrip() for ln in no_comments.splitlines() if ln.strip()]


def list_items(section: str) -> list[str]:
    """Bullet/numbered/checkbox item text from a section (markers and checkbox stripped)."""
    items = []
    for ln in strip_comments_and_blanks(section):
        m = re.match(r"^\s*(?:[-*+]|\d+\.)\s+(.*)$", ln)
        if not m:
            continue
        text = re.sub(r"^\[[ xX]\]\s*", "", m.group(1)).strip()
        if text:
            items.append(text)
    return items


def finding(check: str, passed: bool, severity: str, message: str) -> dict:
    return {"check": check, "passed": passed, "severity": severity, "message": message}


def check_spec_text(text: str) -> list[dict]:
    """Run all Definition-of-Ready checks against spec file text. Returns findings."""
    results: list[dict] = []
    fm, body = parse_frontmatter(text)

    # --- Frontmatter / risk tier (first-class field) ---
    if not fm:
        results.append(finding("frontmatter", False, "MUST",
                               "No parseable YAML frontmatter — spec id, name, and risk tier must live there"))
    else:
        if not fm.get("name") or fm["name"] == "short-kebab-name":
            results.append(finding("name", False, "MUST", "Frontmatter `name` is missing or still the template default"))
        else:
            results.append(finding("name", True, "MUST", f"name: {fm['name']}"))

        risk = (fm.get("risk") or "").upper()
        if risk not in VALID_RISK:
            results.append(finding("risk-tier", False, "MUST",
                                   f"Frontmatter `risk` must be one of {', '.join(VALID_RISK)} (got '{fm.get('risk', '')}')"))
        else:
            results.append(finding("risk-tier", True, "MUST", f"risk: {risk}"))

        hc = (fm.get("harness_context") or "").strip()
        if not hc:
            results.append(finding("harness-context", False, "SHOULD",
                                   "DoR: name the ONE existing pattern this change reuses (frontmatter `harness_context`)"))
        else:
            results.append(finding("harness-context", True, "SHOULD", "harness context named"))

    # --- Required sections present ---
    sections = {h: extract_section(body, h) for h in REQUIRED_SECTIONS}
    missing = [h for h, s in sections.items() if s is None]
    if missing:
        results.append(finding("sections", False, "MUST", f"Missing required section(s): {', '.join(missing)}"))
    else:
        results.append(finding("sections", True, "MUST", "all required sections present"))

    # --- Scope in AND scope out both stated ---
    scope = sections.get("Scope")
    if scope is not None:
        in_scope = extract_subsection(scope, "In scope")
        out_scope = extract_subsection(scope, "Out of scope")
        if not _has_content(in_scope):
            results.append(finding("scope-in", False, "MUST", "Scope > In scope is empty — state what the change may touch"))
        else:
            results.append(finding("scope-in", True, "MUST", "in-scope stated"))
        if not _has_content(out_scope):
            results.append(finding("scope-out", False, "MUST",
                                   "Scope > Out of scope is empty — what the change must not touch is load-bearing"))
        else:
            results.append(finding("scope-out", True, "MUST", "out-of-scope stated"))

    # --- Acceptance checks present + vague-line lint ---
    acc = sections.get("Acceptance Checks")
    if acc is not None:
        checks = list_items(acc)
        if not checks:
            results.append(finding("acceptance", False, "MUST", "No acceptance checks — Intent needs at least one testable check"))
        else:
            results.append(finding("acceptance", True, "MUST", f"{len(checks)} acceptance check(s)"))
            for c in checks:
                reasons = []
                vague_hit = VAGUE_RE.search(c)
                if vague_hit:
                    reasons.append(f"vague word '{vague_hit.group(0)}'")
                if not CONCRETE_RE.search(c):
                    reasons.append("no concrete signal (number, status code, quoted value, code, path)")
                if reasons:
                    snippet = c if len(c) <= 70 else c[:67] + "..."
                    results.append(finding("vague-line", False, "SHOULD",
                                           f"Acceptance check may fail the vague-line test ({'; '.join(reasons)}): \"{snippet}\""))

    # --- No unfilled placeholders anywhere ---
    body_no_comments = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    ph = PLACEHOLDER_RE.search(body_no_comments)
    if ph:
        results.append(finding("placeholders", False, "MUST",
                               f"Unfilled template placeholder present: '{ph.group(0)}' — a ready spec has none"))
    else:
        results.append(finding("placeholders", True, "MUST", "no unfilled placeholders"))

    # --- Risk-tier field/section agreement ---
    if fm.get("risk") and sections.get("Risk Tier"):
        tier_in_section = re.search(r"\*\*Tier:\*\*\s*(\w+)", sections["Risk Tier"])
        if tier_in_section and tier_in_section.group(1).upper() != fm["risk"].upper():
            results.append(finding("risk-agreement", False, "MUST",
                                   f"Risk Tier section ({tier_in_section.group(1)}) disagrees with frontmatter risk ({fm['risk']})"))

    # --- Checking Plan depth matches the risk tier (risk tier drives gate depth) ---
    tier = rm.normalize_tier(fm.get("risk"))
    plan = sections.get("Checking Plan")
    if tier and plan is not None:
        depth = re.search(r"\*\*Ladder depth:\*\*\s*([A-Za-z]+)", plan)
        declared = rm.normalize_tier(depth.group(1)) if depth else None
        if declared is None:
            results.append(finding("checking-plan", False, "MUST",
                                   "Checking Plan must declare **Ladder depth:** as HIGH | MEDIUM | LOW"))
        elif declared != tier:
            results.append(finding("checking-plan", False, "MUST",
                                   f"Checking Plan ladder depth ({declared}) must match the risk tier ({tier}) — the tier sets the climb"))
        else:
            results.append(finding("checking-plan", True, "MUST", f"checking ladder depth matches tier ({tier})"))
            # HIGH must climb the full ladder: the security pass and a named sign-off.
            if tier == "HIGH":
                specifics = plan.lower()
                if not (re.search(r"security", specifics) and re.search(r"sign[- ]?off", specifics)):
                    results.append(finding("checking-plan-high", False, "SHOULD",
                                           "HIGH spec: Checking Plan should name the security pass AND the named human sign-off"))

    return results


def extract_subsection(scope_section: str, heading: str) -> str | None:
    """Body of a `### <heading>` within the Scope section, up to the next `### `."""
    pattern = re.compile(rf"^###\s+{re.escape(heading)}\s*$", re.IGNORECASE | re.MULTILINE)
    m = pattern.search(scope_section)
    if not m:
        return None
    start = m.end()
    nxt = re.compile(r"^###\s+", re.MULTILINE).search(scope_section, start)
    return scope_section[start: nxt.start() if nxt else len(scope_section)]


def _has_content(section: str | None) -> bool:
    """True if the section has a filled list item or prose — a bare bullet marker does not count."""
    if section is None:
        return False
    if list_items(section):
        return True
    return any(
        not re.match(r"^\s*(?:[-*+]|\d+\.)\s*$", ln)
        for ln in strip_comments_and_blanks(section)
    )


def log_spec_metrics(results: list[dict], spec_path: Path, sdlc_dir: Path) -> None:
    """Append a summary entry to .sdlc/metrics/spec-log.jsonl for empirical tracking."""
    metrics_dir = sdlc_dir / "metrics"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    must_fail = [r for r in results if not r["passed"] and r["severity"] == "MUST"]
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "spec": spec_path.name,
        "passed": sum(1 for r in results if r["passed"]),
        "must_failed": len(must_fail),
        "should_failed": sum(1 for r in results if not r["passed"] and r["severity"] == "SHOULD"),
        "ready": not must_fail,
    }
    if must_fail:
        entry["blocking"] = [{"check": r["check"], "message": r["message"]} for r in must_fail]
    with open(metrics_dir / "spec-log.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def format_results(results: list[dict], spec_path: Path) -> str:
    lines = [f"Definition-of-Ready Check — {spec_path.name}", "=" * 50]
    for r in results:
        if r["passed"]:
            status = "READY"
        elif r["severity"] == "MUST":
            status = "BLOCK"
        else:
            status = "ADVISE"
        lines.append(f"  {status:<7} [{r['severity']}] {r['message']}")
    must_fail = [r for r in results if not r["passed"] and r["severity"] == "MUST"]
    should_fail = [r for r in results if not r["passed"] and r["severity"] == "SHOULD"]
    lines.append("=" * 50)
    if must_fail:
        lines.append(f"NOT READY — {len(must_fail)} blocking issue(s) must be fixed before this spec enters the loop.")
    elif should_fail:
        lines.append(f"READY (with {len(should_fail)} advisory note(s)) — review the vague-line flags before building.")
    else:
        lines.append("READY — this spec clears the Definition of Ready.")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Enforce the Definition of Ready on a Build-loop spec")
    parser.add_argument("--spec", required=True, help="Path to specs/NNNN-name.md")
    parser.add_argument("--state", default=None, help="Path to .sdlc/state.yaml (enables metrics logging)")
    args = parser.parse_args()

    spec_path = Path(args.spec)
    if not spec_path.exists():
        print(f"Error: Spec not found: {spec_path}")
        sys.exit(1)

    text = spec_path.read_text(encoding="utf-8")
    results = check_spec_text(text)
    print(format_results(results, spec_path))

    if args.state:
        state_path = Path(args.state)
        if state_path.exists():
            log_spec_metrics(results, spec_path, state_path.parent)

    must_failures = [r for r in results if not r["passed"] and r["severity"] == "MUST"]
    sys.exit(1 if must_failures else 0)


if __name__ == "__main__":
    main()
