#!/usr/bin/env pwsh
#
# review-gate.ps1 — the "review gate": a push refuses until per-commit review
# evidence exists. Also enforces the download-and-execute policy (no curl|sh),
# which settings.json permission patterns cannot express.
#
# Fires on the Claude Code `PreToolUse` event for Bash. Before the agent is allowed to
# `git push` or `gh pr create` a change that touches compilable source, this proves that
# `/code-review` AND `/simplify` were actually run against the EXACT commit being pushed —
# not the agent's recollection that it did them. A missing receipt blocks the push and
# tells the agent to run the reviews.
#
# Why a gate and not a reminder: a written instruction to "run code-review before pushing"
# is the same class of thing the agent forgets. The only reliable enforcement is mechanical.
#
# Maturity: STABLE machinery, but POLICY-COUPLED. It assumes the project's review workflow
# is the two commands /code-review and /simplify and that receipts are written by
# save-review-receipt.ps1. Change RAILS_REVIEW_KINDS if your project gates on different
# review steps.
#
# Env knobs (see kit/hooks/README.md):
#   RAILS_REVIEW_BASE      — base ref to diff the branch against. Default: tries
#                            origin/main, then main. Set to e.g. origin/develop to override.
#   RAILS_REVIEW_SRC_REGEX — regex over changed paths that decides what counts as
#                            "compilable source" worth gating. Default targets a .NET/web tree.
#   RAILS_REVIEW_KINDS      — comma-separated review kinds that must have receipts.
#                            Default: code-review,simplify.
#   RAILS_SKIP_REVIEW_GATE  — set to 1 for a documented, auditable emergency bypass.
#
# Scope decisions (deliberate):
#   * Only gates pushes/PRs whose branch diff vs the base touches source matching the regex.
#     Docs-, memory-, and config-only pushes pass without receipts.
#   * Receipts are bound to the current HEAD short-SHA, so a review of older code does not
#     satisfy a later commit. The working tree must be clean under src/ so HEAD is what
#     actually gets pushed.
#   * Skill-agnostic: it checks for review RECEIPTS, not for a specific tool.
#   * Fails OPEN (allows) only when it genuinely cannot compute the diff, and fails CLOSED
#     (blocks) whenever it can prove review evidence is missing.
#
# COVERAGE BOUNDARY: a Claude Code hook only fires for actions taken THROUGH Claude Code.
# A human running `git push` in their own terminal is NOT gated; the server-side equivalent
# is a required CI check. This gate stops the agent from skipping review, not every push.
#
# CONTRACT (verified): PreToolUse blocks via JSON
#   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
#    "permissionDecisionReason":"..."}}  on stdout, then exit 0. (hookSpecificOutput IS
#   valid for PreToolUse, unlike Stop hooks.) Allow = emit nothing and exit 0.

$ErrorActionPreference = 'Stop'
# Read native command exit codes explicitly so a non-zero git call never throws before we
# can decide — this gate must fail closed on "evidence missing", open on "can't tell".
$PSNativeCommandUseErrorActionPreference = $false

function Allow { exit 0 }
function Deny([string]$reason) {
  @{
    hookSpecificOutput = @{
      hookEventName            = 'PreToolUse'
      permissionDecision       = 'deny'
      permissionDecisionReason = $reason
    }
  } | ConvertTo-Json -Compress -Depth 5
  exit 0
}

# --- Read the PreToolUse payload from stdin.
$raw = [Console]::In.ReadToEnd()
$payload = $null
if ($raw) { try { $payload = $raw | ConvertFrom-Json } catch { } }
if (-not $payload) { Allow }

# --- Only gate Bash commands that actually INVOKE git push / gh pr create. Match the
#     start of each shell segment (split on ; && || | &) so the words appearing inside a
#     quoted string, an echo, or `--help` text don't trip the gate. `git -C <path> push`
#     is recognized.
if ($payload.tool_name -ne 'Bash') { Allow }
$cmd = [string]$payload.tool_input.command
if (-not $cmd) { Allow }

# --- Download-and-execute guard. Piping a downloader straight into a shell cannot be
#     expressed as a settings.json permission pattern (no mid-command wildcards), so the
#     policy is enforced here: same pipeline stage = downloader, then a pipe, then a shell.
$pipeToShellRe = '(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)[^|;&]*\|\s*(sudo\s+)?((ba|z|da)?sh|pwsh|powershell|iex|Invoke-Expression)(\s|$)'
if ($cmd -match $pipeToShellRe) {
  Deny("Blocked: piping a download straight into a shell (curl|sh and friends) is denied by " +
       "policy. Download to a file, inspect it, then execute it as a separate, reviewable step.")
}

$gates = $false
foreach ($seg in ($cmd -split '\|\||&&|[;|&]')) {
  $s = $seg.Trim()
  if ($s -match '^git\s+(-C\s+\S+\s+)?push(\s|$)' -or $s -match '^gh\s+pr\s+create(\s|$)') {
    $gates = $true; break
  }
}
if (-not $gates) { Allow }

# --- Documented escape hatch.
if ($env:RAILS_SKIP_REVIEW_GATE -eq '1') {
  [Console]::Error.WriteLine('review-gate: RAILS_SKIP_REVIEW_GATE=1 set; skipping review gate.')
  Allow
}

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (Get-Location).Path }
Set-Location $projectDir

# --- Tooling guard: don't trap the agent if git isn't available.
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  [Console]::Error.WriteLine('review-gate: git not found; skipping review gate.')
  Allow
}

# --- Resolve the base to diff against. Honor RAILS_REVIEW_BASE, else origin/main, then main.
#     If none resolve (unusual), fall back to the last commit so we can still scope on src/.
$base = $null
$candidates = @()
if ($env:RAILS_REVIEW_BASE) { $candidates += $env:RAILS_REVIEW_BASE }
$candidates += @('origin/main', 'main')
foreach ($ref in $candidates) {
  $resolved = & git rev-parse --verify --quiet "$ref" 2>$null
  if ($LASTEXITCODE -eq 0 -and $resolved) { $base = $ref; break }
}

if ($base) {
  $changed = & git diff --name-only "$base...HEAD" 2>$null
} else {
  $changed = & git show --name-only --pretty=format: HEAD 2>$null
}

# Can't compute a diff at all — fail open rather than wedge the session.
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine('review-gate: could not compute branch diff; skipping.')
  Allow
}

# --- Scope: only compilable source triggers the gate.
$srcRegex = $env:RAILS_REVIEW_SRC_REGEX
if (-not $srcRegex) { $srcRegex = '^src/.*\.(cs|csproj|slnx|sln|props|targets|razor|cshtml|ts|html)$' }
$srcChanged = $changed | Where-Object { $_ -match $srcRegex }
if (-not $srcChanged) { Allow }

# --- The committed code under review must equal what gets pushed.
$dirtySrc = & git status --porcelain -- 'src' 2>$null
if ($dirtySrc) {
  Deny("Review gate: you have uncommitted changes under src/. Commit them first so the " +
       "review covers exactly what you push, then run /code-review and /simplify on the final commit.")
}

# --- Require a receipt for each review kind, bound to the exact commit being pushed.
$sha = (& git rev-parse --short HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $sha) { Allow }   # detached/unborn — can't bind; don't wedge.
$sha = $sha.Trim()

$kindsRaw = $env:RAILS_REVIEW_KINDS
if (-not $kindsRaw) { $kindsRaw = 'code-review,simplify' }
$kinds = $kindsRaw -split '[,\s]+' | Where-Object { $_ }

$receiptDir = Join-Path $projectDir '.claude/.review-receipts'
$missing = @()
foreach ($kind in $kinds) {
  if (-not (Test-Path (Join-Path $receiptDir "$sha.$kind"))) { $missing += "/$kind" }
}

if ($missing.Count -gt 0) {
  Deny("Review gate: src/ changed but [$($missing -join ', ')] " +
       "$(if ($missing.Count -eq 1) {'has'} else {'have'}) not been run against commit $sha. " +
       "Run the missing review(s), then record each by piping its summary to " +
       ".claude/hooks/save-review-receipt.ps1 (e.g. `'...summary...' | pwsh -NoProfile -File " +
       ".claude/hooks/save-review-receipt.ps1 -Kind code-review`). Re-run after re-committing any " +
       "fixes the reviews produce. Emergency bypass: set RAILS_SKIP_REVIEW_GATE=1.")
}

Allow
