import { useRef, useState } from 'react'
import { Segmented } from '../ui'
import { useEnter } from '../motion/useEnter'
import { FoundationView } from './ExplainFoundation'
import { ScorecardView } from './ExplainScorecard'
import { GatesView } from './ExplainGates'

type ExplainView = 'foundation' | 'scorecard' | 'gates'

const VIEWS: { value: ExplainView; label: string }[] = [
  { value: 'foundation', label: 'What Build inherited' },
  { value: 'scorecard', label: 'How Build is going' },
  { value: 'gates', label: 'Checks and gates' },
]

/** Three read-only screens (spec 0013): what Build inherited, how Build is going, and every
 * check a change must pass.
 *
 * Nothing here writes anything, and nothing here computes anything. Every scorecard number is
 * the plugin's, every gate description is the rails guide's, and what Foundation delivered is
 * read from those documents — Studio doing its own arithmetic on delivery measures is the
 * failure this spec names first, because a number nobody can trace is worse than no number in
 * a steering meeting.
 *
 * The rule that shapes most of the code below: NO DATA IS NOT ZERO. "Nobody has merged
 * anything yet" and "everything merged was rejected" are opposite situations, and a zero shows
 * them identically. Every measure says which it is, and what would produce data.
 *
 * The pill is a `Segmented tone=inverse`, which keeps the literal `bg-slate-900 text-white` on
 * the chosen view the e2e suite already knows. */
export function ExplainViews({ projectPath }: { projectPath: string }) {
  const [view, setView] = useState<ExplainView>('foundation')
  const root = useRef<HTMLDivElement>(null)
  useEnter(root, 'rise', { key: `${projectPath}|${view}` })

  return (
    <div ref={root} className="space-y-5">
      <Segmented<ExplainView> label="Explain view" tone="inverse" options={VIEWS} value={view} onChange={setView} />
      {view === 'foundation'
        ? <FoundationView projectPath={projectPath} />
        : view === 'scorecard'
          ? <ScorecardView projectPath={projectPath} />
          : <GatesView projectPath={projectPath} />}
    </div>
  )
}
