#!/usr/bin/env bash
#
# run-claude-review.sh — invoke Claude headless for one rail (grader / correctness / security).
#
# WHY THIS EXISTS: GitHub's rails call the `anthropics/claude-code-action@v1` action, which runs the
# Claude Code CLI, gives Claude a GitHub token to post PR comments, and handles the fail-soft/fail-closed
# posture. Azure DevOps has no such action. This script is the faithful equivalent: it runs the SAME
# Claude Code CLI (`npx @anthropic-ai/claude-code -p ...`) with the SAME model / max-turns / allowed-tools
# the action's `claude_args` set, then a companion step (post-pr-thread.sh) publishes the result via the
# ADO REST API. Splitting "review" from "publish" keeps the model's output as untrusted DATA that a
# deterministic step posts — it never gets the PR write token itself.
#
# The API key comes from the ANTHROPIC_API_KEY env var (pipeline secret, ideally Key-Vault-backed).
#
# ── CONTRACT ─────────────────────────────────────────────────────────────────────
#   INPUTS  (env):
#     PROMPT           the full rail prompt (mirrors the action's `prompt:` block)
#     MODEL            sonnet | opus            (mirrors --model)
#     MAX_TURNS        e.g. 20 / 25             (mirrors --max-turns)
#     ALLOWED_TOOLS    e.g. "Bash Read Grep Glob"  (mirrors --allowedTools; space-separated)
#     COMMENT_FILE     path to write Claude's final message (the PR-comment body)
#     ANTHROPIC_API_KEY  the Claude API key
#     CLAUDE_CLI_VERSION (optional) npm version spec for @anthropic-ai/claude-code (default: latest)
#   OUTPUTS:
#     COMMENT_FILE is written with Claude's final assistant message (the verdict comment).
#     For correctness/security, Claude itself ALSO writes the verdict token file (path is in PROMPT),
#     via its Write tool — this script does not touch that file (anti-tamper: the enforce step reads it).
#   EXIT:
#     0  on a completed review; non-zero if the CLI could not run (missing key, install failure, API
#        error). The caller decides pass/fail: the grader step is continue-on-error (fail SOFT); the
#        correctness/security steps let the ENFORCE step fail CLOSED when no verdict file appears.
# ───────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${PROMPT:?PROMPT is required}"
: "${MODEL:?MODEL is required}"
: "${MAX_TURNS:?MAX_TURNS is required}"
: "${ALLOWED_TOOLS:?ALLOWED_TOOLS is required}"
: "${COMMENT_FILE:?COMMENT_FILE is required}"
CLAUDE_CLI_VERSION="${CLAUDE_CLI_VERSION:-latest}"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. The Claude gate cannot run." >&2
  echo "Set it as a pipeline secret (ideally a Key-Vault-backed variable group) — see RAILS.md." >&2
  exit 3
fi

command -v node >/dev/null || { echo "ERROR: node not found (add a UseNode step before this)." >&2; exit 4; }

# --permission-mode bypassPermissions: there is no interactive approver on a CI agent, and the tool set
# is already restricted via --allowedTools. The runner is ephemeral and the token is scoped to this run.
# --allowedTools takes a space-separated list, exactly as the action's `claude_args` passed it.
echo "Running Claude ($MODEL, max-turns $MAX_TURNS, tools: $ALLOWED_TOOLS)..."
set +e
npx --yes "@anthropic-ai/claude-code@${CLAUDE_CLI_VERSION}" \
  -p "$PROMPT" \
  --model "$MODEL" \
  --max-turns "$MAX_TURNS" \
  --allowedTools $ALLOWED_TOOLS \
  --permission-mode bypassPermissions \
  --output-format text \
  > "$COMMENT_FILE" 2> "${COMMENT_FILE}.stderr"
rc=$?
set -e

if [ "$rc" -ne 0 ]; then
  echo "::warning:: Claude CLI exited non-zero ($rc). stderr tail:" >&2
  tail -n 20 "${COMMENT_FILE}.stderr" >&2 || true
  exit "$rc"
fi

echo "Claude review complete. Comment body ($(wc -c < "$COMMENT_FILE") bytes) written to $COMMENT_FILE."
