// Whether the installed Claude Code can run what Studio asks of it (proposal: studio-
// improvements, F1). The main process probes `claude --help` once per detected version
// (tooling.ts) and reports the flags it lacks on the Claude ToolStatus; App.tsx turns that into
// one sentence and provides it here, so every control that would start a model call — the chat
// composer, "Ask Claude to draft", "Sign off and advance", the clash combiner — reads the same
// answer and disables itself with the reason, instead of each one failing with `unknown option`
// after the click. null means nothing is missing.

import { createContext, useContext } from 'react'

export const ClaudeIssueContext = createContext<string | null>(null)

/** The sentence to show instead of enabling a model control, or null when the CLI is fine. */
export function useClaudeIssue(): string | null {
  return useContext(ClaudeIssueContext)
}
