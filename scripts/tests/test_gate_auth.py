"""Tests for gate_auth.py — how the review gates sign in to Claude.

This script handles a real credential, so the tests are mostly about what it must NEVER do.
The happy path is one call to the code host; the value is entirely in the refusals.

  THE CREDENTIAL NEVER TOUCHES DISK. Not a config file, not a cache, not a temporary file. The
  code host already stores it encrypted, and a second copy on a laptop is a second thing that
  can leak — from the machine more likely to be lost.

  IT NEVER APPEARS IN A COMMAND LINE. An argument is visible to anything that can list
  processes. It goes through standard input instead.

  IT IS NEVER ECHOED, not even back at the person who mistyped it. A refusal that quotes the
  value puts it in a terminal history and in any screenshot of the failure.

  A WRITE IS READ BACK. This credential's failure mode is silent and late: a gate that cannot
  sign in fails on somebody ELSE's pull request, long after the person who set it walked away.
"""

import json
import subprocess
from pathlib import Path

import pytest

import gate_auth as ga


class FakeGh:
    """Stands in for the code host, and records exactly how it was called.

    Records argv and stdin separately, which is the point: several tests assert the credential
    was in one and never the other.
    """

    def __init__(self, secrets=(), fail=None):
        self.secrets = list(secrets)
        self.fail = fail or {}
        self.calls: list[tuple[list[str], str | None]] = []

    def __call__(self, cmd, input=None, capture_output=True, text=True, check=False):
        self.calls.append((list(cmd), input))
        if cmd[:2] == ["git", "-C"]:
            return subprocess.CompletedProcess(cmd, 0, "https://github.com/acme/widgets.git\n", "")
        verb = cmd[2] if len(cmd) > 2 else ""
        if verb == "list":
            if "list" in self.fail:
                return subprocess.CompletedProcess(cmd, 1, "", self.fail["list"])
            payload = json.dumps([{"name": n} for n in self.secrets])
            return subprocess.CompletedProcess(cmd, 0, payload, "")
        if verb == "set":
            if "set" in self.fail:
                return subprocess.CompletedProcess(cmd, 1, "", self.fail["set"])
            if not self.fail.get("silent_set"):
                self.secrets.append(cmd[3])
            return subprocess.CompletedProcess(cmd, 0, "", "")
        if verb == "delete":
            if "delete" in self.fail:
                return subprocess.CompletedProcess(cmd, 1, "", self.fail["delete"])
            self.secrets = [s for s in self.secrets if s != cmd[3]]
            return subprocess.CompletedProcess(cmd, 0, "", "")
        return subprocess.CompletedProcess(cmd, 0, "", "")


GOOD_KEY = "sk-ant-api03-" + "a" * 40
GOOD_TOKEN = "sk-ant-oat01-" + "b" * 40


@pytest.fixture
def gh(monkeypatch):
    fake = FakeGh()
    monkeypatch.setattr(ga.subprocess, "run", fake)
    return fake


class TestTheCredentialNeverTouchesDisk:
    def test_setting_one_writes_no_file_anywhere_under_the_repo(self, tmp_path, gh):
        # The assertion is on the FILESYSTEM, not on the code — an implementation that started
        # caching "for convenience" would pass a mock-based test and fail this one.
        before = {p for p in tmp_path.rglob("*")}
        ga.set_credential(tmp_path, "api-key", GOOD_KEY)
        assert {p for p in tmp_path.rglob("*")} == before

    def test_nor_anywhere_under_the_home_directory_it_was_given(self, tmp_path, gh, monkeypatch):
        home = tmp_path / "home"
        home.mkdir()
        monkeypatch.setenv("HOME", str(home))
        monkeypatch.setenv("USERPROFILE", str(home))
        ga.set_credential(tmp_path, "subscription", GOOD_TOKEN)
        assert list(home.rglob("*")) == []


class TestItNeverAppearsInACommandLine:
    def test_the_credential_goes_through_stdin(self, tmp_path, gh):
        ga.set_credential(tmp_path, "api-key", GOOD_KEY)
        set_call = next(c for c in gh.calls if c[0][:3] == ["gh", "secret", "set"])
        assert set_call[1] == GOOD_KEY

    def test_and_appears_in_NO_argument_of_ANY_call(self, tmp_path, gh):
        # Every call, not just the one that sets it: a later read-back that echoed the value
        # into an argument would be just as visible to anything listing processes.
        ga.set_credential(tmp_path, "api-key", GOOD_KEY)
        for argv, _ in gh.calls:
            assert not any(GOOD_KEY in str(a) for a in argv), argv


class TestItIsNeverEchoed:
    # Distinctive on purpose. Short or common strings ("no") and text the help message
    # legitimately contains (the console URL) make this assertion pass or fail for reasons
    # that have nothing to do with echoing — the first version of this test failed on exactly
    # that and proved nothing either way.
    @pytest.mark.parametrize("mode,bad", [
        # Each is something the validator genuinely REJECTS — an earlier version used values
        # it happily accepts (it is loose on purpose), so the test proved nothing.
        ("api-key", "MYACTUALSECRET-zzzq7"),                      # no sk-ant- prefix
        ("subscription", "short-zzzq7"),                          # too short to be a token
        ("api-key", "https://example.invalid/?t=zzzq7"),          # a URL, not a credential
    ])
    def test_a_refusal_does_not_quote_what_was_typed(self, mode, bad):
        # Somebody who pastes the wrong thing should not find it in their shell history via
        # the error message — or in a screenshot of the failure.
        with pytest.raises(ga.GateAuthError) as e:
            ga.validate(mode, bad)
        assert "zzzq7" not in str(e.value)

    def test_a_refusal_says_what_shape_was_expected_instead(self):
        with pytest.raises(ga.GateAuthError) as e:
            ga.validate("api-key", "nonsense")
        assert "sk-ant-" in str(e.value)

    def test_status_reports_only_WHETHER_a_credential_exists(self, tmp_path, monkeypatch):
        fake = FakeGh(secrets=[ga.API_KEY_SECRET])
        monkeypatch.setattr(ga.subprocess, "run", fake)
        result = ga.status(tmp_path)
        assert result["configured"] == ["api-key"]
        assert GOOD_KEY not in json.dumps(result)


class TestAWriteIsReadBack:
    def test_a_set_the_code_host_silently_ignored_is_REFUSED(self, tmp_path, monkeypatch):
        # The failure this guards is silent and late: the command exits 0, nobody looks again,
        # and the gate fails weeks later on somebody else's pull request.
        fake = FakeGh(fail={"silent_set": True})
        monkeypatch.setattr(ga.subprocess, "run", fake)
        with pytest.raises(ga.GateAuthError) as e:
            ga.set_credential(tmp_path, "api-key", GOOD_KEY)
        assert e.value.kind == "not_confirmed"
        assert "admin" in str(e.value)

    def test_a_successful_set_is_confirmed_against_the_code_host(self, tmp_path, gh):
        result = ga.set_credential(tmp_path, "subscription", GOOD_TOKEN)
        assert result["ok"] and result["secret"] == ga.SUBSCRIPTION_SECRET
        assert ga.status(tmp_path)["configured"] == ["subscription"]


class TestWhatItRefusesBeforeSendingAnything:
    @pytest.mark.parametrize("empty", ["", "   ", "\n", None])
    def test_nothing_at_all(self, empty):
        with pytest.raises(ga.GateAuthError) as e:
            ga.validate("api-key", empty)
        assert e.value.kind == "empty"

    def test_a_whole_block_of_pasted_output(self):
        # The common mistake: copying the command AND its output together.
        with pytest.raises(ga.GateAuthError) as e:
            ga.validate("subscription", f"$ claude setup-token\n{GOOD_TOKEN}")
        assert e.value.kind == "multiline"

    def test_a_key_pasted_where_a_subscription_token_belongs_is_still_accepted(self):
        # Deliberately NOT refused. The two formats overlap today, and a validator that got
        # clever about telling them apart would start rejecting valid credentials the day
        # either format changes — a worse failure, because it blocks a correct setup.
        assert ga.validate("subscription", GOOD_KEY) == GOOD_KEY

    def test_surrounding_whitespace_is_forgiven(self, tmp_path, gh):
        # Pasting almost always brings a trailing newline. Refusing that would be pedantry.
        assert ga.validate("api-key", f"  {GOOD_KEY}\t") == GOOD_KEY

    def test_an_unknown_way_to_sign_in(self):
        with pytest.raises(ga.GateAuthError) as e:
            ga.validate("carrier-pigeon", GOOD_KEY)
        assert e.value.kind == "unknown_mode"

    def test_a_checkout_with_no_code_host_says_so_rather_than_failing_obscurely(
            self, tmp_path, monkeypatch):
        monkeypatch.setattr(ga.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(
            a[0], 1, "", "fatal: No such remote 'origin'"))
        with pytest.raises(ga.GateAuthError) as e:
            ga.set_credential(tmp_path, "api-key", GOOD_KEY)
        assert e.value.kind == "no_remote"


class TestTheAnswersItGives:
    def test_no_credential_means_the_gates_cannot_sign_in(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ga.subprocess, "run", FakeGh())
        result = ga.status(tmp_path)
        assert result["gates_can_sign_in"] is False
        assert "fail closed" in ga.format_status(result)

    def test_not_signed_in_to_the_code_host_is_reported_as_that(self, tmp_path, monkeypatch):
        # Not as "no credential set". Those need completely different actions, and reporting
        # the wrong one sends somebody to reissue a key they already have.
        monkeypatch.setattr(ga.subprocess, "run",
                            FakeGh(fail={"list": "gh: You are not logged into any GitHub hosts"}))
        assert "gh auth login" in ga.status(tmp_path)["detail"]

    def test_both_set_is_not_an_error_but_says_which_one_signs_in(self, tmp_path, monkeypatch):
        # Worth saying plainly: somebody looking at a billed API key may believe it is the one
        # in use, and be surprised either way round.
        monkeypatch.setattr(ga.subprocess, "run",
                            FakeGh(secrets=[ga.API_KEY_SECRET, ga.SUBSCRIPTION_SECRET]))
        result = ga.status(tmp_path)
        assert sorted(result["configured"]) == ["api-key", "subscription"]
        assert "subscription token" in result["detail"]

    def test_the_metered_one_says_so_when_it_is_set(self, tmp_path, gh):
        # The cost is the actual decision between the two, so it is stated at the moment of
        # choosing rather than left in a document.
        assert "METERED" in ga.set_credential(tmp_path, "api-key", GOOD_KEY)["cost"]

    def test_the_subscription_one_says_it_costs_nothing_per_pull_request(self, tmp_path, gh):
        assert "no per-pull-request" in ga.set_credential(
            tmp_path, "subscription", GOOD_TOKEN)["cost"]


class TestClearing:
    def test_removing_the_last_one_warns_the_gates_will_fail_closed(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ga.subprocess, "run", FakeGh(secrets=[ga.API_KEY_SECRET]))
        result = ga.clear_credential(tmp_path, "api-key")
        assert result["gates_can_sign_in"] is False
        assert "fail closed" in result["message"]

    def test_removing_one_of_two_says_the_gates_still_work(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ga.subprocess, "run",
                            FakeGh(secrets=[ga.API_KEY_SECRET, ga.SUBSCRIPTION_SECRET]))
        result = ga.clear_credential(tmp_path, "api-key")
        assert result["gates_can_sign_in"] is True


class TestTheSecretNamesMatchTheShippedPipelines:
    """The script and the pipelines are one decision. A rename in either alone is a gate that
    cannot sign in, discovered on somebody's pull request."""

    def _pipelines(self):
        root = Path(__file__).resolve().parents[2] / "harness"
        return list((root / "workflows").glob("*.yml")) + \
            list((root / "packs" / "cicd" / "github" / "workflows").glob("*.yml"))

    def test_every_gate_that_reads_a_key_also_accepts_a_subscription_token(self):
        for path in self._pipelines():
            text = path.read_text(encoding="utf-8")
            if "anthropic_api_key:" in text:
                assert "claude_code_oauth_token:" in text, (
                    f"{path.name} accepts only the metered credential")

    def test_the_pipelines_read_the_names_this_script_writes(self):
        joined = "\n".join(p.read_text(encoding="utf-8") for p in self._pipelines())
        for spec in ga.MODES.values():
            assert f"secrets.{spec['secret']}" in joined, spec["secret"]

    def test_no_gate_passes_the_BUILT_IN_workflow_token_to_the_action(self):
        """Anthropic's own documentation says to remove it.

        The action authenticates as the Claude GitHub App when no token is given. Passing the
        built-in workflow token overrides that with an identity the App's permissions do not
        cover — and GitHub does not trigger workflows on commits made with it, so a gate that
        pushed with it would be invisible to every gate after it.

        A custom app's token is still allowed here; the built-in one specifically is not.
        """
        offenders = []
        for path in self._pipelines():
            for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue        # the comment explaining why it is absent
                if stripped == "github_token: ${{ secrets.GITHUB_TOKEN }}":
                    offenders.append(f"{path.name}:{i}")
        assert not offenders, (
            "these steps pass the built-in workflow token, which the action's own docs say to "
            f"remove: {offenders}")
