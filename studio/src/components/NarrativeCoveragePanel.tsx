import type { NarrativeArtifact, NarrativeCoverage, StageDocument } from '../../shared/types'
import { PanelButton, PanelError, PanelLoading, plural, useLoaded } from './activityPanelBits'
import { BusyReason, PanelCandidateView } from './CandidateView'
import type { DraftJobApi } from './useDraftJob'

const baseName = (path: string) => path.split('/').pop() ?? path
const stemOf = (file: string) => file.replace(/\.md$/i, '')

/** Enhance (spec 0026, 0027): how many of the stage's documents have a plain-language summary, and —
 * when it is given the shared draft job — a *Draft with Claude* button beside each document that has
 * none or whose summary is out of date. Coverage is read-only, so it loads when the row appears and
 * again after a Keep changed what is on disk. */
export function NarrativeCoveragePanel({
  projectPath, stageId, documents, draft, actor = '',
}: {
  projectPath: string
  stageId: string
  /** The stage's documents (readiness.documents). A summary's source path is read from here, never guessed. */
  documents?: StageDocument[]
  draft?: DraftJobApi
  /** Who is signed in; Keep and Discard are recorded under this name. */
  actor?: string
}) {
  const kept = draft?.keptCount ?? 0
  const loaded = useLoaded(
    `${projectPath}|${stageId}|${kept}`,
    () => window.studio.getNarrativeCoverage(projectPath, stageId),
    'The summaries could not be checked.',
  )
  return (
    <div data-testid="narrative-panel" className="mt-2 space-y-1 text-xs text-ink-2">
      {loaded.kind === 'loading' && <PanelLoading lines={1}>Checking…</PanelLoading>}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {loaded.kind === 'ready' && <Coverage coverage={loaded.value} />}
      {loaded.kind === 'ready' && loaded.value.hasData && draft && documents && (
        <DraftControls coverage={loaded.value} stageId={stageId} documents={documents} draft={draft} />
      )}
      {draft && <PanelCandidateView draft={draft} actor={actor} kind="enhance" stageId={stageId} />}
    </div>
  )
}

/** "N of M" is the script's own count of what is on disk right now; it is swapped as text, not
 * counted up, because a reload after Keep is a new reading, not a value moving. */
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

/** A document can be drafted when it has no summary or its summary is out of date, AND the stage lists
 * it, so the path handed to the model is the one the plugin reported. `narrative_status.py` names an
 * artifact by its STEM ("constitution"), the stage's documents are paths ("…/constitution.md"): a
 * mocked bridge once used filenames for both, so the match was never exercised against the real shape. */
function draftable(artifacts: NarrativeArtifact[], documents: StageDocument[]) {
  const wanted = artifacts.filter((a) => a.status === 'none' || (a.status === 'present' && a.stale === true))
  return wanted.flatMap((artifact) => {
    const source = documents.find((d) => !d.folder && [baseName(d.path), stemOf(baseName(d.path))].includes(artifact.name))
    return source ? [{ name: artifact.name, path: source.path }] : []
  })
}

function DraftControls({
  coverage, stageId, documents, draft,
}: { coverage: NarrativeCoverage; stageId: string; documents: StageDocument[]; draft: DraftJobApi }) {
  const rows = draftable(coverage.artifacts, documents)
  if (rows.length === 0) return null
  return (
    <div className="space-y-1.5 pt-1">
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.name} data-testid={`draft-row-${row.name}`} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-ink-1">{row.name}</span>
            <PanelButton
              disabled={draft.busyLabel !== null}
              onClick={() => void draft.start({ kind: 'enhance', stageId, document: row.path })}
            >
              Draft with Claude
            </PanelButton>
          </li>
        ))}
      </ul>
      <BusyReason label={draft.busyLabel} />
      <p>Uses Claude.</p>
      <p className="text-ink-3">
        Summaries never mention velocity, story points, pull-request counts, lines of code or hours spent.
      </p>
    </div>
  )
}
