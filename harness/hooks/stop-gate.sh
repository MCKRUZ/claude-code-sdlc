#!/usr/bin/env bash
#
# stop-gate.sh — bash twin of stop-gate.ps1. The "Stop gate": mechanical
# self-validation before a turn ends. Use this on hosts without PowerShell (pwsh).
#
# Maturity: STABLE. Same Stop-hook contract as the .ps1 twin.
#
# Env knobs (see kit/hooks/README.md):
#   RAILS_SRC_GLOB        — space/comma/newline-separated git pathspecs that count as
#                           compilable source. Default targets a .NET tree.
#   RAILS_SOLUTION        — explicit solution/project path to build. If unset, the first
#                           *.slnx / *.sln found under the project root is used.
#   RAILS_STOP_RUN_TESTS  — set to 1 to also run the test suite after a green build.
#
# CONTRACT (verified, do not change):
#   * Block: print top-level JSON {"decision":"block","reason":"..."} to stdout AND
#     `exit 2`. `exit 1` is silently IGNORED by Claude Code. `hookSpecificOutput` is
#     INVALID on Stop hooks — never use it here.
#   * Allow: print nothing and `exit 0`.
#   * `reason` is the only text surfaced back to the model — keep it actionable.
#
# Requires: jq (payload parsing), git, dotnet. Missing dotnet/git => fail OPEN (allow).

set -uo pipefail

allow() { exit 0; }

# Emit a block decision. jq builds the JSON so the reason is safely escaped.
block() {
  jq -nc --arg reason "$1" '{decision:"block", reason:$reason}'
  exit 2
}

raw="$(cat)"

# Loop guard: if we are already inside a stop-hook block, never block again.
if [[ -n "$raw" ]] && command -v jq >/dev/null 2>&1; then
  if [[ "$(printf '%s' "$raw" | jq -r '.stop_hook_active // false' 2>/dev/null)" == "true" ]]; then
    allow
  fi
fi

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$project_dir" || allow

# jq is required to parse the payload safely; without it we cannot honor the loop
# guard, so fail open rather than risk wedging the session.
command -v jq  >/dev/null 2>&1 || { echo "stop-gate: jq not found; skipping." >&2; allow; }
command -v git >/dev/null 2>&1 || { echo "stop-gate: git not found; skipping." >&2; allow; }

# --- Only gate when compilable source changed this session.
glob_raw="${RAILS_SRC_GLOB:-src/**/*.cs src/**/*.csproj src/**/*.slnx src/**/*.sln src/**/*.props src/**/*.targets src/**/*.razor src/**/*.cshtml}"
# Split on commas/whitespace into an array of pathspecs.
IFS=$', \t\n' read -r -a pathspecs <<< "$glob_raw"
dirty_src="$(git status --porcelain -- "${pathspecs[@]}" 2>/dev/null)"
[[ -z "$dirty_src" ]] && allow

# --- Resolve what to build.
solution="${RAILS_SOLUTION:-}"
if [[ -n "$solution" && "$solution" != /* ]]; then
  solution="$project_dir/$solution"
fi
if [[ -z "$solution" || ! -e "$solution" ]]; then
  solution="$(find "$project_dir" -type f \( -name '*.slnx' -o -name '*.sln' \) 2>/dev/null | head -n1)"
fi
[[ -z "$solution" ]] && allow   # nothing buildable here

command -v dotnet >/dev/null 2>&1 || { echo "stop-gate: dotnet not found; skipping build gate." >&2; allow; }

# Prefer `timeout` to bound a runaway build; degrade gracefully if it is absent.
run() {
  if command -v timeout >/dev/null 2>&1; then timeout 540 "$@"; else "$@"; fi
}

# --- Prove the build.
build_out="$(run dotnet build "$solution" --nologo --configuration Debug -clp:ErrorsOnly 2>&1)"
if [[ $? -ne 0 ]]; then
  err_lines="$(printf '%s\n' "$build_out" | grep -i 'error' | head -n 15)"
  block "Build is red — you cannot finish on a broken build (Stop gate). Fix the build before ending the turn. First errors:
$err_lines"
fi

# --- Optionally prove the tests.
if [[ "${RAILS_STOP_RUN_TESTS:-}" == "1" ]]; then
  test_out="$(run dotnet test "$solution" --nologo --no-build --configuration Debug 2>&1)"
  if [[ $? -ne 0 ]]; then
    fail_lines="$(printf '%s\n' "$test_out" | grep -iE 'Failed|error' | head -n 15)"
    block "Tests are red — you cannot finish with failing tests (Stop gate). Fix them before ending the turn. Summary:
$fail_lines"
  fi
fi

allow
