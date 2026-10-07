import type { BuildBriefResult } from '../../shared/types'
import { Notice } from '../ui'
import { plural } from './activityPanelBits'

type Built = Extract<BuildBriefResult, { ok: true }>

/** What the plugin reported after writing the brief, in its own numbers and words. */
export function BriefResultView({ result }: { result: Built }) {
  const { contradictionsOnPage: c, questionsOnPage: q } = result
  return (
    <Notice tone="ok" role="status" data-testid="brief-result" title={`Brief written: ${result.path}`}>
      <div className="space-y-1">
        <p>{`${c} ${plural(c, 'contradiction', 'contradictions')} and ${q} ${plural(q, 'question', 'questions')} on the page`}</p>
        {result.emailedInstead.length > 0 && <p>{`Emailed instead: ${result.emailedInstead.join(', ')}`}</p>}
        {result.notes.map((note) => <p key={note}>{note}</p>)}
        {result.lint.map((l) => <p key={`${l.line}:${l.message}`}>{`Line ${l.line}: ${l.message}`}</p>)}
      </div>
    </Notice>
  )
}
