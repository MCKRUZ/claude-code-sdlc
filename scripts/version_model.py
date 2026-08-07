"""version_model.py — pure derivation of an artifact's *content* version history from the ledger.

The artifact-update-audit layer (`artifact_model.py`, `audit_artifacts.py`) already records change
**metadata** — every new/changed hash, when, by whom, why — to the append-only change-ledger. This
module is the content complement: given that same ledger, it derives an ordinal-keyed version list
(`v1..vN`) for one artifact so a human can diff or roll back. It is the **trust anchor** of the
versioning feature and does NO I/O — every version's identity is the SHA-256 hash the ledger already
carries (`track_artifacts.compute_checksum` output: `sha256:` + 16 hex), so the content-addressed
object store is just those hashes rehydrated to bytes. There is no second index to drift.

Design rules (mirrors `artifact_model.py`):
  - **Pure.** No filesystem, no clock, no randomness. The caller supplies the ledger, the current
    file's hash (for baseline synthesis), and the set of hashes actually present in the object store
    (so `present` can be computed without this module touching disk). Trivially unit-testable.
  - **Ordinal is the primary key.** `versions_for` counts *occurrences* in ledger order, not distinct
    hashes — so a rollback that restores an earlier hash is its own version (never a skipped ordinal),
    and is rendered "restored from vX".
  - **Baseline synthesis, never a crash.** A pre-existing artifact that predates the ledger has zero
    change entries; rather than `[]` or a KeyError, we synthesize a single `v1` baseline from the
    current file's hash, marked `present=False` unless its content happens to be in the store.
"""

import re

HASH_PREFIX = "sha256:"

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import artifact_model as am


# --- Hash / object identity -------------------------------------------------------------------

def hash_hex(h: str) -> str:
    """The bare hex of a ledger hash — strips a leading `sha256:` if present. '' for a falsy hash."""
    s = str(h or "").strip()
    return s[len(HASH_PREFIX):] if s.startswith(HASH_PREFIX) else s


def object_relpath(h: str) -> str:
    """Store-relative path for a hash's blob: `objects/<xx>/<hex>`, sharded on the first 2 hex.

    Empty string for a falsy/hashless version so the caller can treat it as "no blob"."""
    hx = hash_hex(h)
    if not hx:
        return ""
    shard = hx[:2] if len(hx) >= 2 else hx
    return f"objects/{shard}/{hx}"


# --- Version enumeration (pure) ---------------------------------------------------------------

def _row(n: int, entry: dict | None, *, present_hashes: set[str], baseline: bool = False,
         current_hash: str | None = None) -> dict:
    h = (current_hash if baseline else (entry or {}).get("hash")) or ""
    return {
        "n": n,
        "hash": h,
        "event": "baseline" if baseline else ((entry or {}).get("event") or ""),
        "ts": "" if baseline else ((entry or {}).get("ts") or ""),
        "actor": "" if baseline else ((entry or {}).get("actor") or ""),
        # A version's content is retrievable iff its blob is in the store. Computed from the caller's
        # set so this module never touches disk. Baselines are usually uncaptured (present=False),
        # but if the same content was later stored we honestly report it as present.
        "present": bool(h) and h in (present_hashes or set()),
    }


def versions_for(ledger: list[dict], artifact: str, *, current_hash: str | None = None,
                 present_hashes: set[str] | None = None) -> list[dict]:
    """Ordinal version list `v1..vN` for `artifact`, derived from the ledger in time order.

    Each row: {n, hash, event, ts, actor, present, restored_from?}. `restored_from` is the ordinal a
    dup-hash version first appeared as (a rollback), so the reader can render "restored from vX".

    Baseline synthesis: an artifact with no change entry yet (pre-existing, predates the ledger)
    yields a single `v1` baseline from `current_hash` — never `[]`, never a KeyError. If it also has
    no current file (nothing on disk, nothing in the ledger), the honest answer is `[]` ("no data")."""
    present_hashes = present_hashes or set()
    changes = am.changes_for(ledger, artifact)

    if not changes:
        if current_hash:
            return [_row(1, None, present_hashes=present_hashes, baseline=True, current_hash=current_hash)]
        return []

    rows = [_row(i, e, present_hashes=present_hashes) for i, e in enumerate(changes, start=1)]

    # Annotate rollbacks: a version whose hash first appeared earlier is a restore of that ordinal.
    first_seen: dict[str, int] = {}
    for row in rows:
        h = row["hash"]
        if not h:
            continue
        if h in first_seen:
            row["restored_from"] = first_seen[h]
        else:
            first_seen[h] = row["n"]
    return rows


# --- Reference resolution ---------------------------------------------------------------------

_VN_RE = re.compile(r"v(\d+)$", re.IGNORECASE)


def resolve_version(versions: list[dict], ref: str) -> tuple[dict | None, str]:
    """Resolve a user ref to one version row. Returns (row, note); row is None if unresolvable.

    Refs, checked in order: `latest`, `prev`, `vN` (ordinal — the primary key), else a hash prefix
    (a disambiguated *hint*, not the key). An ambiguous prefix resolves to the **highest** matching
    ordinal and `note` lists the alternatives, so the caller can surface the ambiguity without ever
    guessing silently."""
    if not versions:
        return None, "no versions"
    ref = str(ref or "").strip()
    if not ref or ref == "latest":
        return versions[-1], ""
    if ref.lower() == "prev":
        if len(versions) < 2:
            return None, "only one version — no previous"
        return versions[-2], ""

    m = _VN_RE.fullmatch(ref)
    if m:
        n = int(m.group(1))
        for row in versions:
            if row["n"] == n:
                return row, ""
        return None, f"no version v{n} (have v1..v{versions[-1]['n']})"

    # Hash-prefix hint (accept a bare hex or a full `sha256:` form).
    needle = hash_hex(ref).lower()
    if needle:
        matches = [row for row in versions if hash_hex(row["hash"]).lower().startswith(needle)]
        if len(matches) == 1:
            return matches[0], ""
        if len(matches) > 1:
            chosen = max(matches, key=lambda r: r["n"])
            alts = ", ".join(f"v{r['n']}" for r in matches)
            return chosen, f"prefix {ref!r} matched {alts} — using v{chosen['n']}"
    return None, f"could not resolve {ref!r} to a version (try latest, prev, vN, or a hash prefix)"
