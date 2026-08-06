"""artifact_lineage.py — harvest the upstream→downstream dependency graph the staleness engine walks.

Traceability is already *declared* all over an SDLC corpus; this module reads it into one graph of
edges `upstream → downstream` ("if upstream changes, downstream may be stale"). Each edge is tagged
with a `confidence`:

  - "declared" — the link is written down somewhere (a frozen layer's `source_artifacts:`, a spec's
    `source:`, an `FR-012` / `BR-04` id reference, an explicit markdown path). High confidence.
  - "coarse"   — nothing was declared, so phase order supplies a fallback edge (an artifact in the
    prior phase is *assumed* upstream of one in the next). Always labeled so a human never mistakes
    an inference for a declared link. Only ever added where an artifact declares nothing.

Nodes are repo-relative POSIX paths (e.g. `.sdlc/artifacts/01-requirements/requirements.md`,
`specs/0001-foo.md`) so artifacts inside and outside `.sdlc/` share one namespace with the ledger.

No writes, no gate — this is pure graph construction the advisory audit surface consumes.
"""

import re
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase_model as pm

# Permissive id matcher across the whole vocabulary (widths vary per prefix; see references).
ID_RE = re.compile(r"\b(FR|EP|US|BR|SCEN|DL|DOC|FE|NFR|ADR)-[A-Z]*\d+\b")

# id prefix -> the filename stem that *declares* that id family (the owning template artifact).
# An id appearing in any OTHER file is a reference, i.e. that file depends on the owner.
ID_OWNER_STEM = {
    "FR": "requirements",
    "NFR": "non-functional-requirements",
    "EP": "epics",
    "US": "user-stories",
    "BR": "business-rules",
    "SCEN": "golden-scenarios",
    "DOC": "document-registry",
    "FE": "feature-brief",
    "ADR": "adr-registry",
    # DL (decision-log) items are process bookkeeping, not an artifact-lineage source — skipped.
}

# A markdown path reference: [text](path.md) or a bare "*.md" mention.
MD_PATH_RE = re.compile(r"\[[^\]]*\]\(([^)]+\.md)\)|(?<![\w/])([\w./-]+\.md)\b")


# --- File discovery ---------------------------------------------------------------------------

def _rel(repo_root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def discover_nodes(repo_root: Path, sdlc_dir: Path) -> list[str]:
    """Every markdown artifact worth tracking: phase artifacts, frozen layers, specs."""
    nodes: set[str] = set()
    for base in (sdlc_dir / "artifacts", sdlc_dir / "context" / "layers"):
        if base.exists():
            for p in base.rglob("*.md"):
                if p.is_file():
                    nodes.add(_rel(repo_root, p))
    specs = repo_root / "specs"
    if specs.exists():
        for p in specs.glob("*.md"):
            if p.is_file():
                nodes.add(_rel(repo_root, p))
    return sorted(nodes)


def read_yaml_frontmatter(text: str) -> dict:
    """YAML frontmatter as a dict (handles list-valued keys like source_artifacts:). Empty on miss.

    The shared check_spec.parse_frontmatter is a flat string parser and CANNOT read lists, so
    lineage — which needs `source_artifacts: [...]` — uses real YAML here (as validate_frozen_layer
    does)."""
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    try:
        data = yaml.safe_load(m.group(1))
        return data if isinstance(data, dict) else {}
    except yaml.YAMLError:
        return {}


# --- Phase mapping (for coarse fallback and cross-ref direction) ------------------------------

def _slug_to_order() -> dict[str, int]:
    return {p["slug"]: p["order"] for p in pm.all_phases()}


def node_phase_order(node: str) -> int | None:
    """Lifecycle order of the phase a node belongs to, or None if it can't be placed."""
    parts = node.split("/")
    if ".sdlc" in parts and "artifacts" in parts:
        i = parts.index("artifacts")
        if i + 1 < len(parts):
            return _slug_to_order().get(parts[i + 1])
    m = re.search(r"context/layers/phase([^/-]+)-", node)
    if m:
        return pm.phase_order(m.group(1))
    if node.startswith("specs/"):
        return pm.phase_order("build")
    return None


# --- Edge harvesting --------------------------------------------------------------------------

def _edge(upstream: str, downstream: str, basis: str, confidence: str) -> dict:
    return {"upstream": upstream, "downstream": downstream, "basis": basis, "confidence": confidence}


def find_id_declarations(repo_root: Path, nodes: list[str]) -> dict[str, str]:
    """Map each id (FR-012, BR-04, …) to the node that declares it (its owning artifact).

    Ownership is by the id's owning filename stem (requirements.md owns FR, business-rules.md owns
    BR, …) — NOT by where the id happens to appear. If several files share a stem, the shortest path
    wins (the canonical top-level one)."""
    stem_to_node: dict[str, str] = {}
    for node in nodes:
        # Owners are the template artifacts that LIVE under .sdlc/artifacts/. A file elsewhere
        # (a spec, a frozen layer) that merely shares a stem — e.g. specs/requirements.md — must
        # not capture ownership, or it would produce a reversed edge against the real declarer.
        parts = node.split("/")
        if not (".sdlc" in parts and "artifacts" in parts):
            continue
        stem = Path(node).stem.lower()
        for owner_stem in set(ID_OWNER_STEM.values()):
            if (stem == owner_stem or stem.startswith(owner_stem)) and (
                owner_stem not in stem_to_node or len(node) < len(stem_to_node[owner_stem])
            ):
                stem_to_node[owner_stem] = node

    owners: dict[str, str] = {}
    for node in nodes:
        try:
            text = (repo_root / node).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for m in ID_RE.finditer(text):
            stem = ID_OWNER_STEM.get(m.group(1))
            if stem and stem in stem_to_node:
                owners.setdefault(m.group(0), stem_to_node[stem])
    return owners


def harvest_edges(repo_root: Path, sdlc_dir: Path, nodes: list[str]) -> list[dict]:
    """All DECLARED edges (frozen-layer sources, spec sources, id references, cross-references)."""
    edges: list[dict] = []
    node_set = set(nodes)
    id_owner = find_id_declarations(repo_root, nodes)

    def add(up: str, down: str, basis: str):
        if up and down and up != down and up in node_set and down in node_set:
            edges.append(_edge(up, down, basis, "declared"))

    for node in nodes:
        try:
            text = (repo_root / node).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        # (1) Frozen-layer source_artifacts: bare filenames under the phase's artifact dir.
        if "context/layers/phase" in node:
            fm = read_yaml_frontmatter(text)
            srcs = fm.get("source_artifacts") or []
            order = node_phase_order(node)
            slug = next((p["slug"] for p in pm.all_phases() if p["order"] == order), None)
            if isinstance(srcs, list) and slug:
                for fn in srcs:
                    up = f".sdlc/artifacts/{slug}/{str(fn).strip()}"
                    add(up, node, "frozen-layer-source")

        # (2) id references: the file declaring an id is upstream of any file that references it.
        for m in ID_RE.finditer(text):
            owner = id_owner.get(m.group(0))
            if owner and owner != node:
                add(owner, node, "id-reference")

        # (3) explicit markdown path references, directed by phase order (upstream = earlier phase).
        down_order = node_phase_order(node)
        for m in MD_PATH_RE.finditer(text):
            ref = (m.group(1) or m.group(2) or "").strip()
            target = _resolve_path_ref(repo_root, sdlc_dir, node, ref, node_set)
            if not target or target == node:
                continue
            up_order = node_phase_order(target)
            if up_order is not None and down_order is not None and up_order < down_order:
                add(target, node, "cross-reference")

    # De-duplicate (same up→down can be found by several bases; keep the first/strongest basis).
    seen: set[tuple[str, str]] = set()
    deduped: list[dict] = []
    for e in edges:
        key = (e["upstream"], e["downstream"])
        if key not in seen:
            seen.add(key)
            deduped.append(e)
    return deduped


def _resolve_path_ref(repo_root: Path, sdlc_dir: Path, from_node: str, ref: str, node_set: set) -> str | None:
    """Resolve a markdown path reference to a known node, if possible."""
    ref = ref.split("#", 1)[0].strip()
    if not ref:
        return None
    from_dir = (repo_root / from_node).parent
    candidates = [
        (from_dir / ref),
        (repo_root / ref),
    ]
    base = Path(ref).name
    for cand in candidates:
        rel = _rel(repo_root, cand)
        if rel in node_set:
            return rel
    # Fall back to a unique basename match among known nodes.
    matches = [n for n in node_set if Path(n).name == base]
    return matches[0] if len(matches) == 1 else None


def coarse_edges(nodes: list[str], declared: list[dict]) -> list[dict]:
    """Phase-order fallback: for a node with NO declared upstream, connect every artifact in the
    immediately-prior populated phase to it. Always labeled 'coarse'."""
    has_declared_up = {e["downstream"] for e in declared}
    by_order: dict[int, list[str]] = {}
    for n in nodes:
        o = node_phase_order(n)
        if o is not None:
            by_order.setdefault(o, []).append(n)
    orders = sorted(by_order)
    prev_of = {orders[i]: orders[i - 1] for i in range(1, len(orders))}

    edges: list[dict] = []
    for order in orders:
        prev = prev_of.get(order)
        if prev is None:
            continue
        for down in by_order[order]:
            if down in has_declared_up:
                continue
            for up in by_order[prev]:
                if up != down:
                    edges.append(_edge(up, down, "coarse-phase-order", "coarse"))
    return edges


def build_graph(repo_root: Path, sdlc_dir: Path) -> list[dict]:
    """The full edge list: declared edges first, then coarse fallback for undeclared downstreams."""
    nodes = discover_nodes(repo_root, sdlc_dir)
    declared = harvest_edges(repo_root, sdlc_dir, nodes)
    return declared + coarse_edges(nodes, declared)


# --- Traversal (cycle-safe) -------------------------------------------------------------------

def _walk(edges: list[dict], start: str, forward: bool) -> list[dict]:
    """BFS from `start`, following edges forward (downstream) or backward (upstream). Cycle-safe.

    Returns one row per reachable node: {node, path (list of intermediate nodes), confidence,
    bases}. `confidence` is 'coarse' if ANY edge on the shortest path is coarse, else 'declared'."""
    key = "upstream" if forward else "downstream"
    other = "downstream" if forward else "upstream"
    adj: dict[str, list[dict]] = {}
    for e in edges:
        adj.setdefault(e[key], []).append(e)

    results: list[dict] = []
    visited = {start}
    queue: list[tuple[str, list[str], str, list[str]]] = [(start, [start], "declared", [])]
    while queue:
        node, path, conf, bases = queue.pop(0)
        for e in adj.get(node, []):
            nxt = e[other]
            if nxt in visited:
                continue
            visited.add(nxt)
            new_conf = "coarse" if (conf == "coarse" or e["confidence"] == "coarse") else "declared"
            new_bases = bases + [e["basis"]]
            results.append({
                "node": nxt,
                "path": path + [nxt],
                "confidence": new_conf,
                "bases": new_bases,
            })
            queue.append((nxt, path + [nxt], new_conf, new_bases))
    return results


def downstream_of(edges: list[dict], node: str) -> list[dict]:
    """Everything reachable *downstream* of `node` (if `node` changes, these may go stale)."""
    return _walk(edges, node, forward=True)


def upstream_of(edges: list[dict], node: str) -> list[dict]:
    """Everything `node` depends on (its sources)."""
    return _walk(edges, node, forward=False)
