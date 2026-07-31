#!/usr/bin/env bash
#
# save-review-receipt.sh — bash twin of save-review-receipt.ps1. Records that a review ran
# against the current commit, for review-gate.sh to verify before a push/PR.
#
# Usage (pipe the review summary on stdin so the receipt is real evidence, not a flag):
#   "...code-review findings..." | bash .claude/hooks/save-review-receipt.sh code-review
#   "...simplify findings..."    | bash .claude/hooks/save-review-receipt.sh simplify
#
# Writes .claude/.review-receipts/<HEAD-short-sha>.<kind>, bound to the exact commit.
# Amending/adding commits changes the SHA and re-arms the gate. Receipts are gitignored.
#
# Maturity: STABLE. Requires git.
#
# Env knobs:
#   RAILS_REVIEW_KINDS — comma-separated allowed review kinds. Default: code-review,simplify.

set -uo pipefail

kind="${1:-}"
if [[ -z "$kind" ]]; then
  echo "save-review-receipt: usage: <summary on stdin> | save-review-receipt.sh <kind>" >&2
  exit 1
fi

kinds_raw="${RAILS_REVIEW_KINDS:-code-review,simplify}"
IFS=$', \t\n' read -r -a allowed <<< "$kinds_raw"
ok=false
for k in "${allowed[@]}"; do [[ "$k" == "$kind" ]] && ok=true; done
if [[ "$ok" != "true" ]]; then
  echo "save-review-receipt: '$kind' is not an allowed review kind (${allowed[*]})." >&2
  exit 1
fi

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$project_dir" || { echo "save-review-receipt: cannot cd to project dir." >&2; exit 1; }

command -v git >/dev/null 2>&1 || { echo "save-review-receipt: git not found." >&2; exit 1; }

sha="$(git rev-parse --short HEAD 2>/dev/null)"
if [[ -z "$sha" ]]; then
  echo "save-review-receipt: cannot resolve HEAD." >&2; exit 1
fi

receipt_dir="$project_dir/.claude/.review-receipts"
mkdir -p "$receipt_dir"

summary="$(cat)"
[[ -z "$summary" ]] && summary="($kind run; no summary piped)"

path="$receipt_dir/$sha.$kind"
{
  printf '# %s receipt\ncommit: %s\n\n' "$kind" "$sha"
  printf '%s\n' "$summary"
} > "$path"

echo "Saved $kind receipt for commit $sha at .claude/.review-receipts/$sha.$kind"
