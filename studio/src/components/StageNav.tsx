import type { ProjectStatus } from '../../shared/types'

const STATE_LABEL: Record<ProjectStatus['stages'][number]['stage_state'], string> = {
  signed_off: 'Signed off',
  current: 'Current',
  later: 'Later',
}

const STATE_CLASSES: Record<ProjectStatus['stages'][number]['stage_state'], string> = {
  signed_off: 'bg-[var(--color-stage-signed-off-bg)] text-[var(--color-stage-signed-off)]',
  current: 'bg-[var(--color-stage-current-bg)] text-[var(--color-stage-current)] font-semibold',
  later: 'bg-[var(--color-stage-later-bg)] text-[var(--color-stage-later)]',
}

export function StageNav({ status }: { status: ProjectStatus }) {
  return (
    <nav aria-label="Project stages" className="w-56 shrink-0 border-r border-slate-200 bg-white p-3">
      <ol className="space-y-1">
        {status.stages.map((stage) => (
          <li key={stage.id}>
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${STATE_CLASSES[stage.stage_state]}`}
            >
              <span>{stage.display}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-75">
                {STATE_LABEL[stage.stage_state]}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
