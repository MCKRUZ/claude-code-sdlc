import type { SprintReportKind } from '../../shared/types'
import { messageOf, PANEL_BUTTON, PANEL_SECONDARY_BUTTON, PanelError, useScopedState } from './activityPanelBits'

type PagesState =
  | { kind: 'idle' }
  | { kind: 'running'; page: SprintReportKind }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; page: SprintReportKind; relOutput: string; openError: string | null }

const PAGES_IDLE: PagesState = { kind: 'idle' }
const PAGE_LABEL: Record<SprintReportKind, string> = { planning: 'Planning page', review: 'Review page' }

/** Writes a page through the plugin, then opens it with the system's default program (the same
 * `openReport` the phase report uses, which refuses anything outside .sdlc/reports/). Nothing
 * runs until a button is pressed — writing a file is not something looking at a screen should do.
 *
 * Unchanged by the Observatory pass on purpose: the sprint spec pins these two buttons (with
 * Refresh) as the ONLY buttons inside the board, so they keep the panel's own button strings
 * rather than joining the kit — a kit Button adds nothing here but a second place to drift. */
export function SprintPages({ projectPath, sprintId }: { projectPath: string; sprintId: string }) {
  const scope = `${projectPath}|${sprintId}`
  const [state, setState, isCurrent] = useScopedState<PagesState>(scope, PAGES_IDLE)
  const running = state.kind === 'running'

  const write = async (page: SprintReportKind) => {
    setState({ kind: 'running', page })
    try {
      const written = await window.studio.renderSprintReport(projectPath, sprintId, page)
      if (!isCurrent(scope)) return
      if (!written.ok) { setState({ kind: 'failed', message: written.error || 'The sprint page could not be written.' }); return }
      let openError: string | null = null
      try {
        const opened = await window.studio.openReport(projectPath, written.relOutput)
        if (!opened.ok) openError = opened.error || 'The page could not be opened.'
      } catch (err) {
        openError = messageOf(err, 'The page could not be opened.')
      }
      if (isCurrent(scope)) setState({ kind: 'done', page, relOutput: written.relOutput, openError })
    } catch (err) {
      if (isCurrent(scope)) setState({ kind: 'failed', message: messageOf(err, 'The sprint page could not be written.') })
    }
  }

  return (
    <div data-testid="sprint-pages" className="text-xs text-ink-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={running} onClick={() => write('planning')} className={PANEL_BUTTON}>
          {state.kind === 'running' && state.page === 'planning' ? 'Working…' : PAGE_LABEL.planning}
        </button>
        <button type="button" disabled={running} onClick={() => write('review')} className={PANEL_SECONDARY_BUTTON}>
          {state.kind === 'running' && state.page === 'review' ? 'Working…' : PAGE_LABEL.review}
        </button>
      </div>
      <p className="mt-1 text-ink-3">Reports stay on this computer; they are not shared with the team.</p>
      {state.kind === 'failed' && <PanelError message={state.message} />}
      {state.kind === 'done' && (
        <p data-testid="sprint-page-result" className="mt-1">{PAGE_LABEL[state.page]} written: <span className="font-mono">{state.relOutput}</span></p>
      )}
      {state.kind === 'done' && state.openError && <PanelError message={state.openError} />}
    </div>
  )
}
