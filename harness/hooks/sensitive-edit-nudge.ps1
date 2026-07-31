#Requires -Version 7
<#
    Advisory PreToolUse nudge — the non-blocking counterpart to the gates in this directory.

    Fires when the agent is about to edit a security-sensitive path and reminds it what the
    standard requires there. It never blocks: it emits `additionalContext` with no
    `permissionDecision`, so the tool call proceeds through the normal permission flow and the
    string arrives as a system reminder next to the tool result.

    This one is shipped as a worked example and is deliberately NOT registered in settings.json.
    Copy it, retune the regex and the message for your repo, then register it (see README.md,
    "Advisory nudges").
#>

$ErrorActionPreference = 'Stop'

# Paths the standard treats as security-sensitive. Same trees settings.json gates with `ask`.
$defaultPattern = '(^|/)(Auth|Identity|Security|SecurityAttributes|Migrations)(/|$)|(^|/)infra/'
$pattern = if ($env:RAILS_NUDGE_PATH_REGEX) { $env:RAILS_NUDGE_PATH_REGEX } else { $defaultPattern }

# ASCII only, deliberately: this file is copied into client repos and must emit the same bytes
# under both runtimes. A non-ASCII literal here decodes differently depending on how the host
# reads the script, and the bash twin would stop being faithful.
$defaultMessage = 'Delivery-standard nudge: this path is security-sensitive. Treat the change as risk:high, and run the security-reviewer agent over it before you finish: the security pass precedes the named human sign-off, and `security-review` is a required merge check. Disregard if this edit is only comments, docs, or test fixtures.'
$message = if ($env:RAILS_NUDGE_MESSAGE) { $env:RAILS_NUDGE_MESSAGE } else { $defaultMessage }

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

    $path = ($raw | ConvertFrom-Json).tool_input.file_path
    if ([string]::IsNullOrWhiteSpace($path)) { exit 0 }

    if (($path -replace '\\', '/') -notmatch $pattern) { exit 0 }

    # [ordered] matters: a plain hashtable emits keys in an arbitrary order, so the twins would
    # disagree byte-for-byte from run to run and no test could pin either one down.
    [ordered]@{
        hookSpecificOutput = [ordered]@{
            hookEventName     = 'PreToolUse'
            additionalContext = $message
        }
    } | ConvertTo-Json -Compress -Depth 5
}
catch {
    # Fail open, per this kit's rule: a hook that cannot compute an answer stays silent
    # rather than wedging the session. A missed nudge costs a reminder; a wedged hook costs the turn.
}

exit 0
