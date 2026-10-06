// F11 (studio-observatory.md §3 #30, §7 WorkflowTab row): the picked "Also in this stage"
// activity opens in WorkflowTab's RIGHT (main) slot instead of unfolding inside its own row in
// the narrow `sm:w-72` column — a sprint board or an intake catalogue needs the width the live
// document panel already has. The host itself is dumb on purpose: the activity row stays the
// plugin's (`StageActivity`), the panel stays whatever ActivitiesPanel builds today, and this
// only frames it with a heading and a way back.
//
// Coordination without a shared parent: ActivitiesPanel (owned by the chat/activities package)
// renders its panels inline today and has no selection callback. `FocusedActivityContext` is
// the hand-off — WorkflowTab provides it around the left column; a panel row that finds it via
// `useFocusedActivity()` calls `focus(activity, panel)` instead of rendering inline, and a row
// that finds `null` (standalone, older tree) behaves exactly as before. No prop has to exist on
// ActivitiesPanel for this file to compile, so the two packages can land in either order.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { StageActivity } from '../../shared/types'
import type { FocusedActivityHostProps } from '../ui'
import { BackLink, Card, Eyebrow } from '../ui'
import { useEnter } from '../motion/useEnter'
import { slashCommand } from '../workflowSteps'

/** What WorkflowTab keeps while an activity is open in the main slot. */
export interface FocusedActivity {
  activity: StageActivity
  /** The panel exactly as ActivitiesPanel would have rendered it inline. */
  panel: ReactNode
}

export interface FocusedActivityBridge {
  /** The id currently hosted, so a row can mark itself as the open one (and not render twice). */
  focusedId: string | null
  focus: (activity: StageActivity, panel: ReactNode) => void
  close: () => void
}

export const FocusedActivityContext = createContext<FocusedActivityBridge | null>(null)

/** `null` means "no host above you — render inline as before". */
export function useFocusedActivity(): FocusedActivityBridge | null {
  return useContext(FocusedActivityContext)
}

export const FOCUSED_ACTIVITY_BACK = '← Back to Workflow'

export function FocusedActivityHost({ activity, onClose, children }: FocusedActivityHostProps<StageActivity>) {
  const root = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  // Row #3 on the slot's own root: the main slot is what changed, not the whole StageHome.
  useEnter(root, 'rise', { key: activity.id })

  // The panel replaced what the person was reading; focus follows it (§6.3) so a keyboard user
  // is not left on the row they clicked in the other column. Programmatic focus shows no ring.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [activity.id])

  return (
    <section
      ref={root}
      data-testid="focused-activity-host"
      data-activity-id={activity.id}
      aria-labelledby="focused-activity-title"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-1 pb-3">
        <div className="min-w-0">
          <BackLink label={FOCUSED_ACTIVITY_BACK} onClick={onClose} className="font-medium" />
          <Eyebrow as="span" className="mt-1 block">Also in this stage</Eyebrow>
          <h3 id="focused-activity-title" ref={heading} tabIndex={-1} className="mt-0.5 truncate text-sm font-semibold text-ink-1">
            {activity.label}
            {activity.command && (
              <> <code className="rounded bg-surface-2 px-1 py-0.5 text-xs font-normal text-ink-2">{slashCommand(activity.command)}</code></>
            )}
          </h3>
        </div>
      </div>
      <Card padding="md">{children}</Card>
    </section>
  )
}
