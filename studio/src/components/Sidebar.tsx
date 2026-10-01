import type { ProjectStage, ProjectStatus, SyncState } from '../../shared/types'
import {
  activeNav, BUILD_VIEWS, groupStages, nodeKind, stageMeta, targetForBuildView, targetForStage,
  type Area, type DocProgress, type NavTarget, type NodeKind,
} from '../../shared/nav'
import { SyncChip } from './SyncChip'

/** Studio's only navigation: the project, its journey grouped into Foundation / Build / Ship /
 * Close, and the project-wide things (Settings, Console, sync) in the footer.
 *
 * It replaced a list of phases sitting beside a row of tabs that looked as if they belonged to the
 * phase picked — only one did. Now every screen is reached from here, and Build Loop, the one
 * stage with screens of its own, opens them beneath itself. Purely presentational: the app hands
 * it the state and receives where the person wants to go. */
export function Sidebar({
  status, area, viewedStageId, currentDocs, syncState, consoleOpen, onToggleConsole, onNavigate,
}: {
  status: ProjectStatus
  area: Area
  /** The stage whose documents were picked, or undefined for the project's current stage. */
  viewedStageId: string | undefined
  /** Document progress of the current stage, when known. */
  currentDocs: DocProgress | null
  syncState: SyncState
  consoleOpen: boolean
  onToggleConsole: () => void
  onNavigate: (target: NavTarget) => void
}) {
  const current = status.stages.find((s) => s.stage_state === 'current')
  const active = activeNav(area, viewedStageId, current?.id ?? null)
  const done = status.stages.filter((s) => s.stage_state === 'signed_off').length
  const total = status.stages.length

  return (
    // `max-h-[50vh] sm:max-h-none` — below `sm`, Frame.tsx's row becomes a COLUMN (spec 0018),
    // so this aside's own cross axis is width, not height, and its main axis (height) sizes to
    // CONTENT by default: nothing bounds it, so `nav`'s own `min-h-0 flex-1 overflow-y-auto`
    // below has no bounded ancestor to size against and the full stage list renders at full
    // content height, pushing `main`/`ChatPanel` off-screen below it. Capping height here (not
    // in Frame.tsx) is the smaller, more honest fix: Frame.tsx only needs to know Sidebar
    // stacks, not how tall it is allowed to be — that is this component's own concern, the same
    // way `w-72` already is. At `sm:`+, `max-h-none` lifts the cap so the previous row-stretch
    // behaviour (this aside taking the row's own full height) is exactly what it was before.
    <aside className="flex max-h-[50vh] w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 sm:max-h-none">
      <div className="border-b border-slate-200 px-4 pb-3.5 pt-4">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">{status.project_name}</h1>
        <p className="truncate text-xs text-slate-500">{status.profile_id}</p>
        <div aria-hidden="true" className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-[var(--color-stage-signed-off)]" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <p className="mt-1.5 flex justify-between text-[11.5px] tabular-nums text-slate-500">
          <span>{`${done} of ${total} stages done`}</span>
          {current && <span>{`Now: ${shortName(current)}`}</span>}
        </p>
      </div>

      <nav aria-label="Project" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
        {groupStages(status.stages).map((group, i) => (
          <div key={group.label}>
            <div className={`px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-slate-400 ${i === 0 ? 'pt-1.5' : 'pt-3.5'}`}>
              {group.label}
            </div>
            <ol>
              {group.stages.map((stage, idx) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  isLast={idx === group.stages.length - 1}
                  isActive={active.stageId === stage.id && active.buildView === null}
                  docs={stage.stage_state === 'current' ? currentDocs : null}
                  buildView={stage.id === 'build' && active.stageId === 'build' ? active.buildView : undefined}
                  onNavigate={onNavigate}
                />
              ))}
            </ol>
          </div>
        ))}
      </nav>

      <div className="grid gap-0.5 border-t border-slate-200 px-2.5 pb-2.5 pt-2">
        <FooterButton
          label="Settings"
          active={active.footer === 'settings'}
          onClick={() => onNavigate({ area: 'settings' })}
          icon="M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.5-2.3 1a7.5 7.5 0 00-2-1.2L14.6 3h-4l-.4 2.6a7.5 7.5 0 00-2 1.2l-2.3-1-2 3.5 2 1.5a7.4 7.4 0 000 2.4l-2 1.5 2 3.5 2.3-1a7.5 7.5 0 002 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 002-1.2l2.3 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"
        />
        <FooterButton
          label="Console"
          active={consoleOpen}
          pressed={consoleOpen}
          onClick={onToggleConsole}
          icon="M4 17l6-6-6-6M12 19h8"
        />
        <div className="mx-1 mt-1.5"><SyncChip syncState={syncState} /></div>
      </div>
    </aside>
  )
}

function shortName(stage: ProjectStage): string {
  return stage.display.replace(/^Phase [^:]+:\s*/, '')
}

function FooterButton({
  label, icon, active, pressed, onClick,
}: { label: string; icon: string; active: boolean; pressed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={active && pressed === undefined ? 'page' : undefined}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[10px] border px-2.5 py-[7px] text-left text-[13px] ${
        active ? 'border-slate-200 bg-white text-slate-900 shadow-sm' : 'border-transparent text-slate-600 hover:bg-slate-200/50'
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon} />
      </svg>
      <span>{label}</span>
    </button>
  )
}

const NODE: Record<NodeKind, string> = {
  signed: 'bg-[var(--color-stage-signed-off)] text-white',
  completed: 'border-2 border-[var(--color-stage-signed-off)] bg-[var(--color-stage-signed-off-bg)] text-[var(--color-stage-signed-off)]',
  current: 'border-2 border-[var(--color-stage-current)]',
  later: 'border-2 border-dashed border-slate-400',
}

function StageRow({
  stage, isLast, isActive, docs, buildView, onNavigate,
}: {
  stage: ProjectStage
  isLast: boolean
  isActive: boolean
  docs: DocProgress | null
  /** Set only on Build Loop while it is where you are: which of its screens is showing. */
  buildView: ReturnType<typeof activeNav>['buildView'] | undefined
  onNavigate: (target: NavTarget) => void
}) {
  const kind = nodeKind(stage)
  const meta = stageMeta(stage, docs)
  const expanded = buildView !== undefined
  const isBuild = stage.id === 'build'

  return (
    <li className="relative">
      {!isLast && (
        <span
          aria-hidden="true"
          className={`absolute left-[20px] top-[34px] -bottom-[10px] w-0.5 ${
            stage.stage_state === 'signed_off' ? 'bg-[var(--color-stage-signed-off)]/40' : 'bg-slate-200'
          }`}
        />
      )}
      <button
        type="button"
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={isBuild ? expanded : undefined}
        aria-label={`${stage.display}. ${meta}`}
        onClick={() => onNavigate(targetForStage(stage.id))}
        className={`relative flex w-full items-start gap-3 rounded-[10px] border px-2.5 py-2 text-left ${
          isActive ? 'border-slate-200 bg-white shadow-sm' : 'border-transparent hover:bg-slate-200/50'
        }`}
      >
        <span
          data-node={kind}
          aria-hidden="true"
          className={`relative z-10 mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${NODE[kind]}`}
        >
          {(kind === 'signed' || kind === 'completed') && (
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {kind === 'current' && <span className="h-2 w-2 rounded-full bg-[var(--color-stage-current)]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-2 text-[13.5px] ${kind === 'later' ? 'font-medium text-slate-500' : 'font-medium text-slate-900'}`}>
            {shortName(stage)}
            {kind === 'current' && (
              <span className="rounded-full bg-[var(--color-stage-current-bg)] px-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-stage-current)]">Now</span>
            )}
            {isBuild && (
              <svg aria-hidden="true" viewBox="0 0 24 24" className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            )}
          </span>
          <span className={`mt-px block text-xs ${kind === 'signed' ? 'text-[var(--color-stage-signed-off)]' : 'text-slate-500'}`}>{meta}</span>
        </span>
      </button>

      {isBuild && expanded && (
        <ul className="mb-1 ml-11 mt-0.5">
          {BUILD_VIEWS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                aria-current={buildView === v.id ? 'page' : undefined}
                onClick={() => onNavigate(targetForBuildView(v.id))}
                className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                  buildView === v.id
                    ? 'bg-[var(--color-stage-current-bg)] font-semibold text-[var(--color-stage-current)]'
                    : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                }`}
              >
                <span>{v.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
