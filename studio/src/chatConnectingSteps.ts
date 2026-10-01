import type { ChatState, ProjectStatus, StageReadiness } from '../shared/types'
import type { ConnectingStep } from './components/ConnectingChecklist'

/** The three named checklist items ChatPanel shows before its conversation is ready (spec
 * 0018), each tied to one real signal ChatPanel already tracks — never a fake timer. See
 * ChatPanel.tsx's own mount effect comment for how `chatFlow`/`readinessFlow`/`chatSettled`/
 * `initializing` are actually sequenced.
 *
 * Pulled out of ChatPanel.tsx into its own file (PR #76 review finding #8 — that file was over
 * this repo's 400-line soft limit, and this derivation is cohesive on its own, the same way
 * `workflowSteps.ts`'s `computeWorkflowSteps` is) and exported so its logic (findings #3 and #4
 * of that same review) is directly testable as a pure function — `chatSettled` is read from
 * inside the `initializing` branch of ChatPanel's render, so `initializing` itself is always
 * true at that point and cannot discriminate anything; a render-only test can prove the
 * checklist eventually disappears, but not that this specific step's `done` flag was ever
 * actually reachable as `true`, since both findings are about that FLAG's logic, not the final
 * rendered outcome. */
export function connectingSteps(
  state: ChatState | null,
  readiness: StageReadiness | null,
  chatSettled: boolean,
  status: ProjectStatus | null,
  currentDocumentTitle: string | null,
): ConnectingStep[] {
  // Finding #4: a FAILED readiness read (`{ ok: false, error }`) must not read as a completed
  // step — the same `.ok` guard ChatPanel's own `currentDocumentTitle` already applies.
  const readinessOk = readiness !== null && readiness.ok
  return [
    { label: 'Connecting to Claude Code', done: state !== null },
    { label: `Reading ${status?.project_name ?? 'the project'}`, done: state !== null && readinessOk },
    // Finding #3: driven by `chatSettled` (set once the chat flow, including any needed first
    // turn, has actually finished), never by `initializing` — and finding #4's own follow-on:
    // also gated on `readinessOk`, or this would read done despite a failed readiness read.
    { label: `Loading ${currentDocumentTitle ?? 'the current file'}`, done: chatSettled && readinessOk },
  ]
}
