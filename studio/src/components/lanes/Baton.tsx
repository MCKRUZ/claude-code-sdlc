// The hand-off baton on the Building→Checking edge (togo-command-center.md §3.1, visual §4):
// one slot per row of `sprint.py status --json`'s `handoffs_open[]`, reading "0006 → Sam · 2
// business days" in `baton-ink` on `baton-bg`, several stacking downwards at 8 px. The glyph is
// the 24 px lane-edge size and the hand-off's words — the slot's whole reason to exist — are
// never truncated: a narrow slot lets them take a second line. ↵ or a click acknowledges through
// the closed argv table (`sprint.py ack --spec ID --by <actor>`); the result is shown verbatim
// under its exit heading, and nothing on screen moves until the host has re-read the sprint.
// Disabled only with a reason: no actor, or a plugin without `sprint-write`. Empty, it renders
// nothing — the lanes keep their shape (`LaneBoard` reserves the slot only while rows exist).
import { useState } from 'react'
import type { ActorInfo, SprintHandoffOpen, SprintVerbRequest, SprintVerbResult } from '../../../shared/types'
import { CAPABILITIES, NO_ACTOR, exitHeading, newerPlugin } from '../../../shared/reasons'
import { businessDays } from '../../../shared/sprintModel'
import { buildSprintVerbArgv, describeArgv } from '../../../shared/sprintVerbArgv'
import { cn } from '../../ui'
import { BatonGlyph } from '../brand/figures'

export const BATON_SOURCE = 'sprint.py status --json · handoffs_open'

/** The slot's words — the plugin's row, in order. */
export function batonLabel(h: SprintHandoffOpen): string {
  return `${h.spec} → ${h.to} · ${businessDays(h.sinceBusinessDays)}`
}

export function ackReason(actor: ActorInfo | null, capabilities: readonly string[]): string | null {
  if (!capabilities.includes(CAPABILITIES.sprintWrite)) return newerPlugin(CAPABILITIES.sprintWrite)
  if (!actor) return NO_ACTOR
  return null
}

export interface BatonProps {
  handoffs: readonly SprintHandoffOpen[]
  actor: ActorInfo | null
  capabilities: readonly string[]
  /** Runs the verb; the host owns the bridge. Resolves with the plugin's verbatim result. */
  onRun: (request: SprintVerbRequest) => Promise<SprintVerbResult>
  /** Called after an exit-0 ack so the host re-reads before anything moves. */
  onAcked?: (spec: string) => void
}

export function Baton({ handoffs, actor, capabilities, onRun, onAcked }: BatonProps) {
  const reason = ackReason(actor, capabilities)
  if (handoffs.length === 0) return null
  return (
    <ul data-testid="baton" className="flex flex-col gap-2" aria-label="Open hand-offs" title={BATON_SOURCE}>
      {handoffs.map((h) => (
        <BatonSlot key={`${h.spec}:${h.to}`} handoff={h} actor={actor} reason={reason} onRun={onRun} onAcked={onAcked} />
      ))}
    </ul>
  )
}

function BatonSlot({ handoff, actor, reason, onRun, onAcked }: { handoff: SprintHandoffOpen; actor: ActorInfo | null; reason: string | null } & Pick<BatonProps, 'onRun' | 'onAcked'>) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SprintVerbResult | null>(null)
  const request: SprintVerbRequest = { verb: 'ack', spec: handoff.spec }
  const preview = actor ? buildSprintVerbArgv(request, actor.name) : null
  const ack = async () => {
    if (reason || busy) return
    setBusy(true)
    try {
      const res = await onRun(request)
      setResult(res)
      if (res.ok) onAcked?.(handoff.spec)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li data-baton-slot="" data-spec={handoff.spec} className="space-y-1">
      <button
        type="button"
        data-write=""
        disabled={reason !== null || busy}
        title={reason ?? (preview?.ok ? `${describeArgv(preview.argv)} · ack ↵` : 'ack ↵')}
        onClick={ack}
        aria-label={`Acknowledge hand-off ${handoff.spec} to ${handoff.to}`}
        className={cn(
          'flex min-h-7 w-full items-center gap-2 rounded-full bg-baton-bg px-2 py-0.5 text-left text-baton-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <BatonGlyph size={24} className="shrink-0 text-baton" />
        <span className="min-w-0 flex-1 whitespace-normal font-mono text-ident leading-4 tabular-nums" data-baton="">{batonLabel(handoff)}</span>
        {busy && <span className="text-[10px] uppercase tracking-wide opacity-70">running…</span>}
        {reason && <span className="sr-only" data-disabled-reason="">{reason}</span>}
      </button>
      {result && (
        <div data-testid="baton-result" data-exit={result.exitCode ?? 'null'} className={cn('rounded-lg border px-2 py-1 text-xs', result.ok ? 'border-status-ok-line bg-status-ok-bg text-status-ok-ink' : result.refused ? 'border-today-late-line bg-today-late-bg text-today-late-ink' : 'border-status-warn-line bg-status-warn-bg text-status-warn-ink')}>
          <p className="font-medium">{exitHeading(result.exitCode)}</p>
          {(result.stdout || result.stderr) && <pre className="mt-0.5 whitespace-pre-wrap font-mono text-code">{[result.stdout, result.stderr].filter(Boolean).join('\n')}</pre>}
        </div>
      )}
    </li>
  )
}
