// Running one named plugin agent headlessly, to produce the text of ONE document (spec 0027).
//
// THREAT MODEL. The documents this run reads are project files, and a project file can carry text
// from a vendor, a customer or anyone who can open a pull request. Whatever such text says, the run
// must be unable to write, run a command, or reach the network, and the person alone decides what
// reaches the disk. So the whole of "what Claude may do" is this file's argument list, and it rests on
// four rules that each stand without the others:
//
//   1. Read-only tools. `--tools` is an allow-list of Read, Grep and Glob, with the same list in
//      `--allowedTools`. There is no Bash, Edit, Write, Task or web tool for text to talk the model
//      into using, no MCP server (`--strict-mcp-config` with none supplied), and no permission prompt.
//   2. An isolated working directory. Project settings and hooks are found from the working
//      directory (claudeAssist.ts measured it), so the run starts in Studio's empty directory, never in
//      the project. The project and the plugin are reached only through `--add-dir`.
//   3. A fixed agent table. The agent is picked here, from the job kind; the renderer sends a kind,
//      never an agent name.
//   4. No document text in the prompt. The prompt names paths and an instruction; the model reads the
//      documents itself, with the tools above. What comes back is text for a person to keep or discard.
//
// The result is parsed from the CLI's own final `result` line (measured live 2026-10-03: type
// "result", subtype "success", is_error false, result "<text>", total_cost_usd <number>).

import { claudeWorkingDirectory, CLAUDE_SHARED_SAFE_ARGS } from './claudeAssist'
import { readPluginName } from './chatArgs'
import { describeLatestActivity } from './chatStreamParse'
import { rawStdout, redact, runCommand, wasCancelled } from './commandRunner'
import type { BatchKind, DraftKind } from '../../shared/types'

/** The only agents a single-document model job can run. Keyed by job kind; never taken from the renderer. */
export const AGENT_BY_KIND: Readonly<Record<DraftKind, string>> = {
  enhance: 'narrative-enhancer',
  review: 'multi-reviewer',
}

/** The agents of the batch jobs (spec 0029). A separate table so that `startDraft`, which accepts only
 * the kinds in AGENT_BY_KIND, can never be asked for a batch job, and the reverse. */
export const BATCH_AGENT_BY_KIND: Readonly<Record<BatchKind, string>> = {
  summarise: 'document-summarizer',
  analyse: 'discovery-analyst',
}

export type AgentKind = DraftKind | BatchKind

function agentFor(kind: string): string | undefined {
  if (Object.hasOwn(AGENT_BY_KIND, kind)) return AGENT_BY_KIND[kind as DraftKind]
  if (Object.hasOwn(BATCH_AGENT_BY_KIND, kind)) return BATCH_AGENT_BY_KIND[kind as BatchKind]
  return undefined
}

/** The complete tool surface of a model job. Write, Edit and Bash are not here and must never be. */
export const AGENT_TOOLS = ['Read', 'Grep', 'Glob'] as const

export interface AgentArgsOptions {
  kind: AgentKind
  prompt: string
  projectPath: string
  pluginRoot: string
}

/** Pure: the single place that says what Claude may do in a model job. A test asserts its output
 * exactly, so every property above is provable without starting a process. */
export function buildAgentArgs(opts: AgentArgsOptions): { command: string; args: string[]; cwd: string } {
  const agent = agentFor(opts.kind)
  if (!agent) throw new Error(`Unknown model job: ${String(opts.kind)}`)
  const tools = AGENT_TOOLS.join(',')
  const args = [
    '--plugin-dir', opts.pluginRoot,
    '--add-dir', opts.projectPath, opts.pluginRoot,
    '--agent', `${readPluginName(opts.pluginRoot)}:${agent}`,
    '--tools', tools,
    '--allowedTools', tools,
    ...CLAUDE_SHARED_SAFE_ARGS,
    '--output-format', 'stream-json',
    '--verbose',
    // `-p -- <prompt>` MUST stay last: `--` ends flag parsing for everything after it, so a flag placed
    // behind it is silently ignored (chatArgs.ts reproduced this, and so did this file's own probe:
    // the tool list and output format stopped applying). `--` is still needed in front of the prompt,
    // so a prompt that starts with "-" is not read as an option.
    '-p', '--', opts.prompt,
  ]
  return { command: 'claude', args, cwd: claudeWorkingDirectory() }
}

// --- reading the stream ----------------------------------------------------------------------

export type AgentStream = { ok: true; text: string; costUsd: number | null } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function lastResultLine(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isRecord(parsed) && parsed.type === 'result') return parsed
    } catch { /* a half-written or non-JSON line: keep looking upwards */ }
  }
  return null
}

/** Never 0 by invention: a missing, non-numeric, negative or non-finite figure is "unknown". */
function costOf(line: Record<string, unknown>): number | null {
  const cost = line.total_cost_usd
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null
}

/** The CLI's final `result` line is authoritative: the text and the cost both come from it, and a
 * stream without one is a failed run however much text came before. One plain line for every failure. */
export function parseAgentStream(stdout: string): AgentStream {
  const line = lastResultLine(stdout)
  if (!line) return { ok: false, error: 'Claude finished without giving a result.' }
  const text = typeof line.result === 'string' ? line.result.trim() : ''
  if (line.is_error === true) {
    const first = text.split(/\r?\n/)[0]?.slice(0, 200) ?? ''
    return { ok: false, error: first ? `Claude could not finish this draft: ${redact(first)}` : 'Claude could not finish this draft.' }
  }
  if (!text) return { ok: false, error: 'Claude returned nothing for this draft.' }
  return { ok: true, text, costUsd: costOf(line) }
}

// --- running ---------------------------------------------------------------------------------

/** A test seam: run this program (with these leading arguments) in place of the real CLI. Absent in
 * production, where the real `claude` is always what runs. */
export interface AgentLaunch {
  command: string
  argsPrefix?: string[]
}

export interface AgentRunOptions extends AgentArgsOptions {
  /** The person's configured path to `claude`; the bare name when they have not set one. */
  claudePath?: string
  signal?: AbortSignal
  /** Called when what Claude is doing changes ("Reading requirements.md"). */
  onActivity?: (label: string) => void
  launch?: AgentLaunch
}

export type AgentResult =
  | { ok: true; text: string; costUsd: number | null }
  | { ok: false; error: string; cancelled?: boolean }

export async function runAgent(opts: AgentRunOptions): Promise<AgentResult> {
  const built = buildAgentArgs(opts)
  const command = opts.launch?.command ?? (opts.claudePath || built.command)
  const args = [...(opts.launch?.argsPrefix ?? []), ...built.args]

  let lastLabel: string | null = null
  const entry = await runCommand(command, args, built.cwd, {
    signal: opts.signal,
    onChunk: (stdoutSoFar) => {
      const label = describeLatestActivity(stdoutSoFar)
      if (label && label !== lastLabel) {
        lastLabel = label
        opts.onActivity?.(label)
      }
    },
  })

  if (wasCancelled(entry)) return { ok: false, error: 'Cancelled.', cancelled: true }
  if (!entry.ok) {
    const code = entry.exitCode === null ? '' : ` (exit code ${entry.exitCode})`
    return { ok: false, error: `Claude stopped with an error${code}. The console has the details.` }
  }
  // Read as DATA: a draft can legitimately contain text the console's masking would rewrite.
  return parseAgentStream(rawStdout(entry))
}
