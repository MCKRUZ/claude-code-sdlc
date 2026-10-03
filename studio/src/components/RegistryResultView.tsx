import type { RegistryResult } from '../../shared/types'
import { PanelError, plural } from './activityPanelBits'

export const OVER_BUDGET_NOTE = 'The index is over its budget even with ids alone; it was written in full.'

/** What "Write the registry and index" did, as the script reported it. A failure is one line and no
 * counts: a number beside an error would read as a result. */
export function RegistryResultView({ result }: { result: RegistryResult }) {
  if (!result.ok) return <PanelError message={result.error || 'The registry could not be written.'} />
  const { documents, summarised, missingSummaries, trimmed, indexWithinBudget, warnings } = result
  return (
    <div data-testid="registry-result" className="space-y-1 text-xs text-slate-700">
      <p className="font-medium text-slate-800">
        {documents} {plural(documents, 'document', 'documents')}, {summarised} summarised
      </p>
      {missingSummaries.length > 0 && <p>Not yet summarised: {missingSummaries.join(', ')}</p>}
      {trimmed.length > 0 && <p>Shortened to fit the index: {trimmed.join(', ')}</p>}
      {!indexWithinBudget && <p>{OVER_BUDGET_NOTE}</p>}
      {warnings.map((warning) => <p key={warning} className="text-slate-500">{warning}</p>)}
    </div>
  )
}
