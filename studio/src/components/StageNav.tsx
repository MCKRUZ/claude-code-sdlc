import type { ProjectStatus } from '../../shared/types'
import { stageStateLabel, stageStateTitle } from '../../shared/stageLabel'

const STATE_CLASSES: Record<ProjectStatus['stages'][number]['stage_state'], string> = {
  signed_off: 'bg-[var(--color-stage-signed-off-bg)] text-[var(--color-stage-signed-off)]',
  current: 'bg-[var(--color-stage-current-bg)] text-[var(--color-stage-current)] font-semibold',
  later: 'bg-[var(--color-stage-later-bg)] text-[var(--color-stage-later)]',
}

export function StageNav({
  status,
  viewedStageId,
  showViewed,
  onSelect,
}: {
  status: ProjectStatus
  /** The stage whose home is currently showing, or undefined for the project's current stage. */
  viewedStageId?: string
  /** Whether a stage's documents are on screen at all. On the Build board or Settings no stage
   * is being viewed, and ringing one would read as "this is that stage's content". */
  showViewed: boolean
  onSelect: (stageId: string) => void
}) {
  return (
    <nav aria-label="Project stages" className="w-56 shrink-0 border-r border-slate-200 bg-white p-3">
      <ol className="space-y-1">
        {status.stages.map((stage) => {
          const isViewed = showViewed && (viewedStageId ? stage.id === viewedStageId : stage.stage_state === 'current')
          return (
            <li key={stage.id}>
              <button
                type="button"
                aria-current={isViewed ? 'page' : undefined}
                title={stageStateTitle(stage)}
                onClick={() => onSelect(stage.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:opacity-80 ${STATE_CLASSES[stage.stage_state]} ${isViewed ? 'ring-2 ring-inset ring-slate-400' : ''}`}
              >
                <span>{stage.display}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-75">
                  {stageStateLabel(stage)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
