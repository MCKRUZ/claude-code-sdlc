// A stage's human-readable display name (e.g. "Requirements") barely ever changes for a given
// (project, stage) within one Studio session — but index.ts's chatContext() used to fetch it
// fresh, via getStageReadiness() (a real subprocess spawn of stage_readiness.py), on EVERY
// single chat IPC call: ensureChatStarted, sendChatMessage, answerChatQuestion, and
// resolveChatProposal each paid that cost again for an answer that does not change mid-
// conversation, and ensureChatStarted itself paid it TWICE in one call (once for its own
// "does this stage have an unstarted document" check, again inside chatContext() for the
// same stage). A small, electron-free cache here — separate from index.ts so it is provable
// with an ordinary unit test rather than only by reading index.ts's wiring.
//
// Keyed the same way settings.ts keys a stage's persisted chat transcript
// (`${projectPath}\u0000${stageId}`), so a per-project, per-stage cache entry can never bleed
// into another project or stage that happens to reuse the same stage id.

const cache = new Map<string, string>()

export function stageDisplayCacheKey(projectPath: string, stageId: string): string {
  return `${projectPath}\u0000${stageId}`
}

export function getCachedStageDisplay(projectPath: string, stageId: string): string | undefined {
  return cache.get(stageDisplayCacheKey(projectPath, stageId))
}

export function setCachedStageDisplay(projectPath: string, stageId: string, display: string): void {
  cache.set(stageDisplayCacheKey(projectPath, stageId), display)
}

/** Test-only escape hatch — the cache is otherwise process-lifetime, matching the other
 * in-memory caches this file's sibling modules keep (e.g. chatMcpConfig.ts's mcp-config path
 * cache, index.ts's resolvedPluginScriptsDir). */
export function clearStageDisplayCacheForTests(): void {
  cache.clear()
}
