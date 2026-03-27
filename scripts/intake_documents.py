"""Scan and catalog external reference documents for SDLC intake."""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

PLUGIN_ROOT = Path(__file__).resolve().parent.parent

# File type to glob pattern mapping
TYPE_GLOBS = {
    "pdf": "*.pdf",
    "markdown": "*.md",
    "text": "*.txt",
    "docx": "*.docx",
    "html": "*.html",
}

# Rough bytes-to-tokens ratio (English text average)
BYTES_PER_TOKEN = 4


def load_yaml(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def compute_checksum(file_path: Path) -> str:
    """Compute SHA-256 hash of a file (first 16 hex chars)."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()[:16]}"


def estimate_tokens_from_text(text: str) -> int:
    """Estimate token count from word count (words * 1.3)."""
    return int(len(text.split()) * 1.3)


def estimate_tokens_from_bytes(size_bytes: int) -> int:
    """Rough token estimate from file size."""
    return size_bytes // BYTES_PER_TOKEN


def extract_text_length(file_path: Path, file_type: str) -> tuple[int, str]:
    """Extract text and estimate tokens. Returns (estimated_tokens, method)."""
    if file_type in ("markdown", "text"):
        try:
            text = file_path.read_text(encoding="utf-8", errors="replace")
            return estimate_tokens_from_text(text), "word_count"
        except Exception:
            return estimate_tokens_from_bytes(file_path.stat().st_size), "byte_estimate"

    if file_type == "pdf":
        # Try pymupdf (fitz) if available
        try:
            import fitz  # type: ignore[import-untyped]

            doc = fitz.open(file_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            if text.strip():
                return estimate_tokens_from_text(text), "pdf_extracted"
        except ImportError:
            pass
        except Exception:
            pass
        # Fallback: byte-based estimate
        return estimate_tokens_from_bytes(file_path.stat().st_size), "byte_estimate"

    if file_type == "html":
        try:
            text = file_path.read_text(encoding="utf-8", errors="replace")
            # Strip HTML tags for rough word count
            import re

            clean = re.sub(r"<[^>]+>", " ", text)
            return estimate_tokens_from_text(clean), "html_stripped"
        except Exception:
            return estimate_tokens_from_bytes(file_path.stat().st_size), "byte_estimate"

    # docx and others: byte-based estimate
    return estimate_tokens_from_bytes(file_path.stat().st_size), "byte_estimate"


def scan_intake_folder(
    intake_path: Path,
    types: list[str],
    max_documents: int,
) -> list[dict]:
    """Scan the intake folder for matching files."""
    files = []
    for file_type in types:
        glob_pattern = TYPE_GLOBS.get(file_type)
        if not glob_pattern:
            continue
        for fp in sorted(intake_path.rglob(glob_pattern)):
            if fp.is_file():
                files.append((fp, file_type))

    # Deduplicate by path (a .md file might match both markdown and text)
    seen = set()
    unique = []
    for fp, ft in files:
        if fp not in seen:
            seen.add(fp)
            unique.append((fp, ft))

    # Sort by name for stable DOC-NNN assignment
    unique.sort(key=lambda x: x[0].name.lower())

    # Apply max_documents cap
    if len(unique) > max_documents:
        print(
            f"Warning: Found {len(unique)} documents, capped at {max_documents}",
            file=sys.stderr,
        )
        unique = unique[:max_documents]

    return unique


def catalog_documents(
    intake_path: Path,
    files: list[tuple[Path, str]],
    config: dict,
) -> dict:
    """Build the catalog.json structure."""
    documents = []
    total_tokens = 0

    for i, (fp, file_type) in enumerate(files, start=1):
        doc_id = f"DOC-{i:03d}"
        est_tokens, method = extract_text_length(fp, file_type)
        total_tokens += est_tokens

        documents.append({
            "doc_id": doc_id,
            "filename": fp.name,
            "type": file_type,
            "source_path": str(fp.relative_to(intake_path.parent.parent)).replace(
                "\\", "/"
            ),
            "size_bytes": fp.stat().st_size,
            "estimated_tokens": est_tokens,
            "estimation_method": method,
            "checksum": compute_checksum(fp),
        })

    return {
        "intake_path": str(intake_path).replace("\\", "/"),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "total_documents": len(documents),
        "total_estimated_tokens": total_tokens,
        "index_budget_tokens": config.get("index_budget_tokens", 5000),
        "summary_budget_tokens": config.get("summary_budget_tokens", 750),
        "documents": documents,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan and catalog external documents for SDLC intake"
    )
    parser.add_argument("--state", required=True, help="Path to .sdlc/state.yaml")
    parser.add_argument(
        "--rescan",
        action="store_true",
        help="Force re-cataloging even if catalog.json exists",
    )
    args = parser.parse_args()

    state_path = Path(args.state)
    if not state_path.exists():
        print(f"Error: State file not found: {state_path}", file=sys.stderr)
        sys.exit(1)

    sdlc_dir = state_path.parent
    profile_path = sdlc_dir / "profile.yaml"
    if not profile_path.exists():
        print(f"Error: Profile not found: {profile_path}", file=sys.stderr)
        sys.exit(1)

    profile = load_yaml(profile_path)
    doc_config = profile.get("documentation")
    if not doc_config:
        print("No 'documentation' section in profile. Nothing to intake.")
        sys.exit(0)

    # Resolve intake path relative to project root
    project_root = sdlc_dir.parent
    intake_path = project_root / doc_config["intake_path"]
    if not intake_path.exists():
        print(f"Error: Intake path not found: {intake_path}", file=sys.stderr)
        print(
            f"Create the folder and place reference documents in it, then re-run.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Check for existing catalog
    catalog_path = sdlc_dir / "context" / "intake" / "catalog.json"
    if catalog_path.exists() and not args.rescan:
        print(f"Catalog already exists: {catalog_path}")
        print("Use --rescan to force re-cataloging.")
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        print(
            f"  {catalog['total_documents']} documents, "
            f"~{catalog['total_estimated_tokens']:,} estimated tokens"
        )
        sys.exit(0)

    # Scan and catalog
    types = doc_config.get("types", ["pdf", "markdown", "text"])
    max_docs = doc_config.get("max_documents", 50)

    files = scan_intake_folder(intake_path, types, max_docs)
    if not files:
        print(f"No matching documents found in {intake_path}")
        print(f"  Scanned for types: {types}")
        sys.exit(2)

    catalog = catalog_documents(intake_path, files, doc_config)

    # Write catalog
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    # Print summary
    print(f"Document Intake Catalog — {catalog['total_documents']} documents")
    print("=" * 60)
    print(f"  Intake path: {intake_path}")
    print(f"  Total estimated tokens: ~{catalog['total_estimated_tokens']:,}")
    print(f"  Index budget: {catalog['index_budget_tokens']} tokens")
    print(f"  Summary budget: {catalog['summary_budget_tokens']} tokens/doc")
    print()

    for doc in catalog["documents"]:
        method_tag = f" [{doc['estimation_method']}]" if doc["estimation_method"] != "word_count" else ""
        print(
            f"  {doc['doc_id']}  {doc['filename']:<40} "
            f"{doc['type']:<10} ~{doc['estimated_tokens']:>8,} tokens{method_tag}"
        )

    print()
    print(f"Catalog written to: {catalog_path}")
    print("Next: Claude will generate per-document summaries during Phase 0 Step 0c.")


if __name__ == "__main__":
    main()
