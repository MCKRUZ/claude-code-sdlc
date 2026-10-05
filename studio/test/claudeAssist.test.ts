import { describe, expect, it } from 'vitest'
import { CLAUDE_SAFE_ARGS, CLAUDE_SHARED_SAFE_ARGS } from '../electron/main/claudeAssist'

// CLAUDE_SAFE_ARGS was a real past security finding (claudeAssist.ts's own header) — every
// `claude` invocation in this app shares SOME of it (--permission-mode dontAsk,
// --strict-mcp-config) regardless of whether the caller pins its tool surface with a deny-list
// (this file's own combineWithClaude, drafts.ts's draftField) or an explicit --tools allow-list
// (chat.ts's chatArgs.ts, spec 0016). CLAUDE_SHARED_SAFE_ARGS is the part both approaches
// actually share; CLAUDE_SAFE_ARGS stays the deny-list callers' own full set, unchanged, so
// combineWithClaude/draftField need no change here.

describe('CLAUDE_SHARED_SAFE_ARGS / CLAUDE_SAFE_ARGS', () => {
  it('CLAUDE_SHARED_SAFE_ARGS is exactly the flags common to every claude invocation, with no tool-denial opinion', () => {
    expect(CLAUDE_SHARED_SAFE_ARGS).toEqual(['--permission-mode', 'dontAsk', '--strict-mcp-config'])
    expect(CLAUDE_SHARED_SAFE_ARGS).not.toContain('--disallowedTools')
  })

  it('CLAUDE_SAFE_ARGS (the deny-list callers\' full set) still starts with the shared flags, then adds the deny-list', () => {
    expect(CLAUDE_SAFE_ARGS.slice(0, CLAUDE_SHARED_SAFE_ARGS.length)).toEqual(CLAUDE_SHARED_SAFE_ARGS)
    expect(CLAUDE_SAFE_ARGS).toContain('--disallowedTools')
    expect(CLAUDE_SAFE_ARGS).toEqual([
      '--permission-mode', 'dontAsk',
      '--strict-mcp-config',
      '--disallowedTools', 'Bash', 'Edit', 'Write', 'Read', 'WebFetch', 'WebSearch',
    ])
  })
})
