// A single, narrow use of the `claude` CLI: combining two clashing section texts into a
// draft, for spec 0009's clash screen. The text it produces is always shown to the person as
// a candidate to accept or discard (ClashScreen.tsx), never applied silently.
//
// SECURITY — this file previously claimed the call "can never read, write, or run anything as
// a side effect." That was wrong, and it was measured to be wrong (spec 0010's security pass,
// 2026-09-24). `claude --help` states that `-p` SKIPS the workspace trust dialog, and that
// denying prompts (then `--permission-prompts none`, now `--permission-mode dontAsk`) only
// denies "anything that would prompt" — hooks are not permission-gated at all. So a project
// directory carrying its own `.claude/settings.json` got that file loaded, and a hook in it
// ran, the moment someone clicked a button here. Proven on this machine: a marker hook
// planted in a scratch repo executed under the old invocation, and did not execute after the
// change below.
//
// The fix is `claudeWorkingDirectory()` — see its own comment. Nothing in either prompt needs
// repository context that Studio has not already put into the prompt string, so running
// outside the project costs nothing.

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rawStdout, runCommand } from './commandRunner'
import { CLAUDE_PERMISSION_MODE } from '../../shared/claudeContract'

/** An empty, Studio-owned directory to run the `claude` CLI in.
 *
 * Project-level settings, hooks and CLAUDE.md are discovered from the working directory, so
 * the working directory is the whole attack surface when the project folder is a repository
 * someone else wrote. Pointing it at a directory Studio owns — and never writes anything
 * into — means there is nothing there to discover. The user's OWN user-level settings still
 * load, which is correct: those are theirs, and they are how the CLI is signed in.
 *
 * Note for anyone tempted to add `--bare`, which is the flag that also strips hooks: it
 * disables keychain reads, so it requires an API key instead of the sign-in the person
 * already has. Measured — `--bare` turns these calls into "Not logged in". That is a product
 * decision about how Studio authenticates, not a hardening tweak. */
export function claudeWorkingDirectory(): string {
  const dir = join(tmpdir(), 'sdlc-studio-claude')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Flags shared by every `claude` invocation in this app, regardless of whether the caller
 * pins its tool surface with a deny-list (below) or an explicit `--tools` allow-list
 * (chat.ts's chatArgs.ts, spec 0016's own acceptance check — see its header for why an
 * allow-list is used there instead of spreading the deny-list this constant also carries).
 * `--strict-mcp-config` with no `--mcp-config` loads no MCP servers at all.
 *
 * `--permission-mode dontAsk` replaced `--permission-prompts none` (studio-improvements F1):
 * the same intent — auto-deny anything not pre-approved on the command line — but a flag that
 * Claude Code 2.1.239 and 2.1.289 both accept, where the old one exists only in the newer CLI
 * and failed every model call on the older one with `unknown option`. One argv shape for every
 * version; shared/claudeContract.ts names the flags and tooling.ts checks the installed CLI
 * declares them. */
export const CLAUDE_SHARED_SAFE_ARGS = [
  '--permission-mode', CLAUDE_PERMISSION_MODE,
  '--strict-mcp-config',
]

/** The deny-list callers (combineWithClaude below, drafts.ts's draftField) actually use: the
 * shared flags above, plus denying every tool outright — since document text reaches the
 * prompt verbatim here and must be assumed hostile. */
export const CLAUDE_SAFE_ARGS = [
  ...CLAUDE_SHARED_SAFE_ARGS,
  '--disallowedTools', 'Bash', 'Edit', 'Write', 'Read', 'WebFetch', 'WebSearch',
]

export async function combineWithClaude(
  claudePath: string,
  _projectPath: string,
  localText: string,
  remoteText: string,
): Promise<{ combined: string } | { error: string }> {
  const prompt = [
    'Two people each edited the same section of a document. Combine their changes into one',
    "version that preserves both people's intent. Output ONLY the combined section text —",
    'no preamble, no explanation, no markdown code fence.',
    '',
    '--- Version A ---',
    localText,
    '',
    '--- Version B ---',
    remoteText,
  ].join('\n')

  const entry = await runCommand(
    claudePath, ['-p', prompt, ...CLAUDE_SAFE_ARGS], claudeWorkingDirectory(),
  )
  if (!entry.ok) {
    return { error: entry.stderr || 'Claude could not combine these versions.' }
  }
  return { combined: rawStdout(entry).trim() } // written into the document, so exact
}
