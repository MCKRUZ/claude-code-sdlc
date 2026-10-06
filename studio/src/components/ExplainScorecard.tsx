import { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import type { Scorecard } from '../../shared/types'
import { buildScorecardExport, hasNothingRecorded } from '../../shared/scorecardExport'
import { Button, Card, DefinitionList, EmptyState, Eyebrow, NoData, Notice, Segmented, SkeletonTile, StatTile, toast } from '../ui'
import { useCountUp } from '../motion/useCountUp'
import { useListReveal } from './screenMotion'

type WindowDays = '14' | '30' | '90'
const WINDOWS: { value: WindowDays; label: string }[] = [
  { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' },
]

const percent = (v: number) => `${Math.round(v * 100)}%`
const hours = (v: number) => `${v.toFixed(1)}h`

/** How Build is going (spec 0013). Every number is the plugin's; `null` is "no data" with what
 * would produce some — never a 0, which is a different and false claim. */
export function ScorecardView({ projectPath }: { projectPath: string }) {
  const [windowDays, setWindowDays] = useState<WindowDays>('14')
  const [card, setCard] = useState<Scorecard | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadable, setUnreadable] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useListReveal(root, card ? `${projectPath}|${windowDays}` : null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.studio.getScorecard(projectPath, Number(windowDays))
    setCard(result)
    setUnreadable(result === null)
    setLoading(false)
  }, [projectPath, windowDays])

  useEffect(() => { load() }, [load])

  /** Has anything happened at all in this window? Used to say "no data yet" ONCE rather than
   * eleven times, which is the difference between a screen that informs and one that nags. */
  const nothingRecorded = card !== null && hasNothingRecorded(card)

  /** Built from the SAME object this screen rendered, never from a fresh fetch. Spec 0013
   * asks an export to contain exactly what is on screen, and a second fetch could return
   * something else between somebody reading a number and taking it to a room. */
  const exportScorecard = async () => {
    if (!card) return
    const contents = buildScorecardExport(card, {
      // Both separators: on Windows a forward-slash-only split leaves the whole path, which
      // would put an absolute directory where a project name belongs in a steering document.
      projectName: projectPath.split(/[\\/]/).filter(Boolean).pop() ?? 'this project',
      windowDays: Number(windowDays),
      now: new Date(),
    })
    const result = await window.studio.exportDocument(`how-build-is-going-${windowDays}d.md`, contents)
    // The toast is the one acknowledgement; no inline sentence repeats it.
    if (result.ok) toast({ tone: 'ok', title: 'Export written', detail: result.path ?? 'saved' })
  }

  if (loading && !card) {
    return (
      <div aria-busy="true">
        <p role="status" className="text-sm text-ink-4">Reading the scorecard…</p>
        <div className="mt-3 grid grid-cols-2 gap-3"><SkeletonTile /><SkeletonTile /></div>
      </div>
    )
  }

  if (unreadable) {
    return (
      // Deliberately NOT an all-zero scorecard. A zeroed screen is a claim about the project;
      // this is a claim about the tool, and a steering meeting is exactly where confusing the
      // two costs something.
      <Notice tone="warn" title="The scorecard could not be read.">
        This is not the same as "nothing has happened" — no numbers are being shown because
        none could be read, not because they are zero.
      </Notice>
    )
  }
  if (!card) return null

  return (
    <div ref={root} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 data-page-heading tabIndex={-1} className="text-xl text-ink-1">How Build is going</h2>
          <p className="mt-1 max-w-[64ch] text-sm text-ink-3">
            Every number here is computed by the plugin from recorded events. Tōgō does no
            arithmetic of its own.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <Button size="sm" icon={Download} onClick={exportScorecard}>Export for a meeting</Button>
          <Segmented<WindowDays> label="Window" tone="inverse" size="sm" options={WINDOWS} value={windowDays} onChange={setWindowDays} />
        </span>
      </div>

      {/* The export's outcome is the toast (`exportScorecard` fires one with the path); a second
          green sentence here would repeat it (G4-15). */}

      {nothingRecorded && (
        <EmptyState
          title={`No data in the last ${windowDays} days.`}
          body="These measures come from merged specs, reverts, deployments and incidents. They start filling in as work goes through the loop — this is an empty record, not a score of zero."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Measure id="accepted" label="Accepted as-is" value={card.accepted_as_is_rate} kind="percent" produces="a merged spec recorded as accepted without rework" />
        <Measure id="rework" label="Rework or revert" value={card.rework_revert_rate} kind="percent" produces="a merged spec that was later reverted or reworked" />
        <Measure id="bounce" label="Sent back" value={card.bounce_back_rate} kind="percent" produces="a spec returned to its developer during checking" />
        <Measure id="review-wait" label="Review wait (median)" value={card.review_wait_median_hours} kind="hours" produces="a review that has been requested and answered" />
        {/* On its own line, never folded into the figure above. A slow security review hidden
            inside an average is a slow security review nobody acts on. */}
        <Measure id="security-wait" label="Security review wait (median)" value={card.security_review_wait_median_hours} kind="hours" produces="a security review that has been requested and answered" emphasis />
      </div>

      {/* Spec 0013: "waiting times are shown against the project's own alarm thresholds, and
          a measure over its threshold is marked." The comparison itself is the plugin's
          (team_alarms), never computed here from the two medians above. */}
      {card.team_alarms && Object.keys(card.team_alarms).length > 0 && (
        <Card>
          <Eyebrow as="h3" className="mb-2">Review-wait alarms by team</Eyebrow>
          <div className="space-y-1 text-sm tabular-nums">
            {Object.entries(card.team_alarms).sort(([a], [b]) => a.localeCompare(b)).map(([team, a]) => (
              <div key={team} className="flex items-center gap-2" data-reveal="">
                <span className="w-24 shrink-0 font-medium text-ink-1">{team}</span>
                <span className={a.review_over_alarm ? 'font-semibold text-status-warn-ink' : 'text-ink-3'}>
                  review vs {a.review_alarm_hours}h{a.review_alarm_hours_default && ' (default)'}
                  {a.review_over_alarm === true && ' — OVER ALARM'}
                  {a.review_over_alarm === null && ' — no data'}
                </span>
                <span className={a.security_over_alarm ? 'font-semibold text-status-warn-ink' : 'text-ink-3'}>
                  security vs {a.security_alarm_hours}h{a.security_alarm_hours_default && ' (default)'}
                  {a.security_over_alarm === true && ' — OVER ALARM'}
                  {a.security_over_alarm === null && ' — no data'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <Eyebrow as="h3" className="mb-2">Delivery</Eyebrow>
        <DefinitionList
          columns={2}
          items={[
            { term: 'Deployments', detail: <Counted id="dora.deploys" value={card.dora.deploy_count} format={String} produces="a recorded deployment" /> },
            { term: 'Lead time (median)', detail: <Counted id="dora.lead" value={card.dora.lead_time_median_hours} format={hours} produces="a merged change that reached production" /> },
            { term: 'Change failure rate', detail: <Counted id="dora.cfr" value={card.dora.change_fail_rate} format={percent} produces="a deployment that caused an incident" /> },
            { term: 'Time to recover (median)', detail: <Counted id="dora.ttr" value={card.dora.time_to_recover_median_hours} format={hours} produces="a closed incident" /> },
          ]}
        />
      </Card>

      <Card>
        <Eyebrow as="h3" className="mb-2">Bugs that got through</Eyebrow>
        {card.escaped_bugs.length === 0 ? (
          <p className="text-sm text-ink-4">None recorded in this window.</p>
        ) : (
          <ul className="space-y-2">
            {card.escaped_bugs.map((bug, i) => (
              <li key={i} className="text-sm" data-reveal="">
                <span className="text-ink-1">{String(bug.summary ?? 'a bug')}</span>
                {/* The retro input, not a bug count: which check should have caught it, and
                    what is proposed about that check. */}
                <span className="mt-0.5 block text-xs text-ink-3">
                  Should have been caught by: {String(bug.which_check ?? 'not recorded')}
                </span>
                {bug.proposed_fix ? <span className="block text-xs text-ink-3">Proposed: {String(bug.proposed_fix)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Spec 0013 asks for this to be STATED, not merely absent. An absence explains nothing;
          saying why these are not measured is the part that changes a conversation. */}
      {/* A standing statement, not a notice (G4-15): an inset card with an eyebrow. */}
      <Card tone="inset">
        <Eyebrow as="h3" className="mb-2">Not measured here, on purpose</Eyebrow>
        <p className="text-sm text-ink-1">Velocity, story points, pull-request counts and lines of code.</p>
        <p className="mt-1 text-xs text-ink-3">
          They measure activity rather than outcome, and every one of them improves when work is
          split more finely — so a team can raise them without delivering anything more. The
          plugin refuses to record them at all, which is why they cannot appear here even by
          accident.
        </p>
      </Card>
    </div>
  )
}

/** A formatted number that tweens only between two REAL values (§4.2 #11); `null` is NoData. */
function Counted({ id, value, format, produces }: { id: string; value: number | null; format: (v: number) => string; produces: string }) {
  const counted = useCountUp(`scorecard.${id}`, value, { snap: 0.1, format })
  if (value === null) return <NoData what={`Produced by ${produces}.`} />
  return <span ref={counted.ref} className="text-sm font-semibold tabular-nums">{counted.text}</span>
}

/** One measure as a StatTile. The tile is handed the number as it is READ — 72 with "%", 5.3
 * with "h" — so it is right with no motion layer at all; the counter then drives the tile's own
 * `[data-value]` text node, found through the tile's ref, so the kit never imports gsap. */
function Measure({
  id, label, value, kind, produces, emphasis,
}: { id: string; label: string; value: number | null; kind: 'percent' | 'hours'; produces: string; emphasis?: boolean }) {
  const shown = value === null ? null : kind === 'percent' ? Math.round(value * 100) : Number(value.toFixed(1))
  const counted = useCountUp(`scorecard.${id}`, shown, { snap: kind === 'percent' ? 1 : 0.1 })
  return (
    <StatTile
      id={`scorecard-${id}`}
      ref={(el) => { counted.ref.current = el?.querySelector<HTMLElement>('[data-value]') ?? null }}
      label={label}
      value={shown}
      unit={kind === 'percent' ? '%' : 'h'}
      hint={`Produced by ${produces}.`}
      noDataWhat="Nothing of that kind has been recorded in this window."
      // The one measure the standard keeps apart gets its own row by POSITION (full width),
      // not by a different fill — a tinted tile would read as a state it does not have.
      className={emphasis ? 'sm:col-span-2 lg:col-span-3' : undefined}
      data-reveal=""
    />
  )
}
