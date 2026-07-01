#!/usr/bin/env pwsh
#
# stop-gate.ps1 — the "Stop gate": mechanical self-validation before a turn ends.
#
# Fires on the Claude Code `Stop` event. Before the agent is allowed to end its
# turn, this proves the build is green from the environment itself — not the
# agent's opinion that it is. A red build blocks the stop and hands the failure
# back to the agent to fix.
#
# Maturity: STABLE. The Claude Code `Stop` hook event and its block contract are
# documented and unlikely to churn. This script depends only on git + dotnet on PATH.
#
# Env knobs (documented in kit/hooks/README.md):
#   RAILS_SRC_GLOB        — newline/space/comma-separated list of git pathspecs that
#                           count as "compilable source". Default targets a .NET tree.
#                           A dirty match here is what arms the build gate.
#   RAILS_SOLUTION        — explicit path to the solution/project to build. If unset,
#                           the first *.slnx / *.sln found under the project root is used.
#                           If nothing is found, the gate allows (nothing to build).
#   RAILS_STOP_RUN_TESTS  — set to 1 to also run the test suite after a green build.
#
# Scope decisions (deliberate):
#   * Build only by default. A full test run on every Stop costs minutes per turn.
#   * Only fires when there are uncommitted changes matching RAILS_SRC_GLOB. Doc-only
#     or planning turns don't pay for a build.
#   * Honors `stop_hook_active` to avoid an infinite stop->block->stop loop.
#   * Never wedges the session on missing tooling: if dotnet is absent it warns and
#     allows the stop rather than trapping the agent.
#
# CONTRACT (verified, do not change):
#   * Block: write top-level JSON {"decision":"block","reason":"..."} to stdout AND
#     `exit 2`. `exit 1` is silently IGNORED by Claude Code. `hookSpecificOutput` is
#     INVALID on Stop hooks and silently drops the block — never use it here.
#   * Allow: emit nothing and `exit 0`.
#   * `reason` is the ONLY text surfaced back to the model — make it actionable.

$ErrorActionPreference = 'Stop'

# Do NOT let a native command's non-zero exit throw a terminating error: when
# $PSNativeCommandUseErrorActionPreference is $true (a PowerShell 7.4 default on some
# hosts), `dotnet build` on a red build would throw before we read its exit code, the
# script would die with no decision JSON, and Claude Code would treat the non-2 exit as
# non-blocking — letting the agent finish on a broken build. We read $LASTEXITCODE
# explicitly instead, so this gate fails CLOSED, not open.
$PSNativeCommandUseErrorActionPreference = $false

function Allow { exit 0 }
function Block([string]$reason) {
  @{ decision = 'block'; reason = $reason } | ConvertTo-Json -Compress
  exit 2
}

# --- Read the Stop event payload from stdin.
$raw = [Console]::In.ReadToEnd()
$payload = $null
if ($raw) { try { $payload = $raw | ConvertFrom-Json } catch { } }

# Already inside a stop-hook loop — never block again, or the agent can never finish.
if ($payload -and $payload.stop_hook_active) { Allow }

$projectDir = $env:CLAUDE_PROJECT_DIR
if (-not $projectDir) { $projectDir = (Get-Location).Path }
Set-Location $projectDir

# --- Only gate when COMPILABLE source changed this session. Doc/json/asset edits
#     shouldn't trigger a full solution build every turn.
$globRaw = $env:RAILS_SRC_GLOB
if (-not $globRaw) {
  $globRaw = "src/**/*.cs src/**/*.csproj src/**/*.slnx src/**/*.sln src/**/*.props src/**/*.targets src/**/*.razor src/**/*.cshtml"
}
# git status pathspecs use the glob without the leading directory anchoring; pass each token.
$pathspecs = $globRaw -split '[,\s]+' | Where-Object { $_ }
$dirtySrc = & git status --porcelain -- @pathspecs 2>$null
if (-not $dirtySrc) { Allow }

# --- Resolve what to build.
$solution = $env:RAILS_SOLUTION
if ($solution -and -not [System.IO.Path]::IsPathRooted($solution)) {
  $solution = Join-Path $projectDir $solution
}
if (-not $solution -or -not (Test-Path $solution)) {
  $solution = Get-ChildItem -Path $projectDir -Recurse -Include '*.slnx', '*.sln' -ErrorAction SilentlyContinue |
              Select-Object -First 1 -ExpandProperty FullName
}
if (-not $solution) { Allow }   # nothing buildable here

# --- Tooling guard: don't trap the agent if dotnet isn't installed.
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  [Console]::Error.WriteLine('stop-gate: dotnet not found; skipping build gate.')
  Allow
}

# --- Prove the build.
$buildOut = & dotnet build $solution --nologo --configuration Debug -clp:ErrorsOnly 2>&1
$buildExit = $LASTEXITCODE
if ($buildExit -ne 0) {
  $errLines = ($buildOut | Select-String -Pattern 'error' | Select-Object -First 15) -join "`n"
  Block("Build is red — you cannot finish on a broken build (Stop gate). " +
        "Fix the build before ending the turn. First errors:`n$errLines")
}

# --- Optionally prove the tests.
if ($env:RAILS_STOP_RUN_TESTS -eq '1') {
  $testOut = & dotnet test $solution --nologo --no-build --configuration Debug 2>&1
  if ($LASTEXITCODE -ne 0) {
    $failLines = ($testOut | Select-String -Pattern 'Failed|error' | Select-Object -First 15) -join "`n"
    Block("Tests are red — you cannot finish with failing tests (Stop gate). " +
          "Fix them before ending the turn. Summary:`n$failLines")
  }
}

Allow
