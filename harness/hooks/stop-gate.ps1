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
#   RAILS_STOP_RUN_TESTS  — tests run by DEFAULT after a green build; set to 0 to
#                           opt out (e.g. a suite too slow for a per-turn gate).
#
# Scope decisions (deliberate):
#   * Build AND tests by default — "green" means the tests pass, not just the compile.
#     A suite too slow for a per-turn gate opts out with RAILS_STOP_RUN_TESTS=0
#     (a recorded choice, not a silent default).
#   * Only fires when there are uncommitted changes matching RAILS_SRC_GLOB. Doc-only
#     or planning turns don't pay for a build.
#   * Honors `stop_hook_active` to avoid an infinite stop->block->stop loop.
#   * Never wedges the session on missing tooling: if dotnet is absent it warns and
#     allows the stop rather than trapping the agent.
#
# CONTRACT (verified against https://code.claude.com/docs/en/hooks, 2026-07-15):
#   * Block: write top-level JSON {"decision":"block","reason":"..."} to stdout and
#     `exit 0`. JSON output is only parsed on exit 0; `reason` is fed back to the agent.
#     (`exit 2` also blocks, but then stdout is IGNORED and only stderr is surfaced —
#     a stdout JSON reason would be silently dropped. `exit 1` is a non-blocking error.)
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
  exit 0
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

# --- Bounded invocation: mirror the sh twin's `timeout 540`. A hung build must
#     BLOCK (fail closed), not run into the hook-level 600s kill — which Claude
#     Code treats as a non-blocking error, i.e. fails OPEN.
$script:GateTimeoutSeconds = 540
function Invoke-Bounded([string[]]$argv) {
  # Returns @{ TimedOut = bool; ExitCode = int; Output = string[] }.
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $argv[0]
  foreach ($a in $argv[1..($argv.Count - 1)]) { [void]$psi.ArgumentList.Add($a) }
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.WorkingDirectory = (Get-Location).Path
  $proc = [System.Diagnostics.Process]::Start($psi)
  # Async reads so a chatty child can't fill the pipe and deadlock WaitForExit.
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  if (-not $proc.WaitForExit($script:GateTimeoutSeconds * 1000)) {
    try { $proc.Kill($true) } catch { try { $proc.Kill() } catch { } }
    return @{ TimedOut = $true; ExitCode = -1; Output = @() }
  }
  $lines = (($outTask.Result + "`n" + $errTask.Result) -split "`r?`n") | Where-Object { $_ }
  return @{ TimedOut = $false; ExitCode = $proc.ExitCode; Output = @($lines) }
}

# --- Prove the build.
$build = Invoke-Bounded @('dotnet', 'build', $solution, '--nologo', '--configuration', 'Debug', '-clp:ErrorsOnly')
if ($build.TimedOut) {
  Block("Build timed out after ${script:GateTimeoutSeconds}s — a hung build counts as red (Stop gate). " +
        "Investigate why the build hangs (or set RAILS_SOLUTION to a smaller target) before ending the turn.")
}
if ($build.ExitCode -ne 0) {
  $errLines = ($build.Output | Select-String -Pattern 'error' | Select-Object -First 15) -join "`n"
  Block("Build is red — you cannot finish on a broken build (Stop gate). " +
        "Fix the build before ending the turn. First errors:`n$errLines")
}

# --- Prove the tests (default ON; RAILS_STOP_RUN_TESTS=0 opts out).
if ($env:RAILS_STOP_RUN_TESTS -ne '0') {
  $test = Invoke-Bounded @('dotnet', 'test', $solution, '--nologo', '--no-build', '--configuration', 'Debug')
  if ($test.TimedOut) {
    Block("Tests timed out after ${script:GateTimeoutSeconds}s — a hung test run counts as red (Stop gate). " +
          "Investigate the hang before ending the turn.")
  }
  if ($test.ExitCode -ne 0) {
    $failLines = ($test.Output | Select-String -Pattern 'Failed|error' | Select-Object -First 15) -join "`n"
    Block("Tests are red — you cannot finish with failing tests (Stop gate). " +
          "Fix them before ending the turn. Summary:`n$failLines")
  }
}

Allow
