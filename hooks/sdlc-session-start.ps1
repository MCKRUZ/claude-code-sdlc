# sdlc-session-start.ps1
# Hook: Runs at session start to load SDLC context
# Reads .sdlc/state.yaml and outputs current phase context

param()

$sdlcDir = Join-Path $PWD ".sdlc"
$stateFile = Join-Path $sdlcDir "state.yaml"

if (-not (Test-Path $stateFile)) {
    # No SDLC state — silently exit (project may not use SDLC)
    exit 0
}

# Read state.yaml (basic YAML parsing for key fields)
$content = Get-Content $stateFile -Raw

# Extract current phase
$phaseMatch = [regex]::Match($content, 'current_phase:\s*(\d+)')
$phaseNameMatch = [regex]::Match($content, 'phase_name:\s*"?([^"\r\n]+)"?')
$profileMatch = [regex]::Match($content, 'profile_id:\s*"?([^"\r\n]+)"?')
$projectMatch = [regex]::Match($content, 'project_name:\s*"?([^"\r\n]+)"?')

if ($phaseMatch.Success) {
    $phaseId = $phaseMatch.Groups[1].Value
    $phaseName = if ($phaseNameMatch.Success) { $phaseNameMatch.Groups[1].Value } else { "unknown" }
    $profileId = if ($profileMatch.Success) { $profileMatch.Groups[1].Value } else { "unknown" }
    $projectName = if ($projectMatch.Success) { $projectMatch.Groups[1].Value } else { "unknown" }

    $phaseNames = @{
        "0" = "Discovery"
        "1" = "Requirements"
        "2" = "Design"
        "3" = "Planning"
        "4" = "Implementation"
        "5" = "Quality"
        "6" = "Testing"
        "7" = "Documentation"
        "8" = "Deployment"
        "9" = "Monitoring"
    }

    $displayName = $phaseNames[$phaseId]
    if (-not $displayName) { $displayName = $phaseName }

    # Count artifacts in current phase directory
    $artifactDir = Join-Path $sdlcDir "artifacts" ("{0:D2}-{1}" -f [int]$phaseId, $phaseName)
    $artifactCount = 0
    if (Test-Path $artifactDir) {
        $artifactCount = (Get-ChildItem $artifactDir -File -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
    }

    # Output context for Claude
    Write-Output "[SDLC] Project: $projectName | Profile: $profileId | Phase $phaseId`: $displayName | Artifacts: $artifactCount"
    Write-Output "[SDLC] Commands: /sdlc (guidance) | /sdlc-status (dashboard) | /sdlc-gate (check) | /sdlc-next (advance)"
}
