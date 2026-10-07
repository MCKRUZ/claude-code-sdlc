// The one place Studio spawns the Azure CLI — the twin of git.ts's runGh/ghJson, with the same
// contract (argv arrays, explicit cwd, typed error carrying the ConsoleEntry) plus the az rules
// scripts/ado_transport.py already learned the hard way (docs/proposals/code-host-providers.md
// §4.3; scripts/tests/fixtures/code_host/azure_devops/captured/CAPTURE-NOTES.md):
//
//   * AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no — a missing extension or a typo otherwise triggers
//     an unprompted network install (observed: the extension upgraded itself mid-survey).
//   * AZURE_CORE_COLLECT_TELEMETRY=no — no telemetry fork per call.
//   * --only-show-errors always — preview/upgrade warnings land on stderr even on success.
//   * -o json on every JSON read; empty stdout is [] (az prints NOTHING when nothing matched).
//   * az's DEFAULT ACCOUNT decides the Azure DevOps token; an identity that never opened the
//     organisation in a browser gets HTTP 403 "Identity … has not been materialized". The raw
//     text does not say what to do about it, so the hint is appended here.
//
// Every call still goes through commandRunner.runCommand, so it lands in the console with the
// same redaction everything else gets. git.ts is untouched: gh keeps its own seam.

import { runCommand, type ConsoleEntry, type RunCommandOptions } from './commandRunner'
import type { ResolvedBinary } from './tooling'

export const AZ_ENV: Readonly<Record<string, string>> = {
  AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no',
  AZURE_CORE_COLLECT_TELEMETRY: 'no',
}

export const EXTENSION_HINT = 'run `az extension add --name azure-devops`'
export const MATERIALIZED_HINT = 'the signed-in identity has never opened this organisation in a browser: sign in to it '
  + 'interactively once with the account az is using (az\'s default account decides the token; a guest in the '
  + 'organisation\'s tenant needs `az login --allow-no-subscriptions --tenant <tenant id>`)'

export type AzFailure = 'not_installed' | 'extension_missing' | 'signed_out' | 'exit' | 'timeout'

export class AzError extends Error {
  constructor(message: string, public readonly failure: AzFailure, public readonly entry: ConsoleEntry) {
    super(message)
    this.name = 'AzError'
  }
}

let azResolved: ResolvedBinary = { command: 'az', prefixArgs: [] }

/** Called once tooling detection has resolved how to invoke az — on Windows the install is an
 * `az.cmd` shim that a shell-less spawn cannot start directly, so it runs via cmd.exe /c (the
 * same ResolvedBinary path gh already uses; tooling.ts owns the resolution). */
export function setAzBinary(resolved: ResolvedBinary): void {
  azResolved = resolved
}

/** The full argv `runAz` will spawn for `args` — exported so a test can pin the flags without
 * spawning anything. `--only-show-errors` is last, after whatever the caller added. */
export function azArgv(args: string[]): string[] {
  return [...azResolved.prefixArgs, ...args, '--only-show-errors']
}

/** Reads what went wrong off az's stderr: spawn failures are "not installed", an extension
 * complaint gets the add-command appended, a sign-in failure is named as such, and the
 * materialized-identity 403 gets its hint. Anything else is passed on as az said it. */
export function classifyAzFailure(entry: ConsoleEntry): { failure: AzFailure; message: string } {
  const err = (entry.stderr || entry.stdout).trim()
  if (entry.exitCode === null && /ENOENT|not found|spawn/i.test(err)) {
    return { failure: 'not_installed', message: 'The Azure CLI (`az`) is not installed or not on PATH.' }
  }
  if (/timed out/i.test(err) && entry.exitCode === null) return { failure: 'timeout', message: err }
  if (err.includes('azure-devops') && /extension/i.test(err)) {
    return { failure: 'extension_missing', message: `${err}\n${EXTENSION_HINT}` }
  }
  if (/az login|Please run 'az login'|not logged in|No subscription found/i.test(err)) {
    return { failure: 'signed_out', message: err }
  }
  if (err.includes('materialized')) return { failure: 'exit', message: `${err}\n${MATERIALIZED_HINT}` }
  return { failure: 'exit', message: err || `az ${entry.args.join(' ')} exited ${entry.exitCode}` }
}

/** Runs `az <args> --only-show-errors` in `cwd` with the two AZURE_* vars merged onto the
 * process env. Throws AzError on a non-zero exit or a spawn failure. */
export async function runAz(args: string[], cwd: string, opts?: RunCommandOptions): Promise<string> {
  const env = { ...(opts?.env ?? {}), ...AZ_ENV }
  const entry = await runCommand(azResolved.command, azArgv(args), cwd, { ...opts, env })
  if (!entry.ok) {
    const { failure, message } = classifyAzFailure(entry)
    throw new AzError(message, failure, entry)
  }
  return entry.stdout
}

/** `-o json` appended before `--only-show-errors`; empty stdout is `[]`, not an error — az
 * prints nothing at all when a list verb matches nothing (captured on `boards query`). */
export async function azJson<T>(args: string[], cwd: string, opts?: RunCommandOptions): Promise<T> {
  const out = await runAz([...args, '-o', 'json'], cwd, opts)
  if (!out.trim()) return [] as unknown as T
  try {
    return JSON.parse(out) as T
  } catch (err) {
    throw new Error(`az ${args.join(' ')} returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
}
