#!/usr/bin/env bash
#
# post-pr-thread.sh — publish a rail's verdict as a PR comment thread via the Azure DevOps REST API.
#
# WHY THIS EXISTS: GitHub's grader posts a line-anchored, check-by-check verdict as a PR comment (the
# claude-code-action does it with the GitHub token). Azure DevOps has no such action, so this script
# reproduces the behavior with the ADO REST API, authenticated by the pipeline's own $(System.AccessToken):
#
#   POST/PATCH {collectionUri}{project}/_apis/git/repositories/{repoId}/pullRequests/{prId}/threads?api-version=7.1
#
# "Update the same comment on re-runs" (the action's behavior) is reproduced deterministically: each
# rail tags its thread with a hidden marker (e.g. `<!-- rails-gate:grader -->`). On re-run we find the
# existing thread by that marker and PATCH its first comment instead of stacking a new thread.
#
# ── CONTRACT ─────────────────────────────────────────────────────────────────────
#   INPUTS (env):
#     ORG_URL          $(System.CollectionUri)      e.g. https://dev.azure.com/your-org/
#     PROJECT          $(System.TeamProject)
#     REPO_ID          $(Build.Repository.ID)
#     PR_ID            $(System.PullRequest.PullRequestId)
#     SYSTEM_ACCESSTOKEN  $(System.AccessToken)      (map it explicitly in the step's env:)
#     MARKER           stable per-rail id, e.g. "grader" / "correctness-review" / "security-review"
#     COMMENT_FILE     path to the markdown body to post
#     THREAD_STATUS    (optional) active | closed | fixed ... (default: active)
#   Requires: curl, jq. The build service identity needs "Contribute to pull requests" on the repo.
# ───────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${ORG_URL:?ORG_URL is required}"
: "${PROJECT:?PROJECT is required}"
: "${REPO_ID:?REPO_ID is required}"
: "${PR_ID:?PR_ID is required}"
: "${MARKER:?MARKER is required}"
: "${COMMENT_FILE:?COMMENT_FILE is required}"
THREAD_STATUS="${THREAD_STATUS:-active}"

if [ -z "${SYSTEM_ACCESSTOKEN:-}" ]; then
  echo "ERROR: SYSTEM_ACCESSTOKEN not set. Map it in the step env: SYSTEM_ACCESSTOKEN: \$(System.AccessToken)" >&2
  echo "and ensure the pipeline is allowed to use the OAuth token." >&2
  exit 3
fi
command -v jq >/dev/null || { echo "ERROR: jq not found." >&2; exit 4; }

HIDDEN_MARKER="<!-- rails-gate:${MARKER} -->"
API="api-version=7.1"
BASE="${ORG_URL%/}/${PROJECT}/_apis/git/repositories/${REPO_ID}/pullRequests/${PR_ID}"
AUTH=(-H "Authorization: Bearer ${SYSTEM_ACCESSTOKEN}")
JSON=(-H "Content-Type: application/json")

# Body = the hidden marker (so re-runs find this thread) + Claude's comment.
BODY="$(printf '%s\n\n' "$HIDDEN_MARKER"; cat "$COMMENT_FILE")"

# Look for an existing thread whose FIRST comment carries our marker.
THREADS_JSON="$(curl -sf "${AUTH[@]}" "${BASE}/threads?${API}")" || {
  echo "ERROR: failed to list PR threads (permission on the build identity?)." >&2; exit 1; }

# Emit "<threadId> <commentId>" for the matching thread, or empty when none matches.
MATCH="$(printf '%s' "$THREADS_JSON" | jq -r --arg m "$HIDDEN_MARKER" '
  ([ .value[]? | select((.comments[0].content // "") | contains($m)) ] | .[0]) as $t
  | if $t == null then "" else "\($t.id) \($t.comments[0].id)" end')"
THREAD_ID="$(printf '%s' "$MATCH" | awk '{print $1}')"
COMMENT_ID="$(printf '%s' "$MATCH" | awk '{print $2}')"

if [ -n "$THREAD_ID" ] && [ "$THREAD_ID" != "null" ]; then
  echo "Updating existing thread $THREAD_ID (comment $COMMENT_ID) for rail '${MARKER}'."
  jq -n --arg content "$BODY" '{content: $content}' \
    | curl -sf -X PATCH "${AUTH[@]}" "${JSON[@]}" -d @- \
        "${BASE}/threads/${THREAD_ID}/comments/${COMMENT_ID}?${API}" >/dev/null
  echo "Updated."
else
  echo "Creating a new thread for rail '${MARKER}'."
  jq -n --arg content "$BODY" --arg status "$THREAD_STATUS" '{
    comments: [ { parentCommentId: 0, content: $content, commentType: 1 } ],
    status: $status
  }' | curl -sf -X POST "${AUTH[@]}" "${JSON[@]}" -d @- "${BASE}/threads?${API}" >/dev/null
  echo "Posted."
fi
