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
    Write-Output "[SDLC] Commands: /sdlc (guidance) | /sdlc-status (dashboard) | /sdlc-gate (check) | /sdlc-next (advance) | /sdlc-coach (coaching)"

    # --- Tier 1: Foundation Context ---
    $constitutionPath = Join-Path $sdlcDir "constitution.md"
    if (Test-Path $constitutionPath) {
        $constitutionContent = Get-Content $constitutionPath -Raw -ErrorAction SilentlyContinue
        if ($constitutionContent) {
            # Extract mission/principles (first ~375 words for ~500 token budget)
            $words = ($constitutionContent -split '\s+') | Select-Object -First 375
            $foundation = ($words -join ' ')
            Write-Output "[SDLC-CONTEXT:FOUNDATION] $foundation"
        }
    }

    # --- Tier 2: Frozen Layers (most recent 3) ---
    $layersDir = Join-Path $sdlcDir "context" "layers"
    if (Test-Path $layersDir) {
        $layers = Get-ChildItem $layersDir -Filter "phase*.md" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 3
        if ($layers) {
            # Reverse to load oldest first (chronological order)
            [array]::Reverse($layers)
            Write-Output "[SDLC-CONTEXT:LAYERS] Loading $($layers.Count) frozen layer(s)"
            foreach ($layer in $layers) {
                $layerContent = Get-Content $layer.FullName -Raw -ErrorAction SilentlyContinue
                if ($layerContent) {
                    Write-Output "[SDLC-CONTEXT:LAYER:$($layer.BaseName)]"
                    Write-Output $layerContent
                    Write-Output "[/SDLC-CONTEXT:LAYER]"
                }
            }
        }
    }

    # --- Session Health Check (opt-in, Phase 4+) ---
    # Reads profile.yaml for session_health_check config, runs a smoke test
    # before the agent starts new work. Catches broken builds early.
    $profileFile = Join-Path $sdlcDir "profile.yaml"
    if (Test-Path $profileFile) {
        $profileContent = Get-Content $profileFile -Raw -ErrorAction SilentlyContinue
        $healthEnabled = [regex]::Match($profileContent, 'session_health_check:[\s\S]*?enabled:\s*(true|false)')
        $healthCommand = [regex]::Match($profileContent, 'session_health_check:[\s\S]*?command:\s*"([^"]+)"')
        $healthTimeout = [regex]::Match($profileContent, 'session_health_check:[\s\S]*?timeout_seconds:\s*(\d+)')
        $healthMinPhase = [regex]::Match($profileContent, 'session_health_check:[\s\S]*?min_phase:\s*(\d+)')

        $isEnabled = $healthEnabled.Success -and $healthEnabled.Groups[1].Value -eq "true"
        $minPhase = if ($healthMinPhase.Success) { [int]$healthMinPhase.Groups[1].Value } else { 4 }

        if ($isEnabled -and [int]$phaseId -ge $minPhase -and $healthCommand.Success) {
            $cmd = $healthCommand.Groups[1].Value
            $timeout = if ($healthTimeout.Success) { [int]$healthTimeout.Groups[1].Value } else { 60 }

            Write-Output "[SDLC-HEALTH] Running session health check: $cmd (timeout: ${timeout}s)"
            try {
                $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -WorkingDirectory $PWD -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sdlc-health-out.txt" -RedirectStandardError "$env:TEMP\sdlc-health-err.txt"
                $exited = $process.WaitForExit($timeout * 1000)

                if (-not $exited) {
                    $process.Kill()
                    Write-Output "[SDLC-HEALTH] TIMEOUT — health check exceeded ${timeout}s. The build may be hanging. Investigate before starting new work."
                } elseif ($process.ExitCode -ne 0) {
                    $errOutput = Get-Content "$env:TEMP\sdlc-health-err.txt" -Raw -ErrorAction SilentlyContinue
                    $lastLines = if ($errOutput) { ($errOutput -split "`n" | Select-Object -Last 5) -join "`n" } else { "(no stderr)" }
                    Write-Output "[SDLC-HEALTH] FAIL (exit code $($process.ExitCode)) — the project does not build cleanly. Fix this BEFORE starting new work."
                    Write-Output "[SDLC-HEALTH] Last error output:`n$lastLines"
                } else {
                    Write-Output "[SDLC-HEALTH] PASS — project builds cleanly."
                }
            } catch {
                Write-Output "[SDLC-HEALTH] ERROR — could not run health check: $($_.Exception.Message)"
            } finally {
                Remove-Item "$env:TEMP\sdlc-health-out.txt" -ErrorAction SilentlyContinue
                Remove-Item "$env:TEMP\sdlc-health-err.txt" -ErrorAction SilentlyContinue
            }
        }
    }

    # Check for session handoff file (Phase 4 continuity)
    if ([int]$phaseId -eq 4) {
        $handoffFile = Join-Path $sdlcDir "artifacts" "04-implementation" "session-handoff.json"
        if (Test-Path $handoffFile) {
            try {
                $handoff = Get-Content $handoffFile -Raw | ConvertFrom-Json
            } catch {
                Write-Output "[SDLC] WARNING: session-handoff.json is malformed - skipping handoff summary"
                $handoff = $null
            }
            if ($handoff) {
                $sections = @($handoff.sections)
                $completedCount = @($sections | Where-Object { $_.status -eq "complete" }).Count
                $totalCount = $sections.Count
                $inProgress = @($sections | Where-Object { $_.status -eq "in_progress" }).Count
                $blocked = @($sections | Where-Object { $_.status -eq "blocked" }).Count

                Write-Output "[SDLC] Session Handoff: $completedCount/$totalCount sections complete, $inProgress in progress, $blocked blocked (session #$($handoff.session_number))"
                if ($handoff.context_for_next_session) {
                    Write-Output "[SDLC] Context: $($handoff.context_for_next_session)"
                }
                if ($handoff.next_actions -and @($handoff.next_actions).Count -gt 0) {
                    $firstAction = @($handoff.next_actions)[0]
                    if ($firstAction.action) {
                        Write-Output "[SDLC] Next action: $($firstAction.action) ($($firstAction.section))"
                    }
                }
                if ($handoff.blockers -and @($handoff.blockers).Count -gt 0) {
                    $activeBlockers = @($handoff.blockers | Where-Object { -not $_.resolved }).Count
                    if ($activeBlockers -gt 0) {
                        Write-Output "[SDLC] WARNING: $activeBlockers active blocker(s)"
                    }
                }
            }
        }
    }
}
