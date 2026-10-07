import type { PhaseReportResult } from '../../shared/types'
import { Button } from '../ui'
import {
  messageOf, PanelButton, PanelError, PanelSecondaryButton, plural, useScopedState,
} from './activityPanelBits'

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; all: boolean; result: PhaseReportResult; openError: string | null }

const IDLE: State = { kind: 'idle' }
const WRITE_FAILED = 'The report could not be written.'

/** Phase report (spec 0026): writes the stage's HTML report through the plugin and says, in the
 * plugin's own numbers, how many of the stage's documents it found. Nothing runs until a button is
 * pressed — writing a file is not something looking at a screen should do. */
export function PhaseReportPanel({ projectPath, stageId }: { projectPath: string; stageId: string }) {
  const scope = `${projectPath}|${stageId}`
  const [state, setState, isCurrent] = useScopedState<State>(scope, IDLE)
  const running = state.kind === 'running'

  const run = async (all: boolean) => {
    setState({ kind: 'running' })
    try {
      const result = await window.studio.exportPhaseReport(projectPath, stageId, all)
      if (!isCurrent(scope)) return
      const wroteSomething = result.ok && result.reports.length > 0
      setState(wroteSomething ? { kind: 'done', all, result, openError: null } : { kind: 'failed', message: result.error || WRITE_FAILED })
    } catch (err) {
      if (isCurrent(scope)) setState({ kind: 'failed', message: messageOf(err, WRITE_FAILED) })
    }
  }

  const open = async (done: Extract<State, { kind: 'done' }>, path: string) => {
    let openError: string | null = null
    try {
      const opened = await window.studio.openReport(projectPath, path)
      if (!opened.ok) openError = opened.error || 'The report could not be opened.'
    } catch (err) {
      openError = messageOf(err, 'The report could not be opened.')
    }
    if (isCurrent(scope)) setState({ ...done, openError })
  }

  return (
    <div data-testid="phase-report-panel" className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <PanelButton disabled={running} onClick={() => run(false)}>
          {running ? 'Working…' : "Export this stage's report"}
        </PanelButton>
        <PanelSecondaryButton disabled={running} onClick={() => run(true)}>Export all stages</PanelSecondaryButton>
      </div>
      <p className="mt-1 text-xs text-ink-3">Reports stay on this computer; they are not shared with the team.</p>
      {state.kind === 'failed' && <PanelError message={state.message} />}
      {state.kind === 'done' && <ReportResult done={state} onOpen={open} />}
    </div>
  )
}

function ReportResult({
  done, onOpen,
}: { done: Extract<State, { kind: 'done' }>; onOpen: (done: Extract<State, { kind: 'done' }>, path: string) => void }) {
  const { all, result, openError } = done
  const target = all ? result.index : result.reports[0].output
  return (
    <div data-testid="phase-report-result" className="mt-2 space-y-1 text-xs text-ink-2">
      {all ? <AllWritten count={result.reports.length} /> : <OneWritten entry={result.reports[0]} />}
      {target && (
        <Button variant="link" size="sm" onClick={() => onOpen(done, target)}>Open report</Button>
      )}
      {openError && <PanelError message={openError} />}
    </div>
  )
}

function AllWritten({ count }: { count: number }) {
  return <p>{count} {plural(count, 'report', 'reports')} written</p>
}

function OneWritten({ entry }: { entry: PhaseReportResult['reports'][number] }) {
  return (
    <>
      <p>Report written: {entry.found} of {entry.total} {plural(entry.total, 'document', 'documents')} present</p>
      {entry.missing > 0 && (
        <p>Missing: {entry.missingNames.length > 0 ? entry.missingNames.join(', ') : `${entry.missing} not named by the plugin`}</p>
      )}
    </>
  )
}
