// The spec card's foot (togo-command-center.md §3.3, visual §4): "Hand off" is enabled iff the
// plugin's dry run says so (`handoff.py --check` → `handoffCheck.ok`); otherwise it is disabled
// with `refusal.message` VERBATIM (`not_ready`, `unknown_developer`, `developer_is_checker`,
// `team_at_limit`). When no dry run answered — no developer named yet, so `handoff.py --check`
// had nobody to check, or a plugin without `handoff-check` — the checker's own first MUST line
// (`spec_readiness.py`'s `blocking[].message`) is the reason: the plugin's sentence for why a
// hand-off would be refused, so nobody is sent to click into a refusal. With nothing blocking
// and no dry run the button is enabled and the live refusal lands after, in the plugin's words;
// the foot SAYS so (never sr-only). The caption is `reasons.ONE_SPEC_ONE_BRANCH`. Sticky, 64 px,
// `surface-1`, hairline above.
import { Hand } from 'lucide-react'
import type { HandOffCheck, SourcedBlock } from '../../../shared/types'
import { CAPABILITIES, newerPlugin, ONE_SPEC_ONE_BRANCH } from '../../../shared/reasons'
import { Button } from '../../ui'

export const HAND_OFF = 'Hand off'
export const DOR_BLOCKS = 'the DoR still blocks the hand-off'
export const LIVE_DECIDES = 'the live hand-off decides'

/** Why the button is disabled, or null when it is enabled. The plugin's sentence, never ours:
 * the dry run's refusal when one answered; else the checker's first blocking line. */
export function handOffDisabledReason(check: SourcedBlock<HandOffCheck> | null, hasCheckCapability: boolean, blocking: readonly string[] = []): string | null {
  if (hasCheckCapability && check && check.ok && check.data) return check.data.ok ? null : check.data.refusal.message
  // The read failed or never ran: the checker's own verdict stands in, verbatim.
  if (blocking.length > 0) return blocking[0]
  return null
}

export interface HandoffFootProps {
  check: SourcedBlock<HandOffCheck> | null
  hasCheckCapability?: boolean
  /** `spec_readiness.py`'s `blocking[].message` lines, verbatim; the first is the reason when no dry run answered. */
  blocking?: readonly string[]
  /** The readiness block's source, named under a DoR-grounded reason. */
  readinessSource?: string
  /** The spec is already in flight or merged: the foot states that instead of offering a hand-off. */
  status: string
  onHandOff: () => void
}

export function HandoffFoot({ check, hasCheckCapability = true, blocking = [], readinessSource, status, onHandOff }: HandoffFootProps) {
  const reason = handOffDisabledReason(check, hasCheckCapability, blocking)
  const fromDryRun = hasCheckCapability && check?.ok && check.data ? !check.data.ok : false
  const would = check?.data?.ok ? check.data.would : null
  const past = status === 'in-flight' || status === 'merged'
  return (
    <footer data-testid="handoff-foot" className="sticky bottom-0 -mx-6 -mb-6 flex h-16 items-center justify-between gap-4 border-t border-line-1 bg-surface-1 px-6 rounded-b-[20px]">
      <div className="min-w-0 text-xs text-ink-3">
        <p>{ONE_SPEC_ONE_BRANCH}</p>
        {past ? (
          <p className="text-ink-2">already {status}{would?.branch ? ` · ${would.branch}` : ''}</p>
        ) : would ? (
          <p className="truncate font-mono text-ident text-ink-2" data-testid="handoff-would">
            {would.branch} · {would.developer}{would.checker ? ` · checker ${would.checker}` : ''}{would.team ? ` · ${would.team}` : ''}{would.inFlightAfter !== null ? ` · in flight after: ${would.inFlightAfter}` : ''}
          </p>
        ) : reason && !fromDryRun ? (
          <p className="truncate" data-testid="handoff-grounds">{DOR_BLOCKS} · <span className="font-mono text-ident">{readinessSource ?? 'spec_readiness.py --spec --json'}</span></p>
        ) : reason ? (
          <p className="truncate font-mono text-ident" data-testid="handoff-grounds">{check?.source}</p>
        ) : (
          <p className="truncate" data-testid="handoff-grounds">
            {hasCheckCapability ? (check?.source ?? LIVE_DECIDES) : <>{newerPlugin(CAPABILITIES.handoffCheck)} · {LIVE_DECIDES}</>}
          </p>
        )}
      </div>
      {!past && (
        <Button variant="primary" icon={Hand} data-write="" disabled={reason !== null} disabledReason={reason ?? undefined} onClick={onHandOff}>
          {HAND_OFF}
        </Button>
      )}
    </footer>
  )
}
