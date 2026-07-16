#!/usr/bin/env bash
#
# review-gate.sh — bash twin of review-gate.ps1. The "review gate": a push refuses
# until per-commit review evidence exists. Also enforces the download-and-execute policy
# (no curl|sh), which settings.json patterns cannot express. Use on hosts without pwsh.
#
# Maturity: STABLE machinery, POLICY-COUPLED (assumes /code-review + /simplify and that
# receipts are written by save-review-receipt.{ps1,sh}). See kit/hooks/README.md.
#
# Env knobs:
#   RAILS_REVIEW_BASE      — base ref to diff against. Default: origin/main, then main.
#   RAILS_REVIEW_SRC_REGEX — ERE over changed paths that counts as compilable source.
#   RAILS_REVIEW_KINDS     — comma-separated review kinds needing receipts.
#                            Default: code-review,simplify.
#   RAILS_SKIP_REVIEW_GATE — set to 1 for a documented, auditable emergency bypass.
#
# CONTRACT (verified): PreToolUse blocks via JSON
#   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
#    "permissionDecisionReason":"..."}}  on stdout, then exit 0. Allow = emit nothing, exit 0.
#
# Requires: jq, git. Missing jq/git => fail OPEN (allow).

set -uo pipefail

allow() { exit 0; }

deny() {
  jq -nc --arg reason "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

raw="$(cat)"
[[ -z "$raw" ]] && allow

command -v jq  >/dev/null 2>&1 || { echo "review-gate: jq not found; skipping." >&2; allow; }

tool_name="$(printf '%s' "$raw" | jq -r '.tool_name // empty' 2>/dev/null)"
[[ "$tool_name" == "Bash" ]] || allow

cmd="$(printf '%s' "$raw" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[[ -z "$cmd" ]] && allow

# --- Download-and-execute guard. Piping a downloader straight into a shell cannot be
#     expressed as a settings.json permission pattern (no mid-command wildcards), so the
#     policy is enforced here: same pipeline stage = downloader, then a pipe, then a shell.
pipe_to_shell_re='(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)[^|;&]*\|[[:space:]]*(sudo[[:space:]]+)?((ba|z|da)?sh|pwsh|powershell|iex|Invoke-Expression)([[:space:]]|$)'
if [[ "$cmd" =~ $pipe_to_shell_re ]]; then
  deny "Blocked: piping a download straight into a shell (curl|sh and friends) is denied by policy. Download to a file, inspect it, then execute it as a separate, reviewable step."
fi

# --- Only gate commands that actually INVOKE git push / gh pr create. Inspect the start
#     of each shell segment (split on ; && || | &) so the words inside a quoted string or
#     an echo don't trip the gate. `git -C <path> push` is recognized.
#     awk, not sed: BSD sed renders '\n' in a replacement as a literal 'n', which would
#     leave compound commands unsplit and let `cd x && git push` walk past the gate.
gates=false
segment_stream="$(printf '%s' "$cmd" | awk '{gsub(/\|\||&&|[;|&]/, "\n"); print}')"
while IFS= read -r seg; do
  s="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')"
  if [[ "$s" =~ ^git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?push([[:space:]]|$) ]] \
     || [[ "$s" =~ ^gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$) ]]; then
    gates=true
    break
  fi
done <<< "$segment_stream"
[[ "$gates" == "true" ]] || allow

# --- Documented escape hatch.
if [[ "${RAILS_SKIP_REVIEW_GATE:-}" == "1" ]]; then
  echo "review-gate: RAILS_SKIP_REVIEW_GATE=1 set; skipping review gate." >&2
  allow
fi

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$project_dir" || allow

command -v git >/dev/null 2>&1 || { echo "review-gate: git not found; skipping review gate." >&2; allow; }

# --- Resolve the base to diff against.
base=""
for ref in "${RAILS_REVIEW_BASE:-}" origin/main main; do
  [[ -z "$ref" ]] && continue
  if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then base="$ref"; break; fi
done

if [[ -n "$base" ]]; then
  changed="$(git diff --name-only "$base...HEAD" 2>/dev/null)"
  diff_rc=$?
else
  changed="$(git show --name-only --pretty=format: HEAD 2>/dev/null)"
  diff_rc=$?
fi
# Can't compute a diff at all — fail open rather than wedge the session.
if [[ $diff_rc -ne 0 ]]; then
  echo "review-gate: could not compute branch diff; skipping." >&2
  allow
fi

# --- Scope: only compilable source triggers the gate.
src_regex="${RAILS_REVIEW_SRC_REGEX:-^src/.*\.(cs|csproj|slnx|sln|props|targets|razor|cshtml|ts|html)$}"
src_changed="$(printf '%s\n' "$changed" | grep -E "$src_regex" || true)"
[[ -z "$src_changed" ]] && allow

# --- The committed code under review must equal what gets pushed.
dirty_src="$(git status --porcelain -- 'src' 2>/dev/null)"
if [[ -n "$dirty_src" ]]; then
  deny "Review gate: you have uncommitted changes under src/. Commit them first so the review covers exactly what you push, then run /code-review and /simplify on the final commit."
fi

# --- Require a receipt for each review kind, bound to the exact commit being pushed.
sha="$(git rev-parse --short HEAD 2>/dev/null)"
[[ -z "$sha" ]] && allow   # detached/unborn — can't bind; don't wedge.

kinds_raw="${RAILS_REVIEW_KINDS:-code-review,simplify}"
IFS=$', \t\n' read -r -a kinds <<< "$kinds_raw"

receipt_dir="$project_dir/.claude/.review-receipts"
missing=()
for kind in "${kinds[@]}"; do
  [[ -z "$kind" ]] && continue
  [[ -f "$receipt_dir/$sha.$kind" ]] || missing+=("/$kind")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  if [[ ${#missing[@]} -eq 1 ]]; then verb="has"; else verb="have"; fi
  deny "Review gate: src/ changed but [${missing[*]}] $verb not been run against commit $sha. Run the missing review(s), then record each by piping its summary to .claude/hooks/save-review-receipt.sh (e.g. '...summary...' | bash .claude/hooks/save-review-receipt.sh code-review). Re-run after re-committing any fixes the reviews produce. Emergency bypass: set RAILS_SKIP_REVIEW_GATE=1."
fi

allow
