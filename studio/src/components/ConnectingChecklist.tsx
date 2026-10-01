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
    <ul data-testid="connecting-checklist" className="flex-1 space-y-2.5 px-4 py-4">
      {steps.map((step, i) => {
        const active = i === firstPendingIndex
        return (
          <li
            key={step.label}
            data-testid="connecting-step"
            data-step-done={step.done}
            className="flex items-center gap-2"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                step.done
                  ? 'bg-[var(--color-command-ok)] text-white'
                  : active
                    ? 'border-2 border-brand-500'
                    : 'border border-slate-200'
              }`}
            >
              {step.done && '✓'}
            </span>
            <span
              className={`text-xs ${
                step.done ? 'text-slate-400 line-through' : active ? 'font-medium text-slate-800' : 'text-slate-300'
              }`}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
