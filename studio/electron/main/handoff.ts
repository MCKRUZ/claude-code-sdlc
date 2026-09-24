// Handing a ready spec to a developer (spec 0011).
//
// Every rule about who may be handed what lives in the plugin's own command, and this file
// adds none of its own. That is Matt's resolved decision, and it is not just tidiness: a
// second copy of "a person cannot check their own build" living in the window is a rule
// enforced only in the app — which the spec's own Checking Plan tells the reviewer to look
// for, because a rule the app enforces is a rule a script can walk around.
//
// So Studio asks, and reports the answer. The one thing it does with the refusal is decide
// what to put on screen next — a reason box for a team at its limit, a different developer
// for a checker — and it reads the refusal's KIND for that, never its wording.

import { runPluginScript } from './project'
import { resolveProjectDocument } from './projectPaths'

export type RefusalKind =
  | 'not_ready'
  | 'unknown_developer'
  | 'developer_is_checker'
  | 'team_at_limit'
  | 'other'

export interface HandoffRefusal {
  kind: RefusalKind
  message: string
}

export interface HandoffResult {
  ok: boolean
  refusal?: HandoffRefusal
  branch?: string
  developer?: string
  checker?: string | null
  prUrl?: string | null
  /** The local hand-off succeeded but the code host could not be told. Reported, never
   * fatal — the branch and the commit are real either way, and hiding this would leave
   * someone waiting for a review request that was never sent. */
  assignmentError?: string | null
  alreadyInFlight?: boolean
}

const KINDS: RefusalKind[] = [
  'not_ready', 'unknown_developer', 'developer_is_checker', 'team_at_limit', 'other',
]

function toKind(raw: unknown): RefusalKind {
  return KINDS.includes(raw as RefusalKind) ? (raw as RefusalKind) : 'other'
}

/**
 * @param overLimitReason Only supplied after a person has been told the team is at its limit
 *   and has typed why they are proceeding anyway. Never defaulted, never remembered between
 *   hand-offs: the whole value of the limit is that going past it is a deliberate act with a
 *   name on it, and a remembered reason would make the second breach free.
 */
export async function handOff(
  projectPath: string,
  pluginScriptsDir: string,
  specPath: string,
  developer: string,
  overLimitReason?: string,
): Promise<HandoffResult> {
  // The spec path arrives relative to the project, but the plugin command runs from the
  // plugin's own directory — so a relative path resolves against the wrong place and the
  // spec is simply "not found", which reads as a refusal for a reason that isn't true.
  // Resolved here, through the same boundary every other path crosses: inside the project,
  // not a link elsewhere, and one of the files Studio is allowed to touch.
  let fullSpecPath: string
  try {
    fullSpecPath = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    return { ok: false, refusal: { kind: 'other', message: (err as Error).message } }
  }

  const args = [
    '--repo', projectPath,
    '--spec', fullSpecPath,
    '--developer', developer,
    '--json',
  ]
  if (overLimitReason?.trim()) args.push('--over-limit', overLimitReason.trim())

  const entry = await runPluginScript(pluginScriptsDir, 'handoff.py', args)
  return readHandoffOutput(entry.stdout, entry.stderr, developer)
}

/** Turning the command's answer into something the window can act on. Pure, and separate,
 * because this is where a hand-off could quietly be reported as succeeding when it did not —
 * the one failure here with real consequences, since a person would stop chasing it. */
export function readHandoffOutput(stdout: string, stderr: string, developer: string): HandoffResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout)
  } catch {
    // The command refuses before it changes anything, so an unreadable answer means the
    // hand-off did not happen — reported as a refusal rather than as an ambiguous failure,
    // and never as a success.
    return {
      ok: false,
      refusal: { kind: 'other', message: stderr.trim() || stdout.trim() || 'The hand-off command gave no readable answer.' },
    }
  }

  if (parsed.ok !== true) {
    const refusal = (parsed.refusal ?? {}) as { kind?: unknown; message?: unknown }
    return {
      ok: false,
      refusal: {
        kind: toKind(refusal.kind),
        message: String(refusal.message ?? 'The hand-off was refused.'),
      },
    }
  }

  return {
    ok: true,
    branch: String(parsed.branch ?? ''),
    developer: String(parsed.developer ?? developer),
    checker: (parsed.checker as string | null) ?? null,
    prUrl: (parsed.pr_url as string | null) ?? null,
    assignmentError: (parsed.assignment_error as string | null) ?? null,
    alreadyInFlight: parsed.already_in_flight === true,
  }
}
