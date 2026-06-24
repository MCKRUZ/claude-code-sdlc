# sdlc-phase-inject.ps1
# Hook: PreToolUse — Inject phase-aware context when editing files
# Provides gentle reminders about the current phase and relevant conventions

param(
    [string]$ToolName,
    [string]$FilePath
)

$sdlcDir = Join-Path $PWD ".sdlc"
$stateFile = Join-Path $sdlcDir "state.yaml"

if (-not (Test-Path $stateFile)) {
    exit 0
}

# Only inject on file editing operations
$editTools = @("Edit", "Write", "MultiEdit")
if ($ToolName -notin $editTools) {
    exit 0
}

# Read current phase (ids may be non-numeric: build, close)
$content = Get-Content $stateFile -Raw
$phaseMatch = [regex]::Match($content, 'current_phase:\s*"?([^"\r\n]+)"?')

if (-not $phaseMatch.Success) {
    exit 0
}

$phaseId = $phaseMatch.Groups[1].Value.Trim()

# Phase-specific reminders (keyed by string phase id; 4/5/6 are replaced by the build loop)
$reminders = @{
    "0"     = "[SDLC Phase 0: Discovery] Focus on understanding the problem, not writing code."
    "1"     = "[SDLC Phase 1: Requirements] Ensure changes trace back to documented requirements."
    "2"     = "[SDLC Phase 2: Design] Document architectural decisions as ADRs."
    "3"     = "[SDLC Phase 3: Foundation] Build the factory (harness, rails, dev infra) and a thin walking skeleton."
    "build" = "[SDLC Build Loop] One spec at a time: Intent -> Delegate -> Discern. Check per change, never in a batch. The author never approves their own work."
    "7"     = "[SDLC Phase 7: Documentation] Prove docs by cold use. Finalize ADRs."
    "8"     = "[SDLC Phase 8: Deployment] Promote the proven artifact. Document rollback plan."
    "9"     = "[SDLC Phase 9: Monitoring] Configure alerts from measured baselines. Run the drill."
    "close" = "[SDLC Phase C: Close & Transfer] Prove the client can run it without us. Audit the harness, revoke access, harvest."
}

$reminder = $reminders[$phaseId]
if ($reminder) {
    Write-Output $reminder
}

# Read profile for convention reminders
$profileFile = Join-Path $sdlcDir "profile.yaml"
if (Test-Path $profileFile) {
    $profileContent = Get-Content $profileFile -Raw

    # Check for immutability convention
    if ($profileContent -match 'immutability:\s*true') {
        Write-Output "[Convention] Use immutable patterns (records, with-expressions, spread operators)."
    }

    # Check for no_console_log
    if ($profileContent -match 'no_console_log:\s*true') {
        Write-Output "[Convention] No console.log in production code."
    }
}
