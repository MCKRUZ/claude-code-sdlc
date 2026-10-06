"""Redact a captured `az … -o json` document before it becomes a fixture (pure; no I/O in `redact`).

Usage:  python redact.py --org contoso < captured.json > fixture.json

What is replaced, and with what — fixed fakes so a fixture is stable across captures:
  * GUIDs            → a GUID derived from the ORDER of first appearance (00000000-0000-0000-0000-000000000001, …),
                       so two fields that pointed at the same identity still point at the same fake.
  * UPNs / emails    → person1@example.com, person2@example.com, … (same stability rule).
  * the organisation → "contoso" wherever it appears in a URL or a slug (case-insensitive).
  * display names    → "Person N" matching the UPN's number when the record carries both.

Nothing else is touched: enum values, dates, booleans and shapes are the point of a fixture.
The caller still adds `"_provenance": "captured <date> <org anonymised>"` to the document.
"""

import argparse
import json
import re
import sys

GUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# The policy TYPE GUIDs are vocabulary, not identity — they must survive redaction verbatim.
KEEP_GUIDS = {
    "0609b952-1397-4640-95ec-e00a01b2c241",  # build validation
    "cbdc66da-9728-4af8-aada-9a5a32e4a226",  # status check
    "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd",  # approver count
    "fd2167ab-b0be-447a-8ec8-39368250530e",  # required reviewers
}


def redact(doc, org: str, fake_org: str = "contoso"):
    """Return a redacted deep copy of `doc` (any JSON value)."""
    guids: dict[str, str] = {}
    people: dict[str, str] = {}

    def fake_guid(real: str) -> str:
        if real.lower() in KEEP_GUIDS:
            return real
        return guids.setdefault(real.lower(), f"00000000-0000-0000-0000-{len(guids) + 1:012d}")

    def fake_email(real: str) -> str:
        return people.setdefault(real.lower(), f"person{len(people) + 1}@example.com")

    def scrub(s: str) -> str:
        s = GUID_RE.sub(lambda m: fake_guid(m.group(0)), s)
        s = EMAIL_RE.sub(lambda m: fake_email(m.group(0)), s)
        if org:
            s = re.sub(re.escape(org), fake_org, s, flags=re.IGNORECASE)
        return s

    def walk(v):
        if isinstance(v, dict):
            out = {k: walk(x) for k, x in v.items()}
            if isinstance(out.get("uniqueName"), str) and "displayName" in out:
                n = re.match(r"person(\d+)@", out["uniqueName"])
                if n:
                    out["displayName"] = f"Person {n.group(1)}"
            return out
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, str):
            return scrub(v)
        return v

    return walk(doc)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Redact a captured az JSON document for use as a fixture")
    parser.add_argument("--org", required=True, help="The real organisation name to replace with 'contoso'")
    args = parser.parse_args(argv)
    doc = json.load(sys.stdin)
    json.dump(redact(doc, args.org), sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
