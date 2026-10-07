import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { groupSpecsByTeam } from '../../shared/boardModel'
import { formatDateTime, plural, pluralWord } from '../../shared/format'
import { targetForBuildView, targetForStage, type NavTarget } from '../../shared/nav'
import type { AdvanceResult, DeclarationStatus, HandoffReportResult, ProjectStage, ProjectStatus } from '../../shared/types'
import { Button, Card, Chip, Disclosure, Eyebrow, Notice, PageHeader, SkeletonRows, toast } from '../ui'
import { riskTone } from '../../shared/sprintModel'
import { announce } from '../a11y/LiveAnnouncer'
import { signOffCeremony } from '../motion/choreo'
import { useCountUp } from '../motion/useCountUp'
import { useEnter } from '../motion/useEnter'
import { SceneSlot } from '../scenes/core/SceneSlot'
import { buildSpineData } from '../scenes/spine/spineModel'
import { AdvancePanel, AlreadyDeclared, DeferredList, HandoffPanel } from './FeatureCompletePanels'
import { ConfirmControl, DeferControl } from './FeatureCompleteControls'
import { choreoContext, useListReveal } from './screenMotion'

/** Declaring Build finished (spec 0014).
 *
 * The one screen in this product where somebody says "we are done" out loud, in writing, with
 * their name on it. Everything here exists so that sentence is true when it is said.
 *
 * Studio enforces none of it. Every refusal comes back from the plugin, which means a
 * declaration cannot be slipped through by editing the state file — and this is the single most
 * consequential write in the product, so it is the last place a rule should live only in an
 * application.
 *
 * Two things are deliberately NOT smoothed over:
 *
 *   The declare button stays visible while it would be refused, and pressing it shows why. A
 *   hidden button makes the rule invisible; a visible one that explains itself teaches it.
 *
 *   A suggested reason for deferring is offered but never pre-filled. Spec 0014 asks for
 *   exactly that, and the reason is that a default reason gets accepted unread — which turns a
 *   record of WHY into a record of the tool's wording.
 */
export function FeatureCompleteScreen({
  projectPath,
  actor,
  buildStage,
  status: projectStatus,
  onNavigate,
  embedded = false,
}: {
  projectPath: string
  actor: string
  /** Build's own stage record, from the project rather than from this session. It is what makes
   * "already declared" survive the window closing: before it, the screen knew only what had
   * happened while somebody was watching, so reopening a declared project offered to declare
   * it again. */
  buildStage: ProjectStage | null
  /** The whole project record, for the Spine band above the screen. Optional because App hands
   * this screen only `buildStage` today; without it the band simply does not render. */
  status?: ProjectStatus
  /** A station on the Spine opens that stage; absent, the band is display only. */
  onNavigate?: (target: NavTarget) => void
  /** Rendered beneath `SprintClose` (togo-command-center.md §3.5): the close screen above already
   * draws the lifecycle and lists every open spec with Carry / Drop, so this screen draws no
   * Spine band of its own and folds its per-spec rows (the Defer control — a different verb,
   * `spec_transition.py defer`, so it stays reachable) behind a disclosure with a count line. */
  embedded?: boolean
}) {
  const [status, setStatus] = useState<DeclarationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  /** Who confirmed which team, held here until the declaration carries them. Not persisted:
   * a confirmation is about the list as it stands right now, and one remembered from an hour
   * ago would be a confirmation of something else. */
  const [confirmed, setConfirmed] = useState<Record<string, string>>({})
  const [refusal, setRefusal] = useState<string | null>(null)
  const [declared, setDeclared] = useState<{ by: string; nextStep: string } | null>(null)
  const [busy, setBusy] = useState(false)
  /** The hand-over document is produced immediately after the declaration, and its outcome is
   * shown whether it worked or not. A document that failed to appear is the one somebody will
   * go looking for later, so silence here would be the expensive kind. */
  const [handoff, setHandoff] = useState<HandoffReportResult | null>(null)
  const [handoffBusy, setHandoffBusy] = useState(false)
  /** Moving the stage is a SEPARATE, named act rather than something the declaration does on
   * the way past. It runs the plugin's own gate checks and it is what makes the declaration
   * permanent, so it deserves its own press and its own explanation of what happened. */
  const [advance, setAdvance] = useState<AdvanceResult | null>(null)
  const [advanceBusy, setAdvanceBusy] = useState(false)

  const root = useRef<HTMLDivElement>(null)
  useEnter(root, 'rise', { key: projectPath })
  useListReveal(root, status ? `${projectPath}|${status.totals.specs}|${declared ? 'declared' : 'open'}` : null)

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(await window.studio.getDeclarationStatus(projectPath, confirmed))
    setLoading(false)
  }, [projectPath, confirmed])

  useEffect(() => { load() }, [load])

  const declare = async () => {
    setBusy(true)
    setRefusal(null)
    const result = await window.studio.declareComplete(projectPath, actor, confirmed)
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.refusal?.message ?? 'The declaration was refused.')
      return
    }
    setDeclared({ by: result.declared_by ?? actor, nextStep: result.next_step ?? '' })
    await produceHandoff(false)
  }

  /** Produced through the plugin's own generator, which assembles the deferred items and their
   * reasons from the specs themselves. Studio composes none of it. */
  const produceHandoff = async (replaceExisting: boolean) => {
    setHandoffBusy(true)
    setHandoff(await window.studio.generateHandoffReport(projectPath, { actor, replaceExisting }))
    setHandoffBusy(false)
  }

  const moveToNextStage = async () => {
    setAdvanceBusy(true)
    const result = await window.studio.advanceAfterDeclaration(projectPath, actor)
    setAdvance(result)
    setAdvanceBusy(false)
    if (!result.ok) return
    // The ceremony (§4.2 #10) plays only on the plugin's yes, naming the plugin's own value. The
    // Spine's lit-length step waits for the refreshed ProjectStatus, which arrives through props.
    const by = result.signedBy ?? actor
    toast({ tone: 'ok', title: `Build signed off · by ${by}` })
    announce(`Build signed off by ${by}`)
  }

  // The success card mounts on the render after `advance.ok` flips; the ceremony needs it in the
  // DOM, so it plays from an effect rather than from the handler above.
  useEffect(() => {
    const el = root.current
    if (!advance?.ok || !el) return
    signOffCeremony.play(choreoContext(el), { successCard: el.querySelector('[data-ceremony-card]') })
  }, [advance])

  // The scene's own model builds the band's data (one source of truth with StageHome). This
  // screen holds no stage readiness, so `currentDocs` stays unset — an arc drawn from a guess would
  // be the one fabricated number on it. Height 200: the closing band is the page's hero (§5.1).
  // Round 2 (I4): `ledger: true` asks every plate for its ledger line, word for word from the
  // plugin's row; no stage home is open here, so `viewedStageId` is null (no reticle).
  const spine = useMemo(
    () => (projectStatus
      ? { ...buildSpineData({ stages: projectStatus.stages, currentPhaseId: projectStatus.current_phase?.id ?? null }), ledger: true, viewedStageId: null }
      : null),
    [projectStatus],
  )
  // Wrapped exactly as StageHome's SpineBand wraps its slot (a `<section>` with a body `<div>`), so
  // the root's `space-y-6` lands on the wrapper and the eyebrow sits 24 px under the caption, as it
  // does on every stage home. Tailwind 4 writes `space-y-*` as `:where(& > :not(:last-child))` —
  // zero specificity — and SceneShell's `<figure>` carries `m-0`, so a bare figure as a direct
  // child of the root cancelled the gap (observatory v9 closing: the caption sat on the eyebrow).
  const band = spine && !embedded && (
    <section aria-label="Lifecycle" className="space-y-1">
      <div>
        <SceneSlot id="spine" data={spine} height={200} onActivate={(id) => onNavigate?.(targetForStage(id))} />
      </div>
    </section>
  )

  // Already declared, according to the PROJECT rather than this session. Checked before
  // anything else and before the backlog is even read: reopening Studio on a project whose
  // Build was declared months ago used to show the whole declare-it flow again, because the
  // screen only ever knew what had happened while somebody was watching it.
  if (buildStage && buildStage.stage_state === 'signed_off') {
    return <div ref={root} className="space-y-4">{band}<AlreadyDeclared stage={buildStage} /></div>
  }

  if (loading && !status) {
    return (
      <div ref={root} className="space-y-4" aria-busy="true">
        {band}
        <p role="status" className="text-sm text-ink-3">Reading the backlog…</p>
        <SkeletonRows rows={3} />
      </div>
    )
  }
  if (!status) return null

  // After the declaration the screen states when and by whom, and offers nothing further —
  // spec 0014's last check. Reopening Build is not a thing this screen does.
  if (declared) {
    return (
      <div ref={root} className="space-y-4">
        {band}
        <Card>
          <h2 data-page-heading tabIndex={-1} className="text-xl text-ink-1">Build is declared complete</h2>
          <p className="mt-1 text-sm text-ink-1">
            Declared by {advance?.signedBy ?? declared.by}
            {/* The time comes from the project's record, and only once there IS one. Until the
                stage moves nothing has recorded when this happened, and printing the current
                clock would invent the single fact this screen exists to protect. */}
            {advance?.declaredAt ? <> on {formatDateTime(advance.declaredAt)}.</> : <>.</>}
          </p>
          {!advance?.ok && (
            <p className="mt-1 text-xs text-status-warn-ink">
              Not recorded in the project yet — until the stage moves below, this is true on
              this screen and nowhere else.
            </p>
          )}
          {declared.nextStep && <p className="mt-2 text-xs text-ink-3">{declared.nextStep}</p>}
        </Card>
        <HandoffPanel result={handoff} busy={handoffBusy} onReplace={() => produceHandoff(true)} onRetry={() => produceHandoff(false)} />
        <AdvancePanel result={advance} busy={advanceBusy} onAdvance={moveToNextStage} />
        {status.deferred.length > 0 && <DeferredList deferred={status.deferred} />}
        <p className="text-xs text-ink-3">
          Late work rides the loop one spec at a time, as usual. Build does not reopen.
        </p>
      </div>
    )
  }

  return (
    <div ref={root} className="space-y-6">
      {band}
      <div>
        {/* S1: the kit header — the heading text is byte-identical (board.spec finds it by name);
            the lede says what this screen is for; the one action goes back to the Board, where
            the undecided specs live. The declare control stays at the foot, beside its name. */}
        <PageHeader
          eyebrow="Build · Closing"
          title="Declaring Build finished"
          lede="Build ends by a named person declaring it complete, once every spec is decided and each team has confirmed its own list. The plugin refuses anything less."
          actions={onNavigate && (
            <Button size="sm" onClick={() => onNavigate(targetForBuildView('board'))}>Open the Board</Button>
          )}
        />
        <Totals totals={status.totals} />
      </div>

      {status.can_declare ? (
        <Card tone="ok" className="text-sm">
          <p className="text-status-ok-ink">Every spec is decided and every team has confirmed its own list.</p>
        </Card>
      ) : (
        // ONE warn notice for "blocked" (G4-10): the count is the headline, and each blocker is a
        // section inside it under the plugin's own sentence. Three amber boxes in a row read as
        // three alarms; one notice says what is true and its body says why.
        <Notice
          tone="warn"
          title={`${plural(status.blockers.length, 'thing', 'things')} ${pluralWord(status.blockers.length, 'blocks', 'block')} the declaration`}
          className="text-sm"
        >
          <div className="mt-1 divide-y divide-status-warn-line">
          {status.blockers.map((blocker) => (
            // The plugin's own words. It knows what is outstanding, and a refusal that names
            // the items is a to-do list rather than a wall.
            <section key={blocker.kind} aria-label={blocker.message} className="py-2 first:pt-0 last:pb-0">
              <h3 className="text-sm font-medium text-status-warn-ink">{blocker.message}</h3>
              {blocker.specs && blocker.specs.length > 0 && (
                // Gathered by team, because that is how the decisions get made: each lead
                // confirms their OWN team's list, and a lead working down a flat list of
                // everybody's specs has to keep re-finding which ones are theirs. Amber marks the
                // frame, the blocker's sentence and the "needs a decision" chip — the rows
                // themselves are ink on a card, so five rows do not read as five alarms.
                <BlockerSpecs
                  embedded={embedded}
                  count={blocker.specs.length}
                  groups={groupSpecsByTeam(blocker.specs).map((group) => (
                    <div key={group.team}>
                      <Eyebrow className="text-status-warn-ink">
                        {group.hasLead
                          ? <>{group.team} · {group.specs.length}</>
                          : <>No team · {group.specs.length} · nobody can confirm these</>}
                      </Eyebrow>
                      <ul className="mt-1 space-y-1">
                        {group.specs.map((spec) => (
                          <li key={spec.spec} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[10px] bg-surface-1 px-3 py-2 text-sm" data-reveal="" data-blocker-spec={spec.spec}>
                            <span className="font-mono text-ident text-ink-2">{spec.spec}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-ink-1">{spec.name}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                                <span>{spec.status}</span>
                                {/* Risk is shown because spec 0014 asks for it, and because it is
                                    what makes "finish it or defer it" a different question for
                                    different specs — in the one risk map. */}
                                {spec.risk ? <Chip tone={riskTone(spec.risk)} size="xs" casing="identifier">{spec.risk}</Chip> : null}
                                <span>{spec.developer ? spec.developer : 'nobody assigned'}</span>
                                {/* The plugin's reading of what this spec's own state says about
                                    whether anybody has decided to finish it. */}
                                {spec.intent === 'needs_a_call' && (
                                  <Chip tone="warn" dot className="uppercase tracking-wide">needs a decision</Chip>
                                )}
                              </span>
                            </span>
                            <span className="justify-self-end">
                              {blocker.kind === 'unfinished_specs' && (
                                <DeferControl projectPath={projectPath} specName={spec.name} actor={actor} onDeferred={load} onRefused={setRefusal} />
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                />
              )}
              {blocker.teams && blocker.teams.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {blocker.teams.map((team) => (
                    <li key={team}>
                      <ConfirmControl team={team} onConfirm={(handle) => setConfirmed((prev) => ({ ...prev, [team]: handle }))} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          </div>
        </Notice>
      )}

      {status.deferred.length > 0 && <DeferredList deferred={status.deferred} />}

      {refusal && (
        // The plugin's own words — it refused before writing, so nothing needs undoing.
        <Notice tone="warn" className="text-sm"><p className="whitespace-pre-wrap">{refusal}</p></Notice>
      )}

      <div className="flex items-center gap-2">
        {/* Visible even while it would be refused. A hidden button makes the rule invisible; a
            visible one that explains itself teaches it. */}
        <Button variant="primary" onClick={declare} disabled={busy || !actor.trim()} loading={busy} loadingLabel="Declaring…">
          Declare Build complete
        </Button>
        {actor.trim()
          ? <span className="text-xs text-ink-3">Recorded against {actor}.</span>
          : <span className="text-xs text-status-warn-ink">
              A declaration needs a name — an unnamed one is an announcement nobody made.
            </span>}
      </div>
    </div>
  )
}

/** Under `SprintClose` the same open specs are listed above with Carry / Drop, so the rows fold
 * behind a count line that points up; the Defer verb inside stays one click away. Standalone the
 * rows are open. */
export function blockerFoldLabel(count: number): string {
  return `${plural(count, 'open spec', 'open specs')} — carry or drop them above, or defer one here`
}

function BlockerSpecs({ embedded, count, groups }: { embedded: boolean; count: number; groups: ReactNode }) {
  if (!embedded) return <div className="mt-2 space-y-3">{groups}</div>
  return (
    <Disclosure className="mt-2" data-testid="blocker-specs-fold" summary={<span className="text-sm text-ink-2">{blockerFoldLabel(count)}</span>}>
      <div className="mt-2 space-y-3">{groups}</div>
    </Disclosure>
  )
}

/** The three backlog counts, each a counter (§4.2 #11): they tween only between two real values
 * the plugin reported, and the first render is a plain number. */
function Totals({ totals }: { totals: DeclarationStatus['totals'] }) {
  const specs = useCountUp('closing.totals.specs', totals.specs)
  const unfinished = useCountUp('closing.totals.unfinished', totals.unfinished)
  const deferred = useCountUp('closing.totals.deferred', totals.deferred)
  return (
    <p className="mt-0.5 text-sm text-ink-3 tabular-nums">
      <span ref={specs.ref}>{specs.text}</span> {pluralWord(totals.specs, 'spec', 'specs')} in the backlog ·{' '}
      <span ref={unfinished.ref}>{unfinished.text}</span> still undecided ·{' '}
      <span ref={deferred.ref}>{deferred.text}</span> deferred
    </p>
  )
}
