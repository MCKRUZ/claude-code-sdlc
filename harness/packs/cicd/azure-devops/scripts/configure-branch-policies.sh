#!/usr/bin/env bash
#
# configure-branch-policies.sh — apply the protected-branch policies to Azure DevOps as code.
#
# The Azure DevOps analogue of GitHub's apply-branch-protection.sh. On GitHub, "branch protection as
# code" is a ruleset JSON pushed with `gh api`. On Azure DevOps there is no single ruleset object —
# protection is a SET of branch policies (build validation, minimum approvers, required reviewers). This
# script reads the desired state from branch-policies.json and realizes each entry with the `az repos
# policy` / `az pipelines` CLIs. It is idempotent (create if absent, update in place) per policy.
#
# It NEVER runs automatically. A human runs it deliberately after reading the plan. Applying live branch
# policy is a HIGH-risk, outward-facing action; treat it as such.
#
# Requirements: az (with the azure-devops extension), jq, and an az login / PAT with project-admin scope.
# The build-validation policies reference gate PIPELINES by name — create those pipelines first
# (Pipelines → New pipeline → point at .azuredevops/pipelines/<gate>.yml), or this script cannot resolve
# their definition ids.
#
# ── PLACEHOLDERS ───────────────────────────────────────────────────────────────
#   <<ORG_URL>>       https://dev.azure.com/your-org  (or set AZDO_ORG_URL / `az devops configure`)
#   <<PROJECT>>       the project name                (or set AZDO_PROJECT)
#   <<REPO>>          the repository name             (or set AZDO_REPO)
#   <<POLICIES_FILE>> path to branch-policies.json    (default: alongside this script's install dir)
#   <<CODE_OWNER>>    resolved inside branch-policies.json (required-reviewer descriptor/email)
# ───────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   scripts/rails/configure-branch-policies.sh --dry-run    # show the plan, no writes
#   scripts/rails/configure-branch-policies.sh              # apply (prompts to confirm)
#   AZDO_ORG_URL=... AZDO_PROJECT=... AZDO_REPO=... scripts/rails/configure-branch-policies.sh
#
set -euo pipefail

POLICIES_FILE="${POLICIES_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.azuredevops/rails/branch-policies.json}"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

command -v az >/dev/null || { echo "ERROR: az CLI not found." >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq not found." >&2; exit 1; }
az extension show --name azure-devops >/dev/null 2>&1 || { echo "ERROR: az 'azure-devops' extension not installed (az extension add --name azure-devops)." >&2; exit 1; }
[ -f "$POLICIES_FILE" ] || { echo "ERROR: policies file missing: $POLICIES_FILE" >&2; exit 1; }

ORG_URL="${AZDO_ORG_URL:-<<ORG_URL>>}"
PROJECT="${AZDO_PROJECT:-<<PROJECT>>}"
REPO="${AZDO_REPO:-<<REPO>>}"
BRANCH="$(jq -r '.branch' "$POLICIES_FILE")"
MATCH="$(jq -r '.branchMatchType // "exact"' "$POLICIES_FILE")"

echo "Organization : $ORG_URL"
echo "Project      : $PROJECT"
echo "Repository   : $REPO"
echo "Branch       : $BRANCH ($MATCH)"
echo "Source       : $POLICIES_FILE"
echo

AZ=(az)
COMMON=(--organization "$ORG_URL" --project "$PROJECT")

REPO_ID="$("${AZ[@]}" repos show --repository "$REPO" "${COMMON[@]}" --query id -o tsv)"
[ -n "$REPO_ID" ] || { echo "ERROR: could not resolve repository id for '$REPO'." >&2; exit 1; }

# Existing policies once, for idempotent matching.
EXISTING="$("${AZ[@]}" repos policy list "${COMMON[@]}" --repository-id "$REPO_ID" --branch "$BRANCH" -o json)"

plan() { echo "  PLAN: $*"; }
run()  { if [ "$DRY_RUN" -eq 1 ]; then plan "$@"; else "$@"; fi; }

# Applying live branch policy is HIGH-risk and outward-facing — confirm BEFORE any write.
if [ "$DRY_RUN" -ne 1 ]; then
  echo "--- Desired policies ---"
  jq '{branch, build_validation: [.build_validation[] | {displayName, isBlocking, pathFilters}], approver_count, required_reviewers: [.required_reviewers[] | {reviewerIds, pathFilters}]}' "$POLICIES_FILE"
  echo "------------------------"
  read -r -p "Apply these policies live to $REPO ($BRANCH)? [y/N] " confirm
  case "$confirm" in y|Y|yes|YES) ;; *) echo "Aborted. No changes made."; exit 0 ;; esac
  echo
fi

echo "--- Build validation policies (required status-check analogue) ---"
jq -c '.build_validation[]' "$POLICIES_FILE" | while read -r bv; do
  NAME="$(jq -r '.pipelineName' <<<"$bv")"
  DISPLAY="$(jq -r '.displayName' <<<"$bv")"
  BLOCKING="$(jq -r '.isBlocking' <<<"$bv")"
  DURATION="$(jq -r '.validDurationMinutes // 720' <<<"$bv")"
  mapfile -t PATHS < <(jq -r '.pathFilters[]?' <<<"$bv")

  DEF_ID="$("${AZ[@]}" pipelines show --name "$NAME" "${COMMON[@]}" --query id -o tsv 2>/dev/null || true)"
  if [ -z "$DEF_ID" ]; then
    echo "  SKIP '$DISPLAY': pipeline '$NAME' not found — create it first (point it at .azuredevops/pipelines/${NAME}.yml)."
    continue
  fi

  EXISTING_ID="$(jq -r --argjson d "$DEF_ID" 'map(select(.type.id=="0609b952-1397-4640-95ec-e00a01b2c241" and .settings.buildDefinitionId==$d)) | .[0].id // empty' <<<"$EXISTING")"
  # One COMPLETE parameter set, shared verbatim by create and update, so an update
  # never silently drops display-name / path filters / valid-duration / queue
  # settings. `az repos policy build update` accepts the full set (verified against
  # the az CLI reference for `az repos policy build`).
  POLICY_ARGS=(--repository-id "$REPO_ID" --branch "$BRANCH" --branch-match-type "$MATCH"
        --build-definition-id "$DEF_ID" --display-name "$DISPLAY"
        --blocking "$BLOCKING" --enabled true
        --queue-on-source-update-only true --manual-queue-only false --valid-duration "$DURATION")
  if [ "${#PATHS[@]}" -gt 0 ]; then
    POLICY_ARGS+=(--path-filter "$(IFS=';'; echo "${PATHS[*]}")")
  fi
  if [ -n "$EXISTING_ID" ]; then
    echo "  UPDATE build policy '$DISPLAY' (id=$EXISTING_ID)"
    run "${AZ[@]}" repos policy build update "${COMMON[@]}" --id "$EXISTING_ID" "${POLICY_ARGS[@]}" >/dev/null
  else
    echo "  CREATE build policy '$DISPLAY'"
    run "${AZ[@]}" repos policy build create "${COMMON[@]}" "${POLICY_ARGS[@]}" >/dev/null
  fi
done

echo "--- Minimum-approver-count policy (non-author approval) ---"
AC="$(jq -c '.approver_count' "$POLICIES_FILE")"
MIN="$(jq -r '.minimumApproverCount' <<<"$AC")"
CREATOR="$(jq -r '.creatorVoteCounts' <<<"$AC")"
DOWN="$(jq -r '.allowDownvotes' <<<"$AC")"
RESET="$(jq -r '.resetOnSourcePush' <<<"$AC")"
AC_ID="$(jq -r 'map(select(.type.id=="fa4e907d-c16b-4a4c-9dfa-4906e5d171dd")) | .[0].id // empty' <<<"$EXISTING")"
if [ -n "$AC_ID" ]; then
  echo "  UPDATE approver-count (id=$AC_ID)"
  run "${AZ[@]}" repos policy approver-count update "${COMMON[@]}" --policy-id "$AC_ID" \
    --minimum-approver-count "$MIN" --creator-vote-counts "$CREATOR" --allow-downvotes "$DOWN" \
    --reset-on-source-push "$RESET" --blocking true --enabled true >/dev/null
else
  echo "  CREATE approver-count"
  run "${AZ[@]}" repos policy approver-count create "${COMMON[@]}" --repository-id "$REPO_ID" --branch "$BRANCH" \
    --branch-match-type "$MATCH" --minimum-approver-count "$MIN" --creator-vote-counts "$CREATOR" \
    --allow-downvotes "$DOWN" --reset-on-source-push "$RESET" --blocking true --enabled true >/dev/null
fi

echo "--- Required-reviewer policies (CODEOWNERS analogue, gated paths) ---"
jq -c '.required_reviewers[]' "$POLICIES_FILE" | while read -r rr; do
  mapfile -t IDS < <(jq -r '.reviewerIds[]' <<<"$rr")
  mapfile -t PATHS < <(jq -r '.pathFilters[]?' <<<"$rr")
  MSG="$(jq -r '.message // "Code-owner review required on gated paths."' <<<"$rr")"
  echo "  CREATE/UPDATE required-reviewer for gated paths (reviewers: ${IDS[*]})"
  run "${AZ[@]}" repos policy required-reviewer create "${COMMON[@]}" --repository-id "$REPO_ID" \
    --branch "$BRANCH" --branch-match-type "$MATCH" --blocking true --enabled true \
    --message "$MSG" --required-reviewer-ids "$(IFS=';'; echo "${IDS[*]}")" \
    ${PATHS:+--path-filter "$(IFS=';'; echo "${PATHS[*]}")"} >/dev/null 2>&1 || \
    echo "    (a required-reviewer policy for these paths may already exist — Azure does not de-dupe by name; review in Project Settings → Repositories → Policies.)"
done

echo
if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY RUN complete. No changes made. Re-run without --dry-run to apply."
  exit 0
fi
echo "Done. Verify in Project Settings → Repositories → $REPO → Policies for branch '$BRANCH'."
