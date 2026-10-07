// After every verb the focus lands on the card or row that changed, or on the first needs-you
// item (togo-command-center.md §3.1, §4; Q4). A `FocusPlan` names the target by the plugin's own
// ids (`data-spec`, `data-decision`) — never by position — and `returnFocus` tries the screen's
// selectors in order, then the first `[data-needs-you-item]`, then the root. Focus is not an
// animation: it moves synchronously, the scroll is `block: 'nearest'` and instant, the same
// under full motion, reduced motion and test — end state = cold reload. No IPC, no store.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { SprintVerbRequest } from '../../shared/types'

export type SpecWhere = 'lane' | 'refining' | 'slate' | 'backlog' | 'close' | 'any'

export type FocusPlan =
  | { kind: 'spec'; spec: string; where?: SpecWhere }
  | { kind: 'decision'; id: string }
  | { kind: 'sprint'; sprint: string }
  | { kind: 'needs-you' }
  | { kind: 'selector'; selector: string }

const esc = (v: string) => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&'))

/** The selectors a plan tries, most specific first. Every one keys on a plugin id. */
export function focusSelectors(plan: FocusPlan): string[] {
  switch (plan.kind) {
    case 'spec': {
      const id = esc(plan.spec)
      const by: Record<SpecWhere, string[]> = {
        lane: [`[data-lane-card][data-spec="${id}"]`],
        refining: [`[data-testid="refining-row"][data-spec="${id}"] [data-refine]`, `[data-testid="refining-row"][data-spec="${id}"]`],
        slate: [`li[data-spec="${id}"][data-order]`],
        backlog: [`li[data-spec="${id}"][data-dor]`],
        close: [`[data-testid="close-row"][data-spec="${id}"]`],
        any: [],
      }
      const where = plan.where ?? 'any'
      const ordered = where === 'any' ? [...by.lane, ...by.refining, ...by.slate, ...by.backlog, ...by.close] : by[where]
      return [...ordered, `[data-spec="${id}"]`]
    }
    case 'decision': return [`[data-decision="${esc(plan.id)}"] button:not([disabled])`, `[data-decision="${esc(plan.id)}"]`]
    case 'sprint': return [`[data-sprint="${esc(plan.sprint)}"]`, '[data-testid="sprint-header"]', 'h1']
    case 'needs-you': return ['[data-needs-you-item] button:not([disabled])', '[data-needs-you-item]']
    case 'selector': return [plan.selector]
  }
}

/** The plan a verb implies: the spec it touched; a sprint verb → the sprint; nothing → needs-you. */
export function focusPlanFor(req: SprintVerbRequest): FocusPlan {
  if ('spec' in req && typeof req.spec === 'string') return { kind: 'spec', spec: req.spec }
  if (req.verb === 'slate' && req.specs.length > 0) return { kind: 'spec', spec: req.specs[0], where: 'slate' }
  if ('sprint' in req) return { kind: 'sprint', sprint: req.sprint }
  return { kind: 'needs-you' }
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

/** The element to focus for a hit: itself when focusable, else its first focusable child, else
 * itself made programmatically focusable (`tabindex="-1"`) — a row is still a landing place. */
export function focusableFor(el: HTMLElement): HTMLElement {
  if (el.matches(FOCUSABLE)) return el
  const inner = el.querySelector<HTMLElement>(FOCUSABLE)
  if (inner) return inner
  el.setAttribute('tabindex', '-1')
  return el
}

/** Resolve a plan inside `root`: the first selector that hits, then the needs-you fallback. */
export function focusTargetFor(root: ParentNode, plan: FocusPlan): HTMLElement | null {
  const tries = [...focusSelectors(plan), ...(plan.kind === 'needs-you' ? [] : focusSelectors({ kind: 'needs-you' }))]
  for (const sel of tries) {
    const hit = root.querySelector<HTMLElement>(sel)
    if (hit) return focusableFor(hit)
  }
  return null
}

/** Move focus now. Instant under every motion tier (focus is accessibility, not ceremony). The
 * root itself is the last resort so the keyboard never falls back to `<body>`. */
export function returnFocus(root: HTMLElement | null, plan: FocusPlan): HTMLElement | null {
  if (!root) return null
  const target = focusTargetFor(root, plan) ?? focusableFor(root)
  target.focus({ preventScroll: true })
  if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  return target
}

export interface FocusReturnApi {
  /** Queue a plan; it is applied once `readyKey` next changes (the refreshed read landed). */
  schedule(plan: FocusPlan): void
  /** The queued plan, for a test or a host that wants to show where focus will go. */
  pending: FocusPlan | null
  /** Apply a plan now, bypassing the queue (a dialog's Esc → back to its opener). */
  now(plan: FocusPlan): HTMLElement | null
}

/** The hook: `schedule(plan)` after a verb's exit 0; when `readyKey` changes (the host's
 * refreshed document) the plan is applied ONCE and cleared. Nothing moves before the read. */
export function useFocusReturn(rootRef: MutableRefObject<HTMLElement | null>, readyKey: unknown): FocusReturnApi {
  const [pending, setPending] = useState<FocusPlan | null>(null)
  const armedFor = useRef<unknown>(readyKey)
  const schedule = useCallback((plan: FocusPlan) => { armedFor.current = readyKey; setPending(plan) }, [readyKey])
  useEffect(() => {
    if (!pending || readyKey === armedFor.current) return
    returnFocus(rootRef.current, pending)
    setPending(null)
  }, [pending, readyKey, rootRef])
  const now = useCallback((plan: FocusPlan) => returnFocus(rootRef.current, plan), [rootRef])
  return { schedule, pending, now }
}
