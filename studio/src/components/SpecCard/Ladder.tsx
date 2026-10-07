// The checking ladder (togo-command-center.md §3.3, visual §4/§5): rungs = the plugin's
// `ladder.rungs[]` verbatim, each joined by the FIXED table in `shared/ladderJoin.ts` to one host
// field. The disc is coloured ONLY by the host's conclusion word (`rung-pass` / `rung-fail` /
// `rung-pending`), `rung-none` is the hollow ring beside the words "no data" — the correctness rung
// is always this — and the failing rung carries the plugin's `waiting_on` as its reason. Icons name
// the rung's kind and never change colour by themselves. "gated path: not declared" when the
// frontmatter does not say otherwise.
import { CheckCheck, ScanSearch, Shield, ShieldAlert, ShieldCheck, UserCheck, Workflow, type LucideIcon } from 'lucide-react'
import type { RosterPerson, SpecLadder, SpecStatus } from '../../../shared/types'
import { gatedPathLabel, joinLadder, type LadderRow, type RungKind, type RungState } from '../../../shared/ladderJoin'
import { newerPlugin, NO_DATA } from '../../../shared/reasons'
import { Eyebrow, Icon, cn } from '../../ui'

export const LADDER_TITLE = 'Checking ladder'

const DISC: Record<RungState, string> = {
  pass: 'bg-rung-pass border-rung-pass',
  fail: 'bg-rung-fail border-rung-fail',
  pending: 'bg-rung-pending border-rung-pending',
  none: 'bg-transparent border-rung-none',
}

const STATE_WORD: Record<RungState, string> = { pass: 'passed', fail: 'failed', pending: 'in progress', none: NO_DATA }

function iconFor(kind: RungKind, state: RungState): LucideIcon {
  switch (kind) {
    case 'ci': return Workflow
    case 'grader': return ScanSearch
    case 'correctness': return CheckCheck
    case 'security': return state === 'pass' ? ShieldCheck : state === 'fail' ? ShieldAlert : Shield
    case 'approval':
    case 'signoff': return UserCheck
    default: return CheckCheck
  }
}

export interface LadderProps {
  ladder: SpecLadder | null
  /** Why there is no ladder (block error) — shown instead of rungs; null for the capability line. */
  ladderError?: string | null
  status: Pick<SpecStatus, 'pull_request'> | null
  roster?: readonly RosterPerson[] | null
  /** Whether the plugin declares `readiness-all` (which also means `ladder[]` exists). */
  hasLadderCapability?: boolean
}

export function Ladder({ ladder, ladderError = null, status, roster, hasLadderCapability = true }: LadderProps) {
  const rows: LadderRow[] = ladder ? joinLadder(ladder.rungs, status, roster) : []
  return (
    <section aria-label={LADDER_TITLE} data-testid="spec-ladder" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow as="h3">{LADDER_TITLE}{ladder ? <span className="ml-2 font-mono normal-case tracking-normal text-ink-2">{ladder.tier}</span> : null}</Eyebrow>
        <span className="text-xs text-ink-3" data-testid="gated-path">{gatedPathLabel(ladder?.touchesGatedPath)}</span>
      </div>
      {!ladder ? (
        <p className="text-xs text-ink-3" data-testid="ladder-empty">{!hasLadderCapability ? newerPlugin('readiness-all') : ladderError ?? NO_DATA}</p>
      ) : (
        <ol className="relative ml-1.5 border-l-2 border-rung-rail pl-5" aria-label={`${LADDER_TITLE} rungs`}>
          {rows.map((r, i) => (
            <li key={`${r.rung}-${i}`} className="relative min-h-10 pb-4 last:pb-0" data-rung={r.kind} data-rung-state={r.state} data-state={r.state}>
              <span aria-hidden="true" className={cn('absolute -left-[27px] top-1 block h-3 w-3 rounded-full border-2', DISC[r.state])} />
              <div className="flex items-start gap-2">
                <Icon icon={iconFor(r.kind, r.state)} size={16} className="mt-0.5 text-ink-3" />
                <div className="min-w-0">
                  <p className="text-sm text-ink-1">{r.rung}</p>
                  <p className="text-xs text-ink-2">
                    <span className={cn('font-medium', r.state === 'none' && 'text-ink-3')}>{STATE_WORD[r.state]}</span>
                    {r.detail !== STATE_WORD[r.state] && <span className="text-ink-2"> · {r.detail}</span>}
                  </p>
                  {r.reason && <p className="mt-0.5 text-xs text-status-error-ink" data-rung-reason="">{r.reason}</p>}
                  <p className="mt-0.5 font-mono text-[10px] text-ink-3" aria-label="source">{r.field}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
