"""Payload <-> install-map completeness tripwire — walks the REAL harness/ payload.

Every file the payload ships must install somewhere: reachable via FILE_MAP/DIR_MAP/EXTRA_FILES,
inside packs/ (whose files the pack.yaml overlay manifests resolve — each declared src must
exist), or on the explicit ALLOWED_UNMAPPED list. A new kit file that lands in the payload but
installs nowhere fails here instead of silently shipping dead weight.
"""

from pathlib import Path

import yaml

from install_harness import DIR_MAP, EXTRA_FILES, FILE_MAP

PAYLOAD = Path(__file__).resolve().parent.parent.parent / "harness"

# Payload-relative posix paths that deliberately install nowhere.
ALLOWED_UNMAPPED = {
    "README.md",  # documents the payload itself, not the installed harness
}


def _payload_files() -> list[str]:
    return sorted(p.relative_to(PAYLOAD).as_posix() for p in PAYLOAD.rglob("*") if p.is_file())


class TestPayloadCompleteness:
    def test_payload_exists(self):
        assert PAYLOAD.is_dir(), f"real payload not found at {PAYLOAD}"

    def test_every_mapped_source_exists_in_payload(self):
        # Drift in the other direction: a map entry whose source left the payload.
        missing = [src for src, _ in FILE_MAP + EXTRA_FILES if not (PAYLOAD / src).is_file()]
        missing += [src for src, _ in DIR_MAP if not (PAYLOAD / src).is_dir()]
        assert missing == [], f"mapped sources absent from the payload: {missing}"

    def test_every_payload_file_installs_somewhere(self):
        mapped_files = {src for src, _ in FILE_MAP + EXTRA_FILES}
        dir_prefixes = tuple(src for src, _ in DIR_MAP)
        orphans = [
            f for f in _payload_files()
            if f not in mapped_files
            and not f.startswith(dir_prefixes)
            and not f.startswith("packs/")
            and f not in ALLOWED_UNMAPPED
        ]
        assert orphans == [], f"payload files that install nowhere: {orphans}"

    def test_every_pack_overlay_src_exists(self):
        manifests = sorted(PAYLOAD.glob("packs/*/*/pack.yaml"))
        assert manifests, "no pack manifests found under packs/"
        problems = []
        for manifest_path in manifests:
            manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
            pack_dir = manifest_path.parent
            pack_rel = pack_dir.relative_to(PAYLOAD).as_posix()
            for entry in manifest.get("overlays", []):
                if not (pack_dir / entry["src"]).is_file():
                    problems.append(f"{pack_rel}: {entry['src']}")
        assert problems == [], f"pack.yaml overlay srcs absent from their packs: {problems}"
