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

# Read current phase
$content = Get-Content $stateFile -Raw
$phaseMatch = [regex]::Match($content, 'current_phase:\s*(\d+)')

if (-not $phaseMatch.Success) {
    exit 0
}

$phaseId = [int]$phaseMatch.Groups[1].Value

# Phase-specific reminders
$reminders = @{
    0 = "[SDLC Phase 0: Discovery] Focus on understanding the problem, not writing code."
    1 = "[SDLC Phase 1: Requirements] Ensure changes trace back to documented requirements."
    2 = "[SDLC Phase 2: Design] Document architectural decisions as ADRs."
    3 = "[SDLC Phase 3: Planning] Define section plans before implementing."
    4 = "[SDLC Phase 4: Implementation] Follow section plans. Write tests first (TDD)."
    5 = "[SDLC Phase 5: Quality] Focus on review findings. No new features."
    6 = "[SDLC Phase 6: Testing] Fill coverage gaps. Don't change architecture."
    7 = "[SDLC Phase 7: Documentation] Sync docs with code. Finalize ADRs."
    8 = "[SDLC Phase 8: Deployment] Prepare release. Document rollback plan."
    9 = "[SDLC Phase 9: Monitoring] Configure alerts and dashboards."
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
