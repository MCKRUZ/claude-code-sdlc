import type { NarrativeCoverage } from '../../shared/types'
import { PanelError, plural, useLoaded } from './activityPanelBits'

/** Enhance (spec 0026): how many of the stage's documents have a plain-language summary. Read-only —
 * the script writes nothing — so it loads when the row appears. */
export function NarrativeCoveragePanel({ projectPath, stageId }: { projectPath: string; stageId: string }) {
  const loaded = useLoaded(
    `${projectPath}|${stageId}`,
    () => window.studio.getNarrativeCoverage(projectPath, stageId),
    'The summaries could not be checked.',
  )
  return (
    <div data-testid="narrative-panel" className="mt-2 space-y-1 text-xs text-slate-600">
      {loaded.kind === 'loading' && <p>Checking…</p>}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {loaded.kind === 'ready' && <Coverage coverage={loaded.value} />}
    </div>
  )
}

function Coverage({ coverage }: { coverage: NarrativeCoverage }) {
  if (!coverage.hasData) {
    return (
      <>
        <p>No documents in this stage yet</p>
        {coverage.notes.map((note) => <p key={note}>{note}</p>)}
      </>
    )
  }
  const { withNarrative, total } = coverage
  const without = coverage.artifacts.filter((a) => a.status === 'none').map((a) => a.name)
  const outOfDate = coverage.artifacts.filter((a) => a.status === 'present' && a.stale === true).map((a) => a.name)
  return (
    <>
      <p>
        {withNarrative} of {total} {plural(total, 'document', 'documents')} {plural(withNarrative, 'has', 'have')} a plain-language summary
      </p>
      {without.length > 0 && <p>Without a summary: {without.join(', ')}</p>}
      {outOfDate.length > 0 && <p>Out of date: {outOfDate.join(', ')}</p>}
    </>
  )
}
