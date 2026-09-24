// Locates claude, uv, git, gh, and the claude-code-sdlc plugin's scripts/ directory on the
// local machine. Spec 0008's Decision List: "detect them, and if either is missing, say so
// with a link rather than installing anything" — auto-detect, VERIFY with a real invocation
// (never trust a found path without running it), and only ask the person to point at the
// right thing when detection or verification fails. Settings then remembers whatever the
// person confirmed, so this only runs again if that override stops working.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ToolStatus, ToolingReport } from '../../shared/types'

export type { ToolStatus, ToolingReport }

const execFileAsync = promisify(execFile)

/** How to actually invoke a resolved binary — usually just the binary itself, but on
 * Windows a .cmd/.bat wrapper (common for the GitHub CLI, and some package-manager
 * installs of git) can't be launched directly by a shell-less spawn, so it's invoked
 * through cmd.exe /c instead. Both fields stay structured argv, never a shell string —
 * commandRunner.runCommand never uses shell:true, and this keeps it that way. */
export interface ResolvedBinary {
  command: string
  prefixArgs: string[]
}

async function verifyDirect(command: string, versionFlag = '--version'): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, [versionFlag], { timeout: 5000, windowsHide: true })
    return stdout.trim().split('\n')[0]
  } catch {
    return null
  }
}

/** Resolves the real, fully-qualified path of `command` via `where` (Windows) or `which`
 * (macOS/Linux) — both real executables, never a shell builtin, so this never needs
 * shell:true either. Returns null if the command isn't on PATH at all. */
async function resolveOnPath(command: string): Promise<string | null> {
  const finder = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(finder, [command], { timeout: 5000, windowsHide: true })
    const first = stdout.trim().split('\n')[0]?.trim()
    return first || null
  } catch {
    return null
  }
}

/** Verifies `command` by actually running it, trying a direct invocation first (the common
 * case — a real .exe/binary on PATH) and falling back to resolving its real path and, on
 * Windows, routing a .cmd/.bat wrapper through cmd.exe /c. Returns both the version string
 * and the ResolvedBinary later calls must use — a direct-exec success and a shimmed success
 * are invoked differently, and a caller needs to know which. */
async function verifyBinary(
  command: string,
  versionFlag = '--version',
): Promise<{ version: string; resolved: ResolvedBinary } | { error: string }> {
  const direct = await verifyDirect(command, versionFlag)
  if (direct !== null) {
    return { version: direct, resolved: { command, prefixArgs: [] } }
  }

  const resolvedPath = await resolveOnPath(command)
  if (resolvedPath === null) {
    return { error: `'${command}' was not found on PATH` }
  }

  const isWindowsScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedPath)
  const resolved: ResolvedBinary = isWindowsScript
    ? { command: 'cmd.exe', prefixArgs: ['/c', resolvedPath] }
    : { command: resolvedPath, prefixArgs: [] }

  try {
    const { stdout } = await execFileAsync(
      resolved.command, [...resolved.prefixArgs, versionFlag], { timeout: 5000, windowsHide: true },
    )
    return { version: stdout.trim().split('\n')[0], resolved }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

async function detect(overridePath: string | undefined, command: string): Promise<ToolStatus & { resolved?: ResolvedBinary }> {
  const result = await verifyBinary(overridePath ?? command)
  if ('error' in result) {
    return { found: false, error: result.error }
  }
  return { found: true, path: overridePath ?? command, version: result.version, resolved: result.resolved }
}

/** claude and uv are both just PATH lookups — verified by actually running them, never
 * trusted from `which`/`where` alone (a stale PATH entry can point at nothing executable). */
export async function detectClaude(overridePath?: string): Promise<ToolStatus> {
  const { resolved: _resolved, ...status } = await detect(overridePath, 'claude')
  return status
}

export async function detectUv(overridePath?: string): Promise<ToolStatus> {
  const { resolved: _resolved, ...status } = await detect(overridePath, 'uv')
  return status
}

/** git and gh additionally need the resolved invocation strategy (see ResolvedBinary) handed
 * to git.ts, since a Windows .cmd shim changes how every LATER call must be spawned too, not
 * just this detection probe. */
export async function detectGit(overridePath?: string): Promise<ToolStatus & { resolved?: ResolvedBinary }> {
  return detect(overridePath, 'git')
}

export async function detectGh(overridePath?: string): Promise<ToolStatus & { resolved?: ResolvedBinary }> {
  return detect(overridePath, 'gh')
}

/** A directory name that looks like a semver version — used to pick the newest installed
 * plugin version when more than one is present. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** The plugin installs to ~/.claude/plugins/cache/<namespace>/claude-code-sdlc/<version>/
 * (verified against a real local install) — search every namespace, take the newest
 * version that actually has scripts/generate_status.py, the file this app depends on
 * existing. A person who checked the plugin out from git manually (not via the plugin
 * marketplace) won't be found this way; that's exactly the override-path fallback case. */
export async function detectPluginScripts(overridePath?: string): Promise<ToolStatus> {
  if (overridePath) {
    const marker = join(overridePath, 'generate_status.py')
    return existsSync(marker)
      ? { found: true, path: overridePath }
      : { found: false, error: `generate_status.py not found under ${overridePath}` }
  }

  const cacheDir = join(homedir(), '.claude', 'plugins', 'cache')
  if (!existsSync(cacheDir)) {
    return { found: false, error: `Plugin cache directory not found: ${cacheDir}` }
  }

  const candidates: string[] = []
  try {
    const namespaces = await readdir(cacheDir, { withFileTypes: true })
    for (const ns of namespaces) {
      if (!ns.isDirectory()) continue
      const pluginDir = join(cacheDir, ns.name, 'claude-code-sdlc')
      if (!existsSync(pluginDir)) continue
      const versions = await readdir(pluginDir, { withFileTypes: true })
      for (const v of versions) {
        if (v.isDirectory()) candidates.push(join(pluginDir, v.name))
      }
    }
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : String(err) }
  }

  const withScripts = candidates
    .map((dir) => ({ dir, scripts: join(dir, 'scripts') }))
    .filter(({ scripts }) => existsSync(join(scripts, 'generate_status.py')))

  if (withScripts.length === 0) {
    return { found: false, error: 'claude-code-sdlc plugin not found under ~/.claude/plugins/cache' }
  }

  withScripts.sort((a, b) => compareVersions(b.dir.split(/[\\/]/).pop()!, a.dir.split(/[\\/]/).pop()!))
  return { found: true, path: withScripts[0].scripts }
}

export interface DetectAllToolingResult extends ToolingReport {
  /** Only set when found — the resolved invocation strategy git.ts needs to actually run
   * git/gh commands, not just detect them. */
  gitResolved?: ResolvedBinary
  ghResolved?: ResolvedBinary
}

export async function detectAllTooling(overrides: {
  claudePath?: string
  uvPath?: string
  pluginScriptsPath?: string
  gitPath?: string
  ghPath?: string
}): Promise<DetectAllToolingResult> {
  const [claude, uv, pluginScripts, gitDetect, ghDetect] = await Promise.all([
    detectClaude(overrides.claudePath),
    detectUv(overrides.uvPath),
    detectPluginScripts(overrides.pluginScriptsPath),
    detectGit(overrides.gitPath),
    detectGh(overrides.ghPath),
  ])
  const { resolved: gitResolved, ...git } = gitDetect
  const { resolved: ghResolved, ...gh } = ghDetect
  return { claude, uv, pluginScripts, git, gh, gitResolved, ghResolved }
}
