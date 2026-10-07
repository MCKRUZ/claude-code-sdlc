"""The provider contract is a set of names and signatures, pinned here (code-host providers).

There is no class hierarchy on the Python side: a consuming script dispatches at its call site to
`ado_import.<same name>` when the host is Azure DevOps. That only works if the Azure DevOps
function takes exactly what the GitHub one takes. `code_host.PROVIDER_FUNCTIONS` writes that
contract down; this test is what stops it drifting.
"""

import importlib
import inspect

import pytest

import ado_import
import code_host


def _github_side(dotted: str):
    module, name = dotted.rsplit(".", 1)
    return getattr(importlib.import_module(module), name)


@pytest.mark.parametrize("entry", code_host.PROVIDER_FUNCTIONS, ids=lambda e: e["name"])
def test_ado_import_exposes_every_provider_function(entry):
    fn = getattr(ado_import, entry["name"], None)
    assert callable(fn), f"ado_import lacks {entry['name']}"


@pytest.mark.parametrize("entry", [e for e in code_host.PROVIDER_FUNCTIONS if e["github"]],
                         ids=lambda e: e["name"])
def test_signature_matches_the_github_twin_exactly(entry):
    ado_fn = getattr(ado_import, entry["name"])
    gh_fn = _github_side(entry["github"])
    assert inspect.signature(ado_fn) == inspect.signature(gh_fn), (
        f"{entry['name']}: ado {inspect.signature(ado_fn)} != github {inspect.signature(gh_fn)}")


@pytest.mark.parametrize("entry", [e for e in code_host.PROVIDER_FUNCTIONS if not e["github"]],
                         ids=lambda e: e["name"])
def test_signature_matches_the_documented_contract_when_github_has_no_standalone_function(entry):
    ado_fn = getattr(ado_import, entry["name"])
    assert str(inspect.signature(ado_fn)) == entry["signature"]


def test_the_documented_signature_is_also_true_of_the_github_twin():
    """The `signature` string is what a reader sees; it must not disagree with the real twin."""
    for entry in code_host.PROVIDER_FUNCTIONS:
        if entry["github"]:
            assert str(inspect.signature(_github_side(entry["github"]))) == entry["signature"], entry["name"]


def test_the_github_side_alias_exists_for_by_name_dispatch():
    assert ado_import.assign_on_host is ado_import.create_draft_pr


def test_ado_import_error_is_a_github_import_error():
    """Every existing `except GitHubImportError` — the frozen scorecard included — must catch az."""
    import github_import
    assert issubclass(ado_import.AdoImportError, github_import.GitHubImportError)
    assert code_host.CodeHostError is github_import.GitHubImportError


def test_provider_function_names_are_unique_and_match_the_tuple():
    names = [e["name"] for e in code_host.PROVIDER_FUNCTIONS]
    assert len(names) == len(set(names))
    assert tuple(names) == code_host.PROVIDER_FUNCTION_NAMES
