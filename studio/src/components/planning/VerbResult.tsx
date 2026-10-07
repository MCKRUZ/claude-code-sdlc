// One write, one answer (togo-command-center.md §2.4): the exit code is the truth — 0 "Done",
// 1 "Not done", 2 "Refused by the plugin" — and the plugin's stdout/stderr are shown VERBATIM
// under that heading. No JSON is parsed (write verbs print prose). `useSprintVerb` is the small
// hook the planning columns and the close screen share: it runs ONE `runSprintVerb`, keeps the
// result, and calls `onSettled(result)` so the host re-runs the reads it already holds — only
// after the exit code has arrived, never before (nothing optimistic).
import { useCallback, useState } from 'react'
import type { SprintVerbRequest, SprintVerbResult } from '../../../shared/types'
import { describeArgv } from '../../../shared/sprintVerbArgv'
import { exitHeading } from '../../../shared/reasons'
import { Notice, cn } from '../../ui'

export function useSprintVerb(projectPath: string, onSettled?: (result: SprintVerbResult) => void) {
  const [result, setResult] = useState<SprintVerbResult | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (request: SprintVerbRequest) => {
    setBusy(true)
    try {
      const r = await window.studio.runSprintVerb(projectPath, request)
      setResult(r)
      onSettled?.(r)
      return r
    } finally {
      setBusy(false)
    }
  }, [projectPath, onSettled])
  const clear = useCallback(() => setResult(null), [])
  return { run, result, busy, clear }
}

/** The result pane: heading by exit code, the argv that ran, the plugin's words. `compact` is the
 * one-line form a row shows under itself. */
export function VerbResult({ result, compact = false, className }: { result: SprintVerbResult; compact?: boolean; className?: string }) {
  const heading = exitHeading(result.exitCode)
  const tone = result.exitCode === 0 ? 'ok' : result.exitCode === 2 ? 'error' : 'warn'
  const text = [result.stdout, result.stderr].filter((s) => s && s.trim()).join('\n').trim()
  return (
    <Notice tone={tone} title={heading} data-verb-result={result.verb} data-exit-code={result.exitCode ?? 'none'} className={cn(compact && 'text-xs', className)}>
      <p className="font-mono text-[11px] text-ink-3">{describeArgv(result.argv)}</p>
      {text ? <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-1">{text}</pre> : <p className="mt-1 text-xs text-ink-3">The plugin printed nothing.</p>}
    </Notice>
  )
}
