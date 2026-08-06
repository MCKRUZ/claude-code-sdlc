"""Tests for artifact_lineage — declared vs coarse edge harvest and cycle-safe traversal."""

from pathlib import Path

from artifact_lineage import (
    build_graph,
    coarse_edges,
    discover_nodes,
    downstream_of,
    find_id_declarations,
    harvest_edges,
    node_phase_order,
    upstream_of,
)


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def build_corpus(root: Path) -> Path:
    """A tiny but realistic corpus with every declared edge kind + one undeclared downstream."""
    sdlc = root / ".sdlc"
    req = sdlc / "artifacts" / "01-requirements"
    _write(req / "requirements.md", "# Requirements\n\n## FR-001 Login\nUser can log in.\n")
    # epics.md references FR-001 -> declared id-reference edge requirements -> epics
    _write(req / "epics.md", "# Epics\n\n## EP-001\nRealizes FR-001.\n")
    # A design artifact that declares nothing -> should get a coarse edge only.
    _write(sdlc / "artifacts" / "02-design" / "design.md", "# Design\n\nNo ids referenced here.\n")
    # A frozen layer whose source_artifacts lists requirements.md -> declared frozen-layer-source edge
    _write(
        sdlc / "context" / "layers" / "phase1-requirements.md",
        "---\nphase: 1\nsource_artifacts:\n  - requirements.md\n---\n\n## Decision\nx\n",
    )
    # A spec whose source cites FR-001 -> declared id-reference edge requirements -> spec
    _write(
        root / "specs" / "0001-login.md",
        '---\nspec: "0001"\nname: "login"\nsource: "FR-001 (requirements.md)"\n---\n\n# Spec\n',
    )
    return sdlc


class TestDiscovery:
    def test_finds_all_markdown_nodes(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        nodes = discover_nodes(tmp_path, sdlc)
        assert ".sdlc/artifacts/01-requirements/requirements.md" in nodes
        assert ".sdlc/context/layers/phase1-requirements.md" in nodes
        assert "specs/0001-login.md" in nodes

    def test_phase_order_placement(self, tmp_path):
        assert node_phase_order(".sdlc/artifacts/01-requirements/requirements.md") is not None
        assert node_phase_order(".sdlc/context/layers/phase1-requirements.md") == \
            node_phase_order(".sdlc/artifacts/01-requirements/requirements.md")
        assert node_phase_order("specs/0001-login.md") is not None


class TestIdDeclarations:
    def test_ids_owned_by_their_template_stem(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        nodes = discover_nodes(tmp_path, sdlc)
        owners = find_id_declarations(tmp_path, nodes)
        assert owners["FR-001"] == ".sdlc/artifacts/01-requirements/requirements.md"
        assert owners["EP-001"] == ".sdlc/artifacts/01-requirements/epics.md"

    def test_stem_collision_outside_artifacts_does_not_hijack_ownership(self, tmp_path):
        # A file that merely SHARES a stem but lives outside .sdlc/artifacts/ (here specs/requirements.md,
        # a shorter path) must NOT capture FR ownership — that produced a reversed declared edge.
        sdlc = build_corpus(tmp_path)
        _write(tmp_path / "specs" / "requirements.md", "# Not the real owner\nMentions FR-001.\n")
        nodes = discover_nodes(tmp_path, sdlc)
        owners = find_id_declarations(tmp_path, nodes)
        assert owners["FR-001"] == ".sdlc/artifacts/01-requirements/requirements.md"
        # And no reversed edge from the impostor into the real declarer.
        edges = harvest_edges(tmp_path, sdlc, nodes)
        assert not [e for e in edges
                    if e["upstream"] == "specs/requirements.md"
                    and e["downstream"] == ".sdlc/artifacts/01-requirements/requirements.md"]


class TestDeclaredEdges:
    def test_all_three_declared_bases_present(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        nodes = discover_nodes(tmp_path, sdlc)
        edges = harvest_edges(tmp_path, sdlc, nodes)
        req = ".sdlc/artifacts/01-requirements/requirements.md"
        pairs = {(e["upstream"], e["downstream"]): e for e in edges}

        # id-reference: requirements -> epics and requirements -> spec
        assert pairs[(req, ".sdlc/artifacts/01-requirements/epics.md")]["basis"] == "id-reference"
        assert pairs[(req, "specs/0001-login.md")]["basis"] == "id-reference"
        # frozen-layer-source: requirements -> its layer
        assert pairs[(req, ".sdlc/context/layers/phase1-requirements.md")]["basis"] == "frozen-layer-source"
        assert all(e["confidence"] == "declared" for e in edges)

    def test_no_self_edges(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        nodes = discover_nodes(tmp_path, sdlc)
        for e in harvest_edges(tmp_path, sdlc, nodes):
            assert e["upstream"] != e["downstream"]


class TestCoarseFallback:
    def test_undeclared_downstream_gets_coarse_edge(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        graph = build_graph(tmp_path, sdlc)
        design = ".sdlc/artifacts/02-design/design.md"
        coarse_into_design = [e for e in graph if e["downstream"] == design and e["confidence"] == "coarse"]
        assert coarse_into_design, "design.md declares nothing → must get a labeled coarse edge"
        assert all(e["basis"] == "coarse-phase-order" for e in coarse_into_design)

    def test_declared_downstream_gets_no_coarse(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        graph = build_graph(tmp_path, sdlc)
        spec = "specs/0001-login.md"  # has a declared upstream (FR-001)
        assert not [e for e in graph if e["downstream"] == spec and e["confidence"] == "coarse"]


class TestTraversal:
    def test_downstream_of_requirements(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        graph = build_graph(tmp_path, sdlc)
        req = ".sdlc/artifacts/01-requirements/requirements.md"
        reachable = {r["node"] for r in downstream_of(graph, req)}
        assert ".sdlc/artifacts/01-requirements/epics.md" in reachable
        assert "specs/0001-login.md" in reachable
        assert ".sdlc/context/layers/phase1-requirements.md" in reachable

    def test_upstream_of_spec_is_requirements(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        graph = build_graph(tmp_path, sdlc)
        up = {r["node"] for r in upstream_of(graph, "specs/0001-login.md")}
        assert ".sdlc/artifacts/01-requirements/requirements.md" in up

    def test_confidence_is_coarse_when_any_edge_on_path_is_coarse(self, tmp_path):
        sdlc = build_corpus(tmp_path)
        graph = build_graph(tmp_path, sdlc)
        req = ".sdlc/artifacts/01-requirements/requirements.md"
        rows = {r["node"]: r for r in downstream_of(graph, req)}
        design = ".sdlc/artifacts/02-design/design.md"
        assert rows[design]["confidence"] == "coarse"


class TestCycleSafety:
    def test_walk_terminates_on_a_cycle(self):
        edges = [
            {"upstream": "a.md", "downstream": "b.md", "basis": "id-reference", "confidence": "declared"},
            {"upstream": "b.md", "downstream": "a.md", "basis": "id-reference", "confidence": "declared"},
        ]
        down = {r["node"] for r in downstream_of(edges, "a.md")}
        assert down == {"b.md"}          # reaches b, does not loop back into a forever

    def test_confidence_taints_across_a_multi_hop_path(self):
        # A--coarse-->B--declared-->C : C must be labelled coarse (any coarse edge on the path taints
        # the whole chain), and B (reached via the coarse edge) is coarse too.
        edges = [
            {"upstream": "a.md", "downstream": "b.md", "basis": "coarse-phase-order", "confidence": "coarse"},
            {"upstream": "b.md", "downstream": "c.md", "basis": "id-reference", "confidence": "declared"},
        ]
        rows = {r["node"]: r for r in downstream_of(edges, "a.md")}
        assert rows["b.md"]["confidence"] == "coarse"
        assert rows["c.md"]["confidence"] == "coarse"

    def test_pure_declared_multi_hop_stays_declared(self):
        edges = [
            {"upstream": "a.md", "downstream": "b.md", "basis": "id-reference", "confidence": "declared"},
            {"upstream": "b.md", "downstream": "c.md", "basis": "id-reference", "confidence": "declared"},
        ]
        rows = {r["node"]: r for r in downstream_of(edges, "a.md")}
        assert rows["c.md"]["confidence"] == "declared"

    def test_coarse_edges_only_for_undeclared(self):
        nodes = ["p1/x.md", "p2/y.md"]
        declared = [{"upstream": "p1/x.md", "downstream": "p2/y.md",
                     "basis": "id-reference", "confidence": "declared"}]
        # y already has a declared upstream, so coarse_edges must add nothing for it.
        assert coarse_edges(nodes, declared) == []
