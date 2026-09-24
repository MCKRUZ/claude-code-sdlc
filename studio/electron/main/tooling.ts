// Locates claude, uv, and the claude-code-sdlc plugin's scripts/ directory on the local
// machine. Spec 0008's Decision List: "detect them, and if either is missing, say so with
// a link rather than installing anything" — auto-detect, VERIFY with a real invocation
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

async function verifyBinary(command: string, versionFlag = '--version'): Promise<ToolStatus> {
  try {
    const { stdout } = await execFileAsync(command, [versionFlag], { timeout: 5000, windowsHide: true })
    return { found: true, path: command, version: stdout.trim().split('\n')[0] }
  } catch (err) {
    return { found: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** claude and uv are both just PATH lookups — verified by actually running them, never
 * trusted from `which`/`where` alone (a stale PATH entry can point at nothing executable). */
export async function detectClaude(overridePath?: string): Promise<ToolStatus> {
  return verifyBinary(overridePath ?? 'claude')
}

export async function detectUv(overridePath?: string): Promise<ToolStatus> {
  return verifyBinary(overridePath ?? 'uv')
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

export async function detectAllTooling(overrides: {
  claudePath?: string
  uvPath?: string
  pluginScriptsPath?: string
}): Promise<ToolingReport> {
  const [claude, uv, pluginScripts] = await Promise.all([
    detectClaude(overrides.claudePath),
    detectUv(overrides.uvPath),
    detectPluginScripts(overrides.pluginScriptsPath),
  ])
  return { claude, uv, pluginScripts }
}
