import { Check } from 'lucide-react'
import { cn, Icon } from '../ui'

/** The named sequence `ChatPanel` shows before its conversation is ready (spec 0018), replacing
 * what used to be an inert-looking "Starting the conversation…" line.
 *
 * Every item's `done` flag is driven off a REAL signal ChatPanel already has — never a timer.
 * Two items here (`Connecting to Claude Code` and the project read) can finish in either order,
 * since they come from two independent calls; the last (`Loading <file>`) only ever finishes once
 * BOTH of those — and, when it was needed, the model's own first turn — have, so it can never
 * read as done before the other two. See ChatPanel.tsx's own comment on `initializing` for the
 * exact wiring this renders. */
export interface ConnectingStep {
  label: string
  done: boolean
}

export function ConnectingChecklist({ steps }: { steps: ConnectingStep[] }) {
  // The first not-yet-done item is "active" (in progress); anything after it is still queued.
  // Purely a presentation detail — it never decides what IS done, only how a not-done item reads.
  const firstPendingIndex = steps.findIndex((s) => !s.done)

  return (
    <ul data-testid="connecting-checklist" aria-busy="true" className="flex-1 space-y-2.5 px-4 py-4">
      {steps.map((step, i) => {
        const active = i === firstPendingIndex
        return (
          // The index, not `step.label` — two of these three labels embed dynamic data (the
          // project's name, the current document's title) that changes mid-sequence as real
          // calls resolve. Keying by the label text means that change IS a key change, so React
          // discards and remounts the row instead of diffing it in place, flickering the
          // checkmark/circle exactly during the sequence this component exists to make feel
          // smooth. The steps array is a fixed-length, fixed-order triple (see ChatPanel.tsx's
          // own `connectingSteps`), so the index is a genuinely stable identity here.
          <li
            key={i}
            data-testid="connecting-step"
            data-step-done={step.done}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                // Done is the ok fill; active is a thin accent ring with no pulse (motion is
                // evidence, and nothing has happened yet); queued is a hairline (G4-17).
                step.done
                  ? 'bg-status-ok-fill text-white'
                  : active
                    ? 'border-[1.5px] border-accent-600'
                    : 'border border-line-2',
              )}
            >
              {step.done && <Icon icon={Check} size={14} className="scale-75" />}
            </span>
            <span
              className={cn(
                'text-xs',
                // A done label recedes to ink-4; the tick already says done, so no strike-through.
                step.done ? 'text-ink-4' : active ? 'font-medium text-ink-1' : 'text-ink-4',
              )}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
