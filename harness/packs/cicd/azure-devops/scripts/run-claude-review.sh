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
#     ANTHROPIC_API_KEY  the Claude API key (api-key mode — the default)
#     CLAUDE_CLI_VERSION (optional) npm version spec for @anthropic-ai/claude-code (default: latest)
#   INPUTS (env, keyless Foundry mode — opt-in, see RAILS.md §"Keyless auth via Microsoft Foundry"):
#     CLAUDE_CODE_USE_FOUNDRY        '1' switches the CLI to Microsoft Foundry; anything else
#                                    (unset, '', an unresolved ADO macro) keeps api-key mode.
#     ANTHROPIC_FOUNDRY_RESOURCE     the Foundry resource name (or set ANTHROPIC_FOUNDRY_BASE_URL)
#     ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL
#                                    the resource's DEPLOYMENT names for the aliases the rails
#                                    pass as MODEL — Foundry does not auto-resolve sonnet/opus,
#                                    so the pin for the alias in use is REQUIRED (fail closed).
#     ANTHROPIC_FOUNDRY_AUTH_TOKEN   (optional) pre-issued Entra access token — the pipeline
#                                    pattern: an AzureCLI@2 step mints it from the service
#                                    connection (az account get-access-token --resource
#                                    https://cognitiveservices.azure.com). Without it the CLI
#                                    walks the Azure default credential chain (az login context).
#     ANTHROPIC_FOUNDRY_API_KEY      (optional) the Foundry resource key — key-based fallback.
#     The identity used must hold a data-plane role on the resource (Cognitive Services User;
#     some tenants also have "Azure AI User"). ANTHROPIC_API_KEY is NOT required in this mode.
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

# ── Auth. Two modes; the default is byte-for-byte the original api-key behavior.
# Azure Pipelines leaves an UNRESOLVED $(macro) as literal text in the env, so any foundry
# value still starting with '$(' is treated as unset rather than handed to the CLI as garbage.
_scrub_ado_macro() { case "${1:-}" in '$('*) printf '' ;; *) printf '%s' "${1:-}" ;; esac; }
CLAUDE_CODE_USE_FOUNDRY="$(_scrub_ado_macro "${CLAUDE_CODE_USE_FOUNDRY:-}")"

if [ "$CLAUDE_CODE_USE_FOUNDRY" = "1" ]; then
  # Keyless Foundry mode (opt-in). Scrub every foundry input of unresolved-macro literals,
  # then fail closed on the two things the CLI cannot guess: the resource and the deployment
  # pin for the alias this rail passes as MODEL (Foundry has no alias auto-resolution).
  export CLAUDE_CODE_USE_FOUNDRY
  export ANTHROPIC_FOUNDRY_RESOURCE="$(_scrub_ado_macro "${ANTHROPIC_FOUNDRY_RESOURCE:-}")"
  export ANTHROPIC_FOUNDRY_BASE_URL="$(_scrub_ado_macro "${ANTHROPIC_FOUNDRY_BASE_URL:-}")"
  export ANTHROPIC_FOUNDRY_AUTH_TOKEN="$(_scrub_ado_macro "${ANTHROPIC_FOUNDRY_AUTH_TOKEN:-}")"
  export ANTHROPIC_FOUNDRY_API_KEY="$(_scrub_ado_macro "${ANTHROPIC_FOUNDRY_API_KEY:-}")"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="$(_scrub_ado_macro "${ANTHROPIC_DEFAULT_SONNET_MODEL:-}")"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="$(_scrub_ado_macro "${ANTHROPIC_DEFAULT_OPUS_MODEL:-}")"
  export ANTHROPIC_API_KEY="$(_scrub_ado_macro "${ANTHROPIC_API_KEY:-}")"   # ignored by the foundry path; scrubbed so a dropped variable group can't leak a macro literal

  if [ -z "$ANTHROPIC_FOUNDRY_RESOURCE" ] && [ -z "$ANTHROPIC_FOUNDRY_BASE_URL" ]; then
    echo "ERROR: CLAUDE_CODE_USE_FOUNDRY=1 but neither ANTHROPIC_FOUNDRY_RESOURCE nor" >&2
    echo "ANTHROPIC_FOUNDRY_BASE_URL is set. The Claude gate cannot run — see RAILS.md." >&2
    exit 3
  fi
  case "$MODEL" in
    sonnet) [ -n "$ANTHROPIC_DEFAULT_SONNET_MODEL" ] || {
      echo "ERROR: foundry mode with MODEL=sonnet needs ANTHROPIC_DEFAULT_SONNET_MODEL set to the" >&2
      echo "resource's deployment name — Foundry does not auto-resolve model aliases. See RAILS.md." >&2
      exit 3; } ;;
    opus)   [ -n "$ANTHROPIC_DEFAULT_OPUS_MODEL" ] || {
      echo "ERROR: foundry mode with MODEL=opus needs ANTHROPIC_DEFAULT_OPUS_MODEL set to the" >&2
      echo "resource's deployment name — Foundry does not auto-resolve model aliases. See RAILS.md." >&2
      exit 3; } ;;
    *) ;;   # a full deployment/model id — no alias to resolve, no pin needed. (The rails only
            # pass sonnet|opus; another ALIAS, e.g. haiku, would need its own arm here.)
  esac
  if [ -z "$ANTHROPIC_FOUNDRY_AUTH_TOKEN" ] && [ -z "$ANTHROPIC_FOUNDRY_API_KEY" ]; then
    echo "Foundry auth: no pre-issued token or key — the CLI will walk the Azure default" >&2
    echo "credential chain (needs an authenticated az context, e.g. an AzureCLI@2 wrapper)." >&2
  fi
elif [ -z "${ANTHROPIC_API_KEY:-}" ]; then
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
