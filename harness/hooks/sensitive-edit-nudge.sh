#!/usr/bin/env bash
# Faithful bash twin of sensitive-edit-nudge.ps1 — identical logic and contract.
#
# Advisory PreToolUse nudge: reminds the agent what the standard requires when it is about to
# edit a security-sensitive path. Never blocks — emits `additionalContext` with no
# `permissionDecision`, so the tool call proceeds and the string arrives as a system reminder.
#
# Shipped as a worked example, deliberately NOT registered in settings.json. See README.md,
# "Advisory nudges".

set -uo pipefail

# Paths the standard treats as security-sensitive. Same trees settings.json gates with `ask`.
DEFAULT_PATTERN='(^|/)(Auth|Identity|Security|SecurityAttributes|Migrations)(/|$)|(^|/)infra/'
PATTERN="${RAILS_NUDGE_PATH_REGEX:-$DEFAULT_PATTERN}"

# ASCII only, deliberately: must match the .ps1 twin byte-for-byte under both runtimes.
DEFAULT_MESSAGE='Delivery-standard nudge: this path is security-sensitive. Treat the change as risk:high, and run the security-reviewer agent over it before you finish: the security pass precedes the named human sign-off, and `security-review` is a required merge check. Disregard if this edit is only comments, docs, or test fixtures.'
MESSAGE="${RAILS_NUDGE_MESSAGE:-$DEFAULT_MESSAGE}"

# Fail open when the tooling isn't there, same as the gates.
command -v jq >/dev/null 2>&1 || exit 0

payload="$(cat)"
[ -n "$payload" ] || exit 0

path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)" || exit 0
[ -n "$path" ] || exit 0

printf '%s' "${path//\\//}" | grep -qE "$PATTERN" || exit 0

jq -nc --arg msg "$MESSAGE" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$msg}}'

exit 0
