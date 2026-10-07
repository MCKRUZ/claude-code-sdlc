// Planning — right column, "What the plugin says" (togo-command-center.md §3.2). The column's
// PURPOSE leads: "The plugin proposes" (the deterministic `slate --json proposal[]`, labelled
// id-order fill, with "Apply proposal" → one `slate{specs}`; a Claude-REASONED slate present and
// disabled, `reasons.REASONED_SLATE`) and "Commit the sprint", which runs the verbs in order and
// shows each step's exit — both above the fold. Then the plugin's words, verbatim:
// `readiness.gaps[]` GROUPED by the gap line (one sentence, the ids under it — the same DoR line
// repeated per spec is a wall nobody reads), `dependency_gaps[]`, `mix_warnings[]`. Over target,
// the reason field for `--override --reason` is offered — the plugin, not this column, decides.
import { useState } from 'react'
import { Flag } from 'lucide-react'
import type { SlateProposal, SprintView } from '../../../shared/types'
import { REASONED_SLATE, WAITING_FOR_PLUGIN_ANSWER } from '../../../shared/reasons'
import { dorChipTone } from '../../../shared/sprintModel'
import { Button, Chip, Eyebrow, Textarea } from '../../ui'
import type { CommitStep } from './commitSprint'
import { overTarget, riskTone } from './planningModel'

export const APPLY_PROPOSAL = 'Apply proposal'
export const COMMIT_SPRINT = 'Commit the sprint'
export const PROPOSAL_LABEL = 'deterministic · id-order fill · sprint.py slate --json'

/** The gap lines grouped: each DISTINCT sentence once, verbatim, with the spec ids that carry it,
 * in first-seen order. A grouping only — nothing is counted or reworded. */
export function groupGaps(gaps: ReadonlyArray<{ spec: string; gaps: readonly string[] }>): Array<{ line: string; specs: string[] }> {
  const out = new Map<string, string[]>()
  for (const g of gaps) {
    for (const line of g.gaps) {
      const specs = out.get(line) ?? []
      if (!specs.includes(g.spec)) specs.push(g.spec)
      out.set(line, specs)
    }
  }
  return [...out.entries()].map(([line, specs]) => ({ line, specs }))
}

export interface PluginSaysColumnProps {
  view: SprintView
  proposal: SlateProposal | null
  writeReason?: string
  busy: boolean
  steps: CommitStep[]
  committing: boolean
  onApplyProposal: (specs: string[]) => void
  onCommit: (override?: { reason: string }) => void
}

export function PluginSaysColumn({ view, proposal, writeReason, busy, steps, committing, onApplyProposal, onCommit }: PluginSaysColumnProps) {
  const [overrideReason, setOverrideReason] = useState('')
  const over = overTarget(view.sprint?.target ?? null, view.slate.length)
  const disabled = Boolean(writeReason) || busy || committing
  const reason = writeReason ?? (busy || committing ? WAITING_FOR_PLUGIN_ANSWER : undefined)
  const proposed = proposal?.proposal ?? []
  const grouped = groupGaps(view.readiness.gaps)

  return (
    <section aria-label="What the plugin says" data-testid="planning-plugin-says" className="flex min-w-0 flex-col rounded-[14px] border border-plan-says-line bg-plan-says p-2">
      <header className="flex h-10 items-center border-b border-plan-says-line px-2">
        <Eyebrow as="h3">What the plugin says</Eyebrow>
      </header>

      <div className="mt-2 space-y-3 px-2">
        <Block title="The plugin proposes" source={PROPOSAL_LABEL}>
          {!proposal ? <p className="text-xs text-ink-3">no data — the proposal has not been read</p>
            : !proposal.hasData ? <p className="text-xs text-ink-3">{proposal.note ?? 'no data'}</p>
            : proposed.length === 0 ? <p className="text-xs text-ink-3">the plugin proposes nothing further ({proposal.candidates} candidates, target {proposal.target ?? 'not set'})</p>
            : (
              <ul className="space-y-1" aria-label="Proposed slate">
                {proposed.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 text-xs" data-proposed={r.id}>
                    {/* The id and name wrap, never truncate: a proposal that reads "payments-led…" names nothing (v12 critique #2). */}
                    <span className="min-w-0 leading-[18px] [overflow-wrap:anywhere]"><span className="font-mono text-ident text-accent-text">{r.id}</span> <span className="text-ink-1">{r.name}</span></span>
                    <span className="flex shrink-0 gap-1"><Chip tone={dorChipTone(r.dor)} casing="state" dot>{r.dor}</Chip><Chip tone={riskTone(r.risk)} casing="identifier">{r.risk}</Chip></span>
                  </li>
                ))}
              </ul>
            )}
          {proposal?.mixWarnings.map((w) => <p key={w} className="mt-1 text-xs text-status-warn-ink">{w}</p>)}
          {proposal?.dependencyWarnings.map((w) => <p key={w} className="mt-1 text-xs text-status-warn-ink">{w}</p>)}
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Apply sends the PROPOSAL alone, never the union with what is already slated: `sprint.py
                slate` is additive and refuses a merged spec outright ("spec 0003 is merged — slating
                delivered work is not a commitment", exit 1) even when it already sits in this sprint,
                so re-sending the slated set made the whole verb Not done the moment one slated spec
                had merged (cockpit.spec, v13 integration). */}
            <Button size="sm" variant="primary" data-write="" disabled={disabled || proposed.length === 0} disabledReason={reason ?? (proposed.length === 0 ? 'the plugin proposes nothing to apply' : undefined)} onClick={() => onApplyProposal(proposed.map((r) => r.id))}>
              {APPLY_PROPOSAL}
            </Button>
            <Button size="sm" disabled disabledReason={REASONED_SLATE}>Claude proposes a reasoned slate</Button>
          </div>
        </Block>

        <Block title={COMMIT_SPRINT} source="sprint.py slate → ready → plan → openReport → track_decisions.py open">
          <p className="text-xs text-ink-2">Runs the verbs in order and stops at the first non-zero exit. Each step shows what the plugin answered.</p>
          {over && (
            <label className="mt-2 block text-xs text-ink-2">
              The slate is over its target ({view.slate.length} of {view.sprint?.target}). A reason for <span className="font-mono">--override</span>:
              <Textarea size="sm" rows={2} className="mt-1" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="why the plugin should accept more than the target" />
            </label>
          )}
          <Button size="sm" variant="primary" icon={Flag} data-write="" className="mt-2" disabled={disabled} disabledReason={reason} loading={committing} loadingLabel="Committing…" onClick={() => onCommit(over && overrideReason.trim() ? { reason: overrideReason.trim() } : undefined)}>
            {COMMIT_SPRINT}
          </Button>
          {steps.length > 0 && (
            <ol className="mt-2 space-y-1" aria-label="Commit steps" data-testid="commit-steps">
              {steps.map((s, i) => (
                <li key={`${s.label}-${i}`} data-testid="commit-step" className="rounded-md bg-surface-1 px-2 py-1.5 text-xs" data-step={s.label} data-exit-code={s.exitCode ?? 'none'}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-1">{s.label}</span>
                    <span className={s.skipped ? 'text-ink-3' : s.exitCode === 0 ? 'text-status-ok-ink' : s.exitCode === 2 ? 'text-status-error-ink' : 'text-status-warn-ink'}>
                      {s.heading}{s.exitCode !== null ? <span className="font-mono text-ident text-ink-3"> · exit {s.exitCode}</span> : null}
                    </span>
                  </div>
                  {s.text && <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-ink-2">{s.text}</pre>}
                  <p className="mt-0.5 font-mono text-[10px] text-ink-3">{s.source}</p>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block title="Definition of Ready" source="sprint.py status --json readiness.gaps[]">
          {grouped.length === 0
            ? <p className="text-xs text-ink-3">{view.hasData ? 'no gaps listed' : 'no data'}</p>
            : (
              <ul className="space-y-2" aria-label="DoR gaps, grouped by line" data-testid="dor-gaps-grouped">
                {grouped.map((g) => (
                  <li key={g.line} className="text-xs" data-gap-line="">
                    <p className="text-ink-1">{g.line}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-ident text-ink-2" aria-label="specs with this gap">
                      {g.specs.map((id) => <span key={id} data-gap-spec={id}>{id}</span>)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </Block>
        <Block title="Dependency order" source="sprint.py status --json dependency_gaps[]">
          {view.dependencyGaps.length === 0 ? <p className="text-xs text-ink-3">no gaps listed</p> : view.dependencyGaps.map((g) => <p key={g} className="text-xs text-status-warn-ink">{g}</p>)}
        </Block>
        <Block title="Mix" source="sprint.py status --json mix_warnings[]">
          {view.mixWarnings.length === 0 ? <p className="text-xs text-ink-3">no warnings</p> : view.mixWarnings.map((w) => <p key={w} className="text-xs text-status-warn-ink">{w}</p>)}
        </Block>
      </div>
    </section>
  )
}

function Block({ title, source, children }: { title: string; source: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-surface-1/70 p-3" data-block={title}>
      <Eyebrow as="h3">{title}</Eyebrow>
      <div className="mt-1.5">{children}</div>
      <p className="mt-1.5 font-mono text-[10px] text-ink-3" aria-label="source">{source}</p>
    </div>
  )
}
