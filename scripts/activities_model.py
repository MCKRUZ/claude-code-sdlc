"""What a person can do in each phase, and how far along it is (spec 0023).

`phases/activities.yaml` declares, per phase, the activities beyond the documents the registry
requires — start a document from its template, run a check, ask the model for a draft, talk it
through. SDLC Studio draws that list instead of keeping its own, so a command added here appears
there with no Studio change. This module loads and validates the declaration and evaluates each
activity against a project.

Read-only by construction: evaluating an activity looks at files and the profile and never runs a
script or a model. Status has one fixed precedence — `done` if its `done_when` holds (even if a
requirement has since become unmet), else `blocked` with a plain reason if a `requires` is unmet,
else `available`. An activity with no `done_when` is never `done`.

It lives in a file of its own, and not in `phase-registry.yaml`, because the registry and
`phase_model.py` are protected core.
"""

import json
from pathlib import Path

import yaml

import phase_model as pm

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
ACTIVITIES_PATH = PLUGIN_ROOT / "phases" / "activities.yaml"
KINDS = ("run", "create", "check", "draft", "talk")
REQUIRES_KINDS = ("profile", "activity", "file")
DONE_WHEN_KINDS = ("exists", "exists_all", "json")
ACTIVITY_KEYS = ("id", "label", "command", "kind", "creates", "after", "optional", "requires", "done_when")
ARTIFACTS_PREFIX = ".sdlc/artifacts/"


class ActivitiesError(Exception):
    """The declaration could not be read or is not a mapping of phase id to a list of activities."""


def load(path: Path | None = None) -> dict[str, list[dict]]:
    path = Path(path) if path else ACTIVITIES_PATH
    if not path.exists():
        raise ActivitiesError(f"activities declaration not found: {path}")
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ActivitiesError(f"activities declaration could not be parsed: {e}") from e
    if not isinstance(raw, dict):
        raise ActivitiesError("activities declaration must map each phase id to a list of activities")
    data: dict[str, list[dict]] = {}
    for phase, activities in raw.items():
        if not isinstance(activities, list):
            raise ActivitiesError(f"phase {phase}: its activities must be a list")
        data[str(phase)] = activities
    return data


def template_for(creates_path: str, plugin_root: Path = PLUGIN_ROOT) -> Path | None:
    """The template a file would be started from, or None when it has none.

    `.sdlc/artifacts/<phase>/<rest>` mirrors `templates/phases/<phase>/<rest>`; a review report is
    written into whichever phase was reviewed, so every `review-report.md` shares one template."""
    path = creates_path.replace("\\", "/")
    if not path.startswith(ARTIFACTS_PREFIX):
        return None
    rest = path[len(ARTIFACTS_PREFIX):]
    candidate = plugin_root / "templates" / "phases" / rest
    if rest.endswith("/review-report.md"):
        candidate = plugin_root / "templates" / "review-report.md"
    return candidate if candidate.is_file() else None


def validate(data: dict[str, list[dict]], plugin_root: Path = PLUGIN_ROOT) -> list[str]:
    """Every way the declaration can be wrong, each naming the phase, the activity and the rule.

    Reports, never raises: a malformed field yields one named problem for that field, so a caller
    can show every fault of a declaration at once instead of the first one that happened to throw."""
    problems: list[str] = []
    known_phases = set(pm.all_phase_ids())
    for phase, activities in data.items():
        if phase not in known_phases:
            problems.append(f"phase {phase}: not a phase in the registry")
        ids = [a.get("id") for a in activities if isinstance(a, dict) and isinstance(a.get("id"), str)]
        for activity in activities:
            if not isinstance(activity, dict):
                problems.append(f"phase {phase}: an activity must be a mapping")
                continue
            problems += _validate_activity(phase, activity, ids, plugin_root)
        problems += [f"phase {phase}: duplicate activity id '{i}'" for i in sorted({i for i in ids if ids.count(i) > 1})]
    return problems


def _list_of_strings(where: str, field: str, value) -> tuple[list[str], list[str]]:
    """The field as a list of strings, plus one problem when it is not (None reads as empty)."""
    if value is None:
        return [], []
    if not isinstance(value, list):
        return [], [f"{where}: {field} must be a list of paths or ids, not {type(value).__name__}"]
    bad = [v for v in value if not isinstance(v, str) or not v.strip()]
    if bad:
        return [v for v in value if isinstance(v, str) and v.strip()], [f"{where}: {field} must hold only non-empty strings"]
    return list(value), []


def _mapping(where: str, field: str, value) -> tuple[dict, list[str]]:
    """The field as a mapping, plus one problem when it is not (None reads as empty)."""
    if value is None:
        return {}, []
    if not isinstance(value, dict):
        return {}, [f"{where}: {field} must be a mapping, not {type(value).__name__}"]
    return value, []


def _validate_activity(phase: str, a: dict, siblings: list, plugin_root: Path) -> list[str]:
    raw_id = a.get("id")
    where = f"phase {phase} / activity {raw_id if isinstance(raw_id, str) and raw_id else '?'}"
    problems = []
    for key in a:
        if key not in ACTIVITY_KEYS:
            problems.append(f"{where}: unknown key {key}")
    if not isinstance(raw_id, str) or not raw_id.strip():
        problems.append(f"{where}: needs an id")
    label = a.get("label")
    if not isinstance(label, str) or not label.strip():
        problems.append(f"{where}: needs a label")
    if a.get("kind") not in KINDS:
        problems.append(f"{where}: kind '{a.get('kind')}' is not one of {', '.join(KINDS)}")
    command = a.get("command")
    if command is not None and not isinstance(command, str):
        problems.append(f"{where}: command must be a slash command name or null, not {type(command).__name__}")
    elif command and not (plugin_root / "commands" / f"{command}.md").is_file():
        problems.append(f"{where}: command '{command}' has no commands/{command}.md")
    if "optional" in a and not isinstance(a["optional"], bool):
        problems.append(f"{where}: optional must be true or false")
    after, more = _list_of_strings(where, "after", a.get("after"))
    problems += more
    for dep in after:
        if dep not in siblings:
            problems.append(f"{where}: after '{dep}' names no activity in this phase")
    creates, more = _list_of_strings(where, "creates", a.get("creates"))
    problems += more
    for created in creates:
        if template_for(created, plugin_root) is None:
            problems.append(f"{where}: creates {created} but there is no template for it")
    requires, more = _mapping(where, "requires", a.get("requires"))
    problems += more
    for kind, value in requires.items():
        if kind not in REQUIRES_KINDS:
            problems.append(f"{where}: requires '{kind}' is not one of {', '.join(REQUIRES_KINDS)}")
        elif not isinstance(value, str) or not value.strip():
            problems.append(f"{where}: requires {kind} must name a {'dotted profile key' if kind == 'profile' else kind}")
        elif kind == "activity" and value not in siblings:
            problems.append(f"{where}: requires activity '{value}' which is not in this phase")
    done_when, more = _mapping(where, "done_when", a.get("done_when"))
    problems += more
    if len(done_when) > 1:
        problems.append(f"{where}: done_when must hold one condition, not {len(done_when)} "
                        f"({', '.join(str(k) for k in done_when)})")
    for kind, value in done_when.items():
        if kind not in DONE_WHEN_KINDS:
            problems.append(f"{where}: done_when '{kind}' is not one of {', '.join(DONE_WHEN_KINDS)}")
        elif kind == "exists" and (not isinstance(value, str) or not value.strip()):
            problems.append(f"{where}: done_when exists must name a path")
        elif kind == "exists_all":
            paths, more = _list_of_strings(where, "done_when exists_all", value)
            problems += more or ([] if paths else [f"{where}: done_when exists_all must name at least one path"])
        elif kind == "json" and not (isinstance(value, dict) and isinstance(value.get("file"), str)
                                     and isinstance(value.get("key"), str) and "equals" in value):
            problems.append(f"{where}: done_when json needs file, key and equals")
    return problems


# --- evaluation ----------------------------------------------------------------------------

def _profile_value(repo_root: Path, dotted: str):
    path = repo_root / ".sdlc" / "profile.yaml"
    if not path.is_file():
        return None
    try:
        node = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (yaml.YAMLError, OSError):
        return None
    for part in dotted.split("."):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def _json_holds(repo_root: Path, spec: dict) -> bool:
    try:
        doc = json.loads((repo_root / spec["file"]).read_text(encoding="utf-8"))
    except (OSError, ValueError, KeyError):
        return False
    return isinstance(doc, dict) and doc.get(spec.get("key")) == spec.get("equals")


def _is_done(repo_root: Path, done_when: dict | None) -> bool:
    if not done_when:
        return False
    if "exists" in done_when:
        return (repo_root / done_when["exists"]).exists()
    if "exists_all" in done_when:
        paths = done_when["exists_all"] or []
        return bool(paths) and all((repo_root / p).exists() for p in paths)
    if "json" in done_when:
        return _json_holds(repo_root, done_when["json"] or {})
    return False


def _unmet_reason(repo_root: Path, requires: dict, done: dict[str, bool], labels: dict[str, str]) -> str | None:
    if "profile" in requires and not _profile_value(repo_root, requires["profile"]):
        return f"This needs `{requires['profile']}` set in the project profile."
    if "activity" in requires and not done.get(requires["activity"], False):
        return f"Finish \"{labels.get(requires['activity'], requires['activity'])}\" first."
    if "file" in requires and not (repo_root / requires["file"]).exists():
        return f"This needs {requires['file']} to exist."
    return None


def evaluate(repo_root: Path, phase_id, data: dict[str, list[dict]] | None = None) -> list[dict]:
    """One entry per activity of the phase, in declared order, each with its computed status."""
    repo_root = Path(repo_root)
    data = data if data is not None else load()
    activities = data.get(str(phase_id)) or []
    done = {a["id"]: _is_done(repo_root, a.get("done_when")) for a in activities}
    labels = {a["id"]: a.get("label", a["id"]) for a in activities}

    out = []
    for a in activities:
        reason = None if done[a["id"]] else _unmet_reason(repo_root, a.get("requires") or {}, done, labels)
        status = "done" if done[a["id"]] else ("blocked" if reason else "available")
        out.append({
            "id": a["id"], "label": a.get("label", a["id"]), "command": a.get("command"),
            "kind": a["kind"], "optional": a.get("optional", True),
            "creates": list(a.get("creates") or []), "after": list(a.get("after") or []),
            "status": status, "reason": reason,
        })
    return out
