"""issue_model.py — the one list behind /sdlc-report-issue and the app's Report-an-issue form, for
bugs in the PRODUCT the team is building.

The model is pure, so these tests are about its words and its judgement: every channel of the
product branches to its own follow-ups and nothing else; the minimum names every gap it finds
(and names what clears it); an image is decided by its bytes; a secret-shaped string is a
refusal, never advice; an AI-looking reporter is refused with the same regex the findings ledger
uses; the proposed risk tier follows data impact and severity and is a proposal.
"""

import struct
import zlib
from pathlib import Path

import pytest

import issue_model as im


def png_bytes(w: int = 2, h: int = 2) -> bytes:
    raw = b"".join(b"\x00" + b"\x10\x20\x30\xff" * w for _ in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def full_report(**over) -> dict:
    base = {
        "channel": "web", "title": "Claim total doubles after adding a second line item",
        "what_happened": "Adding a second line item shows the claim total as twice the sum of the two lines.",
        "expected": "The total is the sum of the line items", "steps": "open claim 1042\nadd a line item of 100\nadd a second of 50",
        "environment": "test", "severity": "degraded", "frequency": "always", "data_impact": "wrong-shown",
        "persona": "a claims adjuster", "reporter_role": "checker", "spec": "0007",
        "no_client_data": True, "browser_device": "Chrome 130 on Windows 11", "last_action": "clicked Add line item",
    }
    base.update(over)
    return base


@pytest.fixture
def shot(tmp_path) -> Path:
    p = tmp_path / "shot.png"
    p.write_bytes(png_bytes())
    return p


class TestQuestionPlan:
    def test_the_base_questions_are_asked_for_every_channel_in_order(self):
        ids = [q["id"] for q in im.BASE_QUESTIONS]
        assert ids[:2] == ["channel", "title"]
        assert {"what_happened", "expected", "steps", "environment", "severity", "frequency", "data_impact", "persona",
                "reporter_role", "screenshot", "no_client_data"} <= set(ids)
        for channel in im.CHANNELS:
            plan_ids = [q["id"] for q in im.question_plan(channel)]
            assert [i for i in plan_ids if i in ids] == ids

    @pytest.mark.parametrize("channel,expected", [
        ("web", {"url", "browser_device", "last_action"}),
        ("api", {"endpoint", "status_code", "request_id", "response_excerpt"}),
        ("voice", {"utterance", "heard", "device"}),
        ("chat", {"message", "reply", "chat_surface"}),
        ("data", {"dataset", "expected_vs_actual", "response_excerpt"}),
        ("mobile", {"browser_device", "last_action", "app_build"}),
        ("other", {"where"}),
    ])
    def test_each_channel_branches_to_exactly_its_follow_ups(self, channel, expected):
        follow_ups = {q["id"] for q in im.question_plan(channel) if q["id"] not in im.CORE_FIELDS}
        assert follow_ups == expected

    def test_the_channels_the_library_describes_map_to_their_descriptors(self):
        assert im.CHANNEL_DESCRIPTOR["web"] == "ag-ui" and im.CHANNEL_DESCRIPTOR["voice"] == "voice" and im.CHANNEL_DESCRIPTOR["chat"] == "chat"
        assert set(im.CHANNEL_DESCRIPTOR) == set(im.CHANNELS)

    def test_follow_ups_sit_right_after_the_channel_question(self):
        plan = [q["id"] for q in im.question_plan("voice")]
        assert plan[:5] == ["channel", "utterance", "heard", "device", "title"]

    def test_with_no_channel_every_follow_up_is_listed_and_names_its_channels(self):
        plan = im.question_plan(None)
        follow_ups = [q for q in plan if q["id"] not in im.CORE_FIELDS]
        assert {q["id"] for q in follow_ups} == set(im.CHANNEL_FIELD_IDS)
        assert all(q["channels"] for q in follow_ups)

    def test_every_choice_question_lists_labelled_options_and_the_file_and_confirm_kinds_exist(self):
        kinds = {q["id"]: q["kind"] for q in im.question_plan(None)}
        assert kinds["screenshot"] == "file" and kinds["no_client_data"] == "confirm"
        for q in im.question_plan(None):
            if q["kind"] == "choice":
                assert q["options"] and all(o["label"] for o in q["options"]), q["id"]

    def test_the_two_user_questions_are_both_asked(self):
        prompts = {q["id"]: q["prompt"] for q in im.BASE_QUESTIONS}
        assert "type of user" in prompts["persona"] and "role on the team" in prompts["reporter_role"]
        assert set(im.REPORTER_ROLES) >= {"builder", "checker", "owner", "product", "steering", "client", "end-user"}

    def test_required_for_names_the_channel_s_required_follow_ups_only(self):
        assert "endpoint" in im.required_for("api") and "endpoint" not in im.required_for("web")
        assert "status_code" not in im.required_for("api")


class TestValidate:
    def test_a_complete_report_with_a_real_image_has_no_blocking_gap(self, shot):
        blocking, advisory = im.validate(full_report(), [shot])
        assert blocking == []
        assert advisory == []

    def test_every_missing_core_field_is_named_with_what_clears_it(self, shot):
        blocking, _ = im.validate({"channel": "other", "no_client_data": False}, [shot])
        joined = "\n".join(blocking)
        for field in ("title", "what_happened", "expected", "steps", "environment", "severity", "frequency", "data_impact",
                      "persona", "reporter_role", "no_client_data", "where"):
            assert f"{field}:" in joined, field
        assert not any(b.startswith("screenshot:") for b in blocking)  # the one thing that was given

    def test_the_channel_follow_ups_are_required_only_for_their_channel(self, shot):
        blocking, _ = im.validate(full_report(channel="api", browser_device="", last_action=""), [shot])
        assert any(b.startswith("endpoint:") for b in blocking)
        assert not any(b.startswith("browser_device:") for b in blocking)

    def test_a_number_follow_up_must_be_a_whole_number_or_absent(self, shot):
        ok, _ = im.validate(full_report(channel="api", endpoint="POST /claims", status_code=""), [shot])
        bad, _ = im.validate(full_report(channel="api", endpoint="POST /claims", status_code="five hundred"), [shot])
        assert not any(b.startswith("status_code") for b in ok)
        assert any(b.startswith("status_code") for b in bad)

    def test_no_screenshot_is_a_gap_and_so_is_a_file_that_only_claims_to_be_an_image(self, tmp_path):
        fake = tmp_path / "shot.png"
        fake.write_bytes(b"not an image at all")
        none, _ = im.validate(full_report(), [])
        wrong, _ = im.validate(full_report(), [fake])
        assert any(b.startswith("screenshot:") and "at least one" in b for b in none)
        assert any("not a PNG, JPEG, GIF or WebP" in b for b in wrong)

    def test_an_oversized_screenshot_is_a_gap(self, tmp_path, monkeypatch):
        p = tmp_path / "big.png"
        p.write_bytes(png_bytes())
        monkeypatch.setattr(im, "MAX_SCREENSHOT_BYTES", 10)
        blocking, _ = im.validate(full_report(), [p])
        assert any("over 10 MB" in b for b in blocking)

    def test_a_bad_spec_id_and_a_long_title_are_gaps(self, shot):
        blocking, _ = im.validate(full_report(spec="7", title="x" * 200), [shot])
        assert any(b.startswith("spec:") for b in blocking)
        assert any("at most" in b for b in blocking)

    def test_one_step_is_advisory_not_blocking(self, shot):
        blocking, advisory = im.validate(full_report(steps="open claim 1042"), [shot])
        assert blocking == []
        assert any(a.startswith("steps:") for a in advisory)

    def test_a_production_bug_without_the_escaped_check_is_advisory_and_data_damage_is_too(self, shot):
        _, advisory = im.validate(full_report(environment="production"), [shot])
        assert any(a.startswith("escaped_from:") for a in advisory)
        _, advisory = im.validate(full_report(environment="production", escaped_from="grader"), [shot])
        assert not any(a.startswith("escaped_from:") for a in advisory)
        _, advisory = im.validate(full_report(data_impact="exposed"), [shot])
        assert any(a.startswith("data_impact:") and "Data should see" in a for a in advisory)


class TestRefusals:
    def test_an_ai_looking_reporter_is_refused(self):
        assert any("reads as an AI" in r for r in im.refusals(full_report(), "Claude"))
        assert any("reads as an AI" in r for r in im.refusals(full_report(), "the build bot"))
        assert im.refusals(full_report(), "Priya N.") == []

    def test_a_blank_reporter_is_refused(self):
        assert any("--by is required" in r for r in im.refusals(full_report(), "  "))

    @pytest.mark.parametrize("text,label", [
        ("token ghp_abcdefghijklmnopqrstuvwxyz012345", "a GitHub token"),
        ("key AKIAABCDEFGHIJKLMNOP in the env", "an AWS access key"),
        ("-----BEGIN RSA PRIVATE KEY-----", "a private key"),
        ("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789", "a bearer token"),
        ("sk-abcdefghijklmnopqrstuvwxyz0123456789", "an API key"),
        ("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk", "a JSON web token"),
        ("Server=db;Password=hunter2secret;", "a connection string with a password"),
    ])
    def test_a_secret_shaped_string_anywhere_in_the_words_is_refused_by_kind_never_quoted(self, text, label):
        reasons = im.refusals(full_report(what_happened=f"the response carried {text} in the body of the error"), "Priya N.")
        assert any(label in r for r in reasons)
        assert not any(text.split()[-1] in r for r in reasons)  # the secret itself is never echoed

    def test_a_secret_in_a_channel_follow_up_is_refused_too(self):
        reasons = im.refusals(full_report(channel="api", endpoint="POST /claims", response_excerpt="Bearer abcdefghijklmnopqrstuvwxyz0123456789"), "Priya N.")
        assert any("bearer token" in r for r in reasons)

    def test_ordinary_words_are_not_secrets(self):
        assert im.secrets_in("the total shows 300 instead of 150; claim 1042; adjuster view") == []
        assert im.secrets_in("the connection string read Password=******** in the log") == []
        assert im.secrets_in("Bearer authentication is required for this endpoint") == []
        assert im.secrets_in("Server=db;Password=hunter2secret;") == ["a connection string with a password"]

    def test_a_secret_in_an_extra_answer_is_refused(self):
        assert any("GitHub token" in r for r in im.refusals(full_report(extra="ghp_abcdefghijklmnopqrstuvwxyz012345"), "Priya N."))


class TestProposedRisk:
    @pytest.mark.parametrize("over,tier", [
        ({}, "MEDIUM"),                                                         # wrong data shown
        ({"data_impact": "none", "severity": "cosmetic"}, "LOW"),
        ({"data_impact": "none", "severity": "blocks", "environment": "test"}, "MEDIUM"),
        ({"data_impact": "none", "severity": "blocks", "environment": "production"}, "HIGH"),
        ({"data_impact": "wrong-written", "severity": "cosmetic"}, "HIGH"),
        ({"data_impact": "exposed", "severity": "degraded"}, "HIGH"),
    ])
    def test_the_proposal_follows_data_impact_then_severity_and_environment(self, over, tier):
        assert im.proposed_risk(full_report(**over)) == tier


class TestImagesAndIds:
    def test_image_kind_reads_the_bytes(self, tmp_path):
        png = tmp_path / "a.bin"; png.write_bytes(png_bytes())
        jpg = tmp_path / "b.bin"; jpg.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 12)
        gif = tmp_path / "c.bin"; gif.write_bytes(b"GIF89a" + b"\x00" * 10)
        webp = tmp_path / "d.bin"; webp.write_bytes(b"RIFF\x00\x00\x00\x00WEBPVP8 ")
        txt = tmp_path / "e.png"; txt.write_bytes(b"PNG but not really")
        assert [im.image_kind(p) for p in (png, jpg, gif, webp, txt)] == ["png", "jpeg", "gif", "webp", None]
        assert im.image_kind(tmp_path / "missing.png") is None

    def test_ids_are_allocated_max_plus_one_from_the_folder(self):
        assert im.next_issue_id([]) == "ISS-0001"
        assert im.next_issue_id(["ISS-0003-x.md", "ISS-0001-y.md", "ISS-0003", "notes.md"]) == "ISS-0004"

    def test_slugs_are_short_kebab_case(self):
        assert im.slugify("Claim total doubles, after adding a second line item!") == "claim-total-doubles-after-adding-a-second-line-i"
        assert im.slugify("   ") == "issue"
        assert len(im.slugify("w" * 100)) <= 48


def test_no_per_person_aggregation_exists_in_the_model():
    """Presence, never totals (the standard's rule): the model knows a reporter per report and
    offers nothing that counts reports per person."""
    names = {n for n in dir(im) if not n.startswith("_")}
    assert not {n for n in names if "per_person" in n or "by_person" in n or "leaderboard" in n}


class TestLifecycle:
    def test_the_states_and_the_queue_order_read_decisions_first(self):
        assert im.STATUSES == ("new", "needs-info", "triaged", "prioritized", "promoted", "fixed", "wont-fix", "duplicate")
        assert im.TERMINAL_STATUSES == ("fixed", "wont-fix", "duplicate")
        assert im.QUEUE_ORDER["new"] < im.QUEUE_ORDER["triaged"] < im.QUEUE_ORDER["promoted"] < im.QUEUE_ORDER["fixed"]

    @pytest.mark.parametrize("action,current,expected", [
        ("triage:confirmed", "new", "triaged"), ("triage:confirmed", "needs-info", "triaged"), ("triage:confirmed", "triaged", None),
        ("triage:needs-info", "new", "needs-info"), ("triage:duplicate", "prioritized", "duplicate"), ("triage:wont-fix", "promoted", None),
        ("prioritize", "triaged", "prioritized"), ("prioritize", "prioritized", "prioritized"), ("prioritize", "new", None),
        ("promote", "prioritized", "promoted"), ("promote", "triaged", None), ("promote", "new", None), ("promote", "promoted", None),
        ("fixed", "promoted", "fixed"), ("fixed", "triaged", "fixed"), ("fixed", "new", None),
        ("wont-fix", "promoted", "wont-fix"), ("duplicate", "new", "duplicate"), ("reopen", "fixed", "new"), ("reopen", "triaged", None),
    ])
    def test_transitions_follow_review_then_priority_then_spec(self, action, current, expected):
        assert im.next_status(action, current) == expected

    def test_a_refusal_names_only_actions_the_lifecycle_allows_from_there(self):
        assert im.allowed_from("promoted") == ["set-status fixed", "set-status wont-fix", "set-status duplicate"]
        assert im.allowed_from("new") == ["triage", "set-status wont-fix", "set-status duplicate"]
        sentence = im.transition_refusal("triage:confirmed", "promoted", "ISS-0001")
        allows = sentence.split("the lifecycle allows:")[1]
        assert "prioritize" not in allows and "promote" not in allows and "set-status fixed" in allows

    def test_a_refusal_says_what_comes_first(self):
        assert "review it first" in im.transition_refusal("promote", "new", "ISS-0001")
        assert "prioritize" in im.transition_refusal("promote", "triaged", "ISS-0001")
        assert "already has a bugfix spec" in im.transition_refusal("promote", "promoted", "ISS-0001")
        assert "confirmed" in im.transition_refusal("prioritize", "new", "ISS-0001")
        assert "reopen" in im.transition_refusal("promote", "fixed", "ISS-0001")
        assert "nobody has confirmed" in im.transition_refusal("fixed", "new", "ISS-0001")
        assert "nothing to reopen" in im.transition_refusal("reopen", "triaged", "ISS-0001")

    @pytest.mark.parametrize("over,priority", [
        ({}, "P2"),                                                           # wrong data shown, always
        ({"frequency": "sometimes"}, "P3"),
        ({"data_impact": "none", "severity": "cosmetic"}, "P3"),
        ({"data_impact": "none", "severity": "blocks", "environment": "test"}, "P2"),
        ({"data_impact": "none", "severity": "blocks", "environment": "production"}, "P1"),
        ({"data_impact": "exposed", "severity": "cosmetic", "frequency": "once"}, "P1"),
        ({"data_impact": "wrong-written"}, "P1"),
    ])
    def test_the_priority_proposal_follows_data_impact_then_severity_then_environment(self, over, priority):
        assert im.proposed_priority(full_report(**over)) == priority

    def test_every_vocabulary_has_a_label(self):
        assert set(im.STATUS_LABELS) == set(im.STATUSES)
        assert set(im.TRIAGE_VERDICT_LABELS) == set(im.TRIAGE_VERDICTS)
        assert set(im.PRIORITY_LABELS) == set(im.PRIORITIES)
