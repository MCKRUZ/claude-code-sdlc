// The contract between Studio and the `claude` command line (proposal: studio-improvements, F1).
//
// Studio drives the CLI with a fixed set of flags, built in the main process (chatArgs.ts,
// agentRun.ts, claudeAssist.ts, drafts.ts, signOff.ts). A flag the installed CLI does not know
// is fatal to every one of those calls at once — `error: unknown option '--x'` — and nothing in
// Studio used to look before leaping: 2.1.239 lacks `--permission-prompts`, which 2.1.289 has,
// and every chat, draft, review and sign-off on the older CLI failed the same way while the
// test fake, which accepted any flag, saw nothing.
//
// Two rules follow, and this file holds both:
//
//   1. REQUIRED_CLAUDE_FLAGS names every flag Studio emits. A test pins each argv builder to it,
//      so a new flag cannot be added to one call site without being declared here.
//   2. parseHelpFlags() reads the real CLI's `--help` — the one place the installed version
//      states what it accepts — and missingClaudeFlags() says which of ours it lacks. tooling.ts
//      runs that probe once per detected version; the window shows the answer and keeps the
//      model buttons off until the CLI is updated. No argv is ever branched on the version: one
//      shape, present on every current CLI, and a plain statement when it is not.
//
// Lives in shared/ because both sides read it: the main process to probe, the renderer to
// phrase the message. Runtime code is allowed here (boardModel.ts is the precedent); only
// types.ts must stay types-only.

/** The permission mode every Studio call runs under. `dontAsk` auto-denies anything that was
 * not pre-approved on the command line — the same intent `--permission-prompts none` carried —
 * and it is accepted by 2.1.239 and 2.1.289 alike, so no per-version argv exists. */
export const CLAUDE_PERMISSION_MODE = 'dontAsk'

/** Every `claude` flag Studio emits, across every call site. Long forms, plus `-p`, which the
 * CLI documents as `-p, --print` and Studio passes short. Sorted so a diff reads cleanly. */
export const REQUIRED_CLAUDE_FLAGS: readonly string[] = [
  '-p',
  '--add-dir',
  '--agent',
  '--allowedTools',
  '--append-system-prompt',
  '--disallowedTools',
  '--forward-subagent-text',
  '--input-format',
  '--mcp-config',
  '--output-format',
  '--permission-mode',
  '--plugin-dir',
  '--resume',
  '--session-id',
  '--strict-mcp-config',
  '--tools',
  '--verbose',
]

const FLAG_TOKEN = /^-{1,2}[A-Za-z][\w-]*$/

/** The flags a `claude --help` text declares, short and long forms alike.
 *
 * The CLI prints one option per line, indented exactly two spaces, aliases comma-separated and
 * the value placeholder (`<mode>`, `[filter]`) after — e.g. `  -p, --print`,
 * `  --allowedTools, --allowed-tools <tools...>`. Continuation lines are indented further, so
 * requiring the two-space indent keeps a flag merely MENTIONED in a description (the `--bare`
 * text lists several) from counting as accepted. */
export function parseHelpFlags(helpText: string): Set<string> {
  const flags = new Set<string>()
  for (const line of helpText.split(/\r?\n/)) {
    const m = /^ {2}(-\S.*)$/.exec(line)
    if (!m) continue
    const head = m[1].split(/\s[<[]/)[0]
    for (const token of head.split(',')) {
      const flag = token.trim().split(/\s+/)[0]
      if (FLAG_TOKEN.test(flag)) flags.add(flag)
    }
  }
  return flags
}

/** The REQUIRED_CLAUDE_FLAGS this help text does not declare, in declaration order. Empty when
 * the installed CLI can run everything Studio does. An empty or unreadable help text reports
 * every flag missing — "could not read what the CLI accepts" must never read as "accepts all". */
export function missingClaudeFlags(helpText: string): string[] {
  const declared = parseHelpFlags(helpText)
  return REQUIRED_CLAUDE_FLAGS.filter((flag) => !declared.has(flag))
}

/** The one sentence Tooling and Settings show, and the error every model call returns, when
 * the CLI lacks something Studio needs. */
export function claudeLacksMessage(version: string | undefined, missing: readonly string[]): string {
  const ver = (version ?? '').trim().split(/\s+/)[0] || 'installed here'
  return `Claude Code ${ver} lacks ${missing.join(', ')} — update with \`claude update\``
}
