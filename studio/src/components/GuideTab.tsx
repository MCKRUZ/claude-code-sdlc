import { useEffect, useState } from 'react'
import type { StageGuide, StageReadiness } from '../../shared/types'
import { slashCommand } from '../workflowSteps'
import { MarkdownView } from './MarkdownView'

const NO_GUIDANCE = 'No guidance file for this stage'

/** The stage's own guidance (spec 0024): the plugin's phase definition file, drawn as markdown,
 * and every activity the plugin declares for the stage with its command — including the ones the
 * Workflow tab draws no control for, so no command is unreachable by knowing its name. Read-only. */
export function GuideTab({ readiness }: { readiness: StageReadiness }) {
  return (
    <div data-testid="guide-tab" className="space-y-6">
      <GuideText definition={readiness.definition ?? null} />
      <ActivityCommands readiness={readiness} />
    </div>
  )
}

/** The reply for one definition path. Kept with the path it was asked for, so a reply that lands
 * after the stage changed is never drawn under the new stage. */
interface Loaded {
  definition: string
  guide: StageGuide
}

function GuideText({ definition }: { definition: string | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (definition === null) return
    let cancelled = false
    window.studio.getStageGuide(definition)
      .then((guide) => { if (!cancelled) setLoaded({ definition, guide }) })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : 'The guidance could not be read.'
        if (!cancelled) setLoaded({ definition, guide: { ok: false, error } })
      })
    return () => { cancelled = true }
  }, [definition])

  if (definition === null) return <p className="text-sm text-slate-400">{NO_GUIDANCE}</p>
  if (loaded?.definition !== definition) return <p className="text-sm text-slate-400">Reading the guidance…</p>
  if (!loaded.guide.ok || loaded.guide.markdown === undefined) {
    return <p className="text-sm text-slate-400">{NO_GUIDANCE}</p>
  }
  return (
    <div data-testid="guide-markdown" className="rounded-xl border border-slate-200 bg-white p-4">
      <MarkdownView source={loaded.guide.markdown} />
    </div>
  )
}

function ActivityCommands({ readiness }: { readiness: StageReadiness }) {
  const activities = readiness.activities ?? []
  if (activities.length === 0) return null
  return (
    <section aria-labelledby="guide-activities-title">
      <h3 id="guide-activities-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Everything you can do in this stage
      </h3>
      <ul className="mt-2 space-y-1">
        {activities.map((a) => (
          <li key={a.id} data-testid="guide-activity" data-activity-id={a.id} className="text-sm text-slate-800">
            {a.label}
            {a.command && <> <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">{slashCommand(a.command)}</code></>}
          </li>
        ))}
      </ul>
    </section>
  )
}
