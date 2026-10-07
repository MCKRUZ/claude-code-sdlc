import { useEffect, useState } from 'react'
import { StatusDot } from '../ui'

/** How long the model can go without starting a new step before the line says so. A real model
 * turn regularly spends this long writing one long reply, which emits nothing until it is whole —
 * so silence this long is usually normal, and the panel should say that rather than look hung. */
export const SILENT_HINT_AFTER_SECONDS = 20

/** The wording only — pure, so every state the line can be in is testable without a clock. */
export function activityText(label: string | null, elapsedSeconds: number): string {
  return `${label ? `${label}…` : 'Thinking…'} ${elapsedSeconds}s`
}

export function silenceHint(silentSeconds: number): string | null {
  return silentSeconds >= SILENT_HINT_AFTER_SECONDS
    ? `No new step for ${silentSeconds}s — the assistant is probably writing a long reply.`
    : null
}

/** Replaces the bare "Thinking…" shown while a chat turn runs. Mounted only while a turn is in
 * flight, so mounting IS the start of the clock — no reset logic to get wrong. The label comes
 * from the main process (`onChatActivity`), filtered to the stage this panel is showing; the
 * running seconds are what separates "working" from "stuck" when no new step arrives.
 *
 * The text IS the indicator: the §4 #13 typing dots would add characters to `textContent`, which
 * `chatActivityLine.test.tsx` pins exactly ("Thinking… 0s"), so the only motion here is the CSS
 * pulse on the dot beside it (`aria-hidden`, gated by `motion-safe`). */
export function ChatActivityLine({ projectPath, stageId }: { projectPath: string; stageId: string }) {
  const [label, setLabel] = useState<string | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [lastStepAt, setLastStepAt] = useState(startedAt)
  const [now, setNow] = useState(startedAt)

  useEffect(() => window.studio.onChatActivity((activity) => {
    if (activity.projectPath !== projectPath || activity.stageId !== stageId) return
    setLabel(activity.label)
    setLastStepAt(Date.now())
  }), [projectPath, stageId])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hint = silenceHint(Math.floor((now - lastStepAt) / 1000))
  return (
    <div role="status" aria-live="polite" data-testid="chat-activity" className="flex items-start gap-2 text-xs text-ink-3">
      <StatusDot status="running" pulse className="mt-1" />
      <div>
        <p>{activityText(label, Math.floor((now - startedAt) / 1000))}</p>
        {hint && <p className="mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}
