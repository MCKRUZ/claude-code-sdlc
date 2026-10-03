"""What this plugin can do, declared so a newer Studio can tell an older plugin from a current one.

Studio is released separately from the plugin, so it will meet plugins that predate the scripts it
wants to call. Without a signal the only way to find out is to run the script and show a project
manager an argument-parsing error. This is that signal: `generate_status.py --json` reports the
names below, and Studio hides a button it cannot honour and says why.

The list is DECLARED, not probed — probing would run `--help` on a dozen scripts every time the
dashboard loads. A static list is only trustworthy if something proves each entry true, and
`scripts/tests/test_capabilities.py` does: for every entry it runs the script's real `--help` (for
the verb it names) and requires every listed flag to be there. A capability whose script is not in
this plugin is omitted, never reported.
"""

from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent

# name -> the script that provides it, the verb (argv before --help) when it has subcommands, and
# the flags that must appear in that --help for the capability to be real.
CAPABILITIES: dict[str, dict] = {
    "activities": {"script": "stage_readiness.py", "flags": ["--json"]},
    "add-row": {"script": "document_shape_cli.py", "argv": ["add-row"],
                "flags": ["--cells", "--table-index", "--id-column", "--replace-placeholders"]},
    "doctor-json": {"script": "doctor.py", "flags": ["--json"]},
    "gate-audit-json": {"script": "audit_gates.py", "flags": ["--json", "--repo"]},
    "upgrade-report-json": {"script": "upgrade_harness.py", "flags": ["--json"]},
    "check-channel-json": {"script": "check_channel.py", "flags": ["--json"]},
    "interaction-spec-check": {"script": "check_channel.py", "flags": ["--interaction-spec"]},
    "bind-channel": {"script": "bind_channel.py", "flags": ["--spec", "--channel"]},
    "decision-open": {"script": "track_decisions.py", "argv": ["open"], "flags": ["--decision", "--owner"]},
    "decision-decide": {"script": "track_decisions.py", "argv": ["decide"], "flags": ["--id", "--resolution"]},
    "intake-modes": {"script": "intake_documents.py",
                     "flags": ["--repo", "--docs", "--json", "--skip", "--priority", "--lock"]},
    "new-spec-json": {"script": "new_spec.py", "flags": ["--json"]},
    "new-spike-json": {"script": "new_spike.py", "flags": ["--json"]},
    "pipeline-proof": {"script": "pipeline_proof.py", "flags": ["--write", "--json"]},
    "workshop-brief": {"script": "workshop_brief.py", "argv": ["build"],
                       "flags": ["--contradictions", "--questions", "--logistics-json", "--json"]},
    "rules-check": {"script": "rules_check.py", "flags": ["--repo", "--json"]},
    "data-contract-summary": {"script": "data_contract.py", "argv": ["summary"], "flags": ["--repo", "--json"]},
    "narrative-status": {"script": "narrative_status.py", "flags": ["--all-phases", "--json"]},
    "phase-report-json": {"script": "generate_phase_report.py", "flags": ["--json", "--all"]},
    "intake-registry": {"script": "intake_documents.py", "flags": ["--registry", "--json"]},
}


def list_capabilities(scripts_dir: Path = SCRIPTS_DIR) -> list[str]:
    """The capabilities this plugin has, sorted: those whose script is present."""
    scripts_dir = Path(scripts_dir)
    return sorted(name for name, spec in CAPABILITIES.items() if (scripts_dir / spec["script"]).is_file())
