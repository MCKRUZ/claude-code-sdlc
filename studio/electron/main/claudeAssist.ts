// A single, narrow use of the `claude` CLI: combining two clashing section texts into a
// draft, for spec 0009's clash screen. Verified live against `claude --help` on this
// machine (2026-09-24): `-p`/`--print` for one-shot non-interactive output, prompt as a
// positional argument, `--permission-prompts none` = "anything that would prompt is denied
// automatically." This can never read, write, or run anything as a side effect of
// "combining two paragraphs" — it only ever produces text, and that text is always shown to
// the person as a candidate to accept or discard (ClashScreen.tsx), never applied silently.

import { runCommand } from './commandRunner'

export async function combineWithClaude(
  claudePath: string,
  cwd: string,
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

  const entry = await runCommand(claudePath, ['-p', prompt, '--permission-prompts', 'none'], cwd)
  if (!entry.ok) {
    return { error: entry.stderr || 'Claude could not combine these versions.' }
  }
  return { combined: entry.stdout.trim() }
}
