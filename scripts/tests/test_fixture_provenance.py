"""Every Azure DevOps fixture says where it came from (code-host providers).

The normalisers in ado_map.py were first written against the REST reference; on 2026-10-05 real
`az` output was captured (anonymised) into `captured/`, and `ado_fixtures.load()` now prefers it.
A hand-written document is still the ONLY evidence for a few shapes no real organisation
exercised (a draft PR, a `rejected` evaluation, a grader comment with the verdict block). The
one thing a test can do about that is keep it visible: fail when a fixture carries no provenance,
and print — every run — the hand-written files that `load()` still resolves to, so the day a
capture lands for one of them is the day this list shrinks.
"""

import json
import re

import pytest

from tests.ado_fixtures import CAPTURED, FIXTURES, fixture_path, source_of

HAND_WRITTEN = "hand-written (unverified)"
CAPTURED_RE = re.compile(r"^captured \d{4}-\d{2}-\d{2} .+")

HAND_WRITTEN_FILES = sorted(FIXTURES.glob("*.json"))
CAPTURED_FILES = sorted(CAPTURED.glob("*.json"))
FIXTURE_FILES = HAND_WRITTEN_FILES + CAPTURED_FILES


def _provenance(path) -> str | None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc.get("_provenance") if isinstance(doc, dict) else None


def test_there_are_fixtures_at_all():
    assert HAND_WRITTEN_FILES, f"no fixtures under {FIXTURES}"
    assert CAPTURED_FILES, f"no captured fixtures under {CAPTURED}"


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_every_fixture_carries_a_recognised_provenance(path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(doc, dict), f"{path.name}: wrap array answers as {{_provenance, _command, value}}"
    prov = doc.get("_provenance")
    assert prov, f"{path.name}: missing _provenance"
    assert prov == HAND_WRITTEN or CAPTURED_RE.match(prov), f"{path.name}: unrecognised _provenance {prov!r}"


@pytest.mark.parametrize("path", CAPTURED_FILES, ids=lambda p: p.name)
def test_every_captured_fixture_is_wrapped_and_says_it_was_captured(path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert CAPTURED_RE.match(doc["_provenance"]), path.name
    assert "_command" in doc and "value" in doc, f"{path.name}: captured files carry the az command and its value"


def test_load_prefers_the_captured_file_and_says_so():
    assert source_of("pr_list") == "captured" and fixture_path("pr_list").parent == CAPTURED
    assert fixture_path("pr_list", hand_written=True).parent == FIXTURES
    assert source_of("no_such_fixture") == "hand-written"  # falls through to the folder; load() would then fail loudly


def test_hand_written_fixtures_still_in_use_are_listed_not_hidden(capsys):
    """Two lists. The first names hand-written files that `load()` STILL resolves to (no capture
    exists for the name); the second names hand-written files a capture has superseded but that a
    test still reaches on purpose with `hand_written=True`. Neither is a gate: the list is
    information for a person."""
    hand_written = [p for p in HAND_WRITTEN_FILES if _provenance(p) == HAND_WRITTEN]
    still_default = [p.name for p in hand_written if source_of(p.stem) == "hand-written"]
    superseded = [p.name for p in hand_written if source_of(p.stem) == "captured"]
    with capsys.disabled():
        if still_default:
            print(f"\n[code-host] {len(still_default)} Azure DevOps fixture(s) have NO capture and are hand-written: "
                  + ", ".join(still_default))
        else:
            print("\n[code-host] every Azure DevOps fixture name resolves to a captured file")
        if superseded:
            print(f"[code-host] {len(superseded)} hand-written fixture(s) are superseded by a capture and reachable "
                  f"only with load(name, hand_written=True): " + ", ".join(superseded))


def test_no_fixture_carries_an_obvious_real_identity():
    """redact.py's output shape: fake GUIDs, example.com people, contoso."""
    for path in FIXTURE_FILES:
        text = path.read_text(encoding="utf-8")
        emails = set(re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text))
        emails -= {e for e in emails if e.startswith("git@")}  # an ssh remote's user, not a person
        assert all(e.endswith("@example.com") for e in emails), f"{path.name}: {emails}"


def test_redact_is_deterministic_and_keeps_policy_type_guids():
    import importlib.util
    spec = importlib.util.spec_from_file_location("redact", FIXTURES / "redact.py")
    redact = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(redact)
    doc = {"createdBy": {"uniqueName": "Sam.K@corp.example", "displayName": "Sam K",
                         "id": "11111111-2222-3333-4444-555555555555"},
           "repo": {"id": "11111111-2222-3333-4444-555555555555", "url": "https://dev.azure.com/RealOrg/x"},
           "type": {"id": "0609b952-1397-4640-95ec-e00a01b2c241"}}
    out = redact.redact(doc, "RealOrg")
    assert out["createdBy"]["uniqueName"] == "person1@example.com"
    assert out["createdBy"]["displayName"] == "Person 1"
    assert out["createdBy"]["id"] == out["repo"]["id"] == "00000000-0000-0000-0000-000000000001"
    assert out["repo"]["url"] == "https://dev.azure.com/contoso/x"
    assert out["type"]["id"] == "0609b952-1397-4640-95ec-e00a01b2c241"
    assert redact.redact(doc, "RealOrg") == out
