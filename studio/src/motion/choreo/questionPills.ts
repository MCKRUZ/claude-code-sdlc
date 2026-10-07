// Row #14 — Chat question pills / proposal resolve. Pills slide in when a message with
// `questions[]` renders; when `onResolveProposal` returns, the accepted card flashes `status-ok`
// and collapses (a Flip on the list is the caller's, via `useFlipGroup`), a discarded one dims.
import type { Choreo } from '../contract'
import { fadeDuration, present, timelineFor, transformsAllowed } from './_shared'

export interface QuestionPillsRefs {
  pills: ReadonlyArray<Element | null>
}

export const questionPills: Choreo<QuestionPillsRefs> = {
  name: 'questionPills',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    const pills = present(refs.pills)
    if (pills.length === 0) return tl
    const x = transformsAllowed(ctx) ? 6 : 0
    return tl.fromTo(pills, { x, opacity: 0 }, { x: 0, opacity: 1, duration: fadeDuration(ctx, 0.18), stagger: 0.04, clearProps: 'transform' })
  },
}

export interface ProposalResolveRefs {
  card: Element | null
  accepted: boolean
  /** Resolved `status-ok` line colour; the row never reads a CSS variable itself. */
  okColor?: string
}

export const proposalResolve: Choreo<ProposalResolveRefs> = {
  name: 'proposalResolve',
  play(ctx, refs) {
    const tl = timelineFor(ctx)
    if (!refs.card) return tl
    if (!refs.accepted) return tl.to(refs.card, { opacity: 0.4, duration: fadeDuration(ctx, ctx.durations['dur-2']) })
    if (refs.okColor && ctx.enabled) tl.to(refs.card, { borderColor: refs.okColor, duration: ctx.durations['dur-1'] }, 0)
    tl.to(refs.card, { opacity: 0, duration: fadeDuration(ctx, ctx.durations['dur-2']) }, 0.12)
    if (transformsAllowed(ctx)) tl.to(refs.card, { height: 0, marginTop: 0, marginBottom: 0, duration: ctx.durations['dur-3'], ease: ctx.eases['dur-4'] }, 0.12)
    return tl
  },
}
