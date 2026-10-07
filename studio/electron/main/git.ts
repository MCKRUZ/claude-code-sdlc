// Ports the plugin's own proven git/gh contract (scripts/handoff.py's run_git,
// scripts/github_import.py's run_gh/gh_json) rather than reinventing one — argv arrays
// (never a shell string), explicit cwd, env merged onto the current process's, and a typed
// error carrying stderr-or-stdout. Every call goes through commandRunner.runCommand, so it
// lands in the console with the same redaction spec 0009 requires everywhere else.

import { runCommand, type ConsoleEntry, type RunCommandOptions } from './commandRunner'
import type { ResolvedBinary } from './tooling'

export class GitError extends Error {
  constructor(message: string, public readonly entry: ConsoleEntry) {
    super(message)
    this.name = 'GitError'
  }
}

let gitResolved: ResolvedBinary = { command: 'git', prefixArgs: [] }
let ghResolved: ResolvedBinary = { command: 'gh', prefixArgs: [] }

/** Called once tooling detection has resolved how to actually invoke git/gh (handles the
 * Windows .cmd-shim case some `gh` installs need — see tooling.ts) — every later call uses
 * this resolved strategy instead of the bare command name. */
export function setGitBinary(resolved: ResolvedBinary): void {
  gitResolved = resolved
}

export function setGhBinary(resolved: ResolvedBinary): void {
  ghResolved = resolved
}

/** Runs `git <args>` in `cwd`. Throws GitError on a non-zero exit or a spawn failure,
 * carrying the ConsoleEntry so callers (and the console) still have the full record —
 * matches run_git()'s "non-zero return code becomes a typed error carrying stderr or
 * stdout" contract exactly. */
export async function runGit(args: string[], cwd: string, opts?: RunCommandOptions): Promise<string> {
  const entry = await runCommand(gitResolved.command, [...gitResolved.prefixArgs, ...args], cwd, opts)
  if (!entry.ok) {
    throw new GitError((entry.stderr || entry.stdout).trim() || `git ${args.join(' ')} failed`, entry)
  }
  return entry.stdout
}

/** Same contract as runGit, for `gh`. */
export async function runGh(args: string[], cwd: string): Promise<string> {
  const entry = await runCommand(ghResolved.command, [...ghResolved.prefixArgs, ...args], cwd)
  if (!entry.ok) {
    throw new GitError((entry.stderr || entry.stdout).trim() || `gh ${args.join(' ')} failed`, entry)
  }
  return entry.stdout
}

/** gh_json()'s contract: empty stdout is [], not an error — several `gh ... --json` calls
 * legitimately return nothing (e.g. `pr list` with no matching PR). */
export async function ghJson<T>(args: string[], cwd: string): Promise<T> {
  const out = await runGh(args, cwd)
  if (!out.trim()) return [] as unknown as T
  try {
    return JSON.parse(out) as T
  } catch (err) {
    throw new Error(`gh ${args.join(' ')} returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Does this project have a shared repository (an `origin`) to talk to? Asked with `git remote`, which
 * lists the remotes and succeeds when there are none, rather than by using one and reading the failure:
 * every new project has no `origin` yet, and a command bound to fail shows up as a red error on every
 * screen and in the Console. */
export async function hasOriginRemote(cwd: string): Promise<boolean> {
  try {
    return (await runGit(['remote'], cwd)).split(/\s+/).includes('origin')
  } catch {
    return false
  }
}

/** Is there a fetched copy of `origin/<branch>` here? Asked with `for-each-ref`, which prints
 * nothing and succeeds when the answer is no, so a project with no shared repository does not put
 * a failed command in the Console just to learn that. */
export async function remoteBranchExists(cwd: string, branch: string): Promise<boolean> {
  if (!branch) return false
  try {
    return (await runGit(['for-each-ref', '--format=%(refname)', `refs/remotes/origin/${branch}`], cwd)).trim().length > 0
  } catch {
    return false
  }
}

/** A git call whose failure is an expected, meaningful outcome (e.g. "does this ref exist,"
 * "will this push be accepted") rather than an error — returns the ConsoleEntry either way
 * instead of throwing, so the caller can branch on entry.ok without a try/catch. */
export function runGitTolerant(args: string[], cwd: string, opts?: RunCommandOptions): Promise<ConsoleEntry> {
  return runCommand(gitResolved.command, [...gitResolved.prefixArgs, ...args], cwd, opts)
}
