import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { BUILD_STAGE_ID, groupStages, targetForStage, type NavTarget } from '../../shared/nav'
import type { DocumentFocus, PipelineEvidenceResult, ProjectStatus, SignOffQuestion, StageReadiness } from '../../shared/types'
import { Button, Card, Eyebrow, IconButton, Notice, PageHeader, SkeletonRows, Tab, TabList, TabPanel, TabsProvider } from '../ui'
import { readDensity, usePreference } from '../ui/preferenceBridge'
import { useEnter } from '../motion/useEnter'
import { spineCollapse } from '../motion/choreo'
import { SceneSlot } from '../scenes/core/SceneSlot'
import type { SceneDataSpine } from '../scenes/core/types'
import { buildSpineData } from '../scenes/spine/spineModel'
import { spineStore, useSpineHover } from '../stores/spineStore'
import { SPINE_COLLAPSED_STORAGE_KEY, stageTabStore, useSpineCollapsed, useStageTabRequest } from '../stores/stageTabStore'
import { stageHomeKey } from '../stageHomeKey'
import { DocumentsTab } from './DocumentsTab'
import { GuideTab } from './GuideTab'
import { PipelineEvidencePanel } from './PipelineEvidencePanel'
import { SignOffPanel } from './SignOffPanel'
import { StageSummaryStrip } from './StageSummaryStrip'
import { WorkflowTab } from './WorkflowTab'
import { useStageReadiness } from './StageReadinessContext'
import { choreoContext } from './screenMotion'
import { STICKY_HEADER_CLASS, useStuck } from './useStuck'

type StageTab = 'workflow' | 'documents' | 'guide'

// Duplicated from App.tsx/SignOffPanel.tsx rather than imported — neither exports it, and this
// file follows the pattern already established there rather than introducing a new shared type
// as a side effect of reconnecting this feature.
interface Opening {
  projectName: string
  startedAt: number
  title?: string
  subtitle?: string
}

/** `localStorage` key for the Spine band's collapsed state (§7 StageHome row). A preference,
 * never project state: blocked storage just means the band opens every time. The value itself
 * now lives in `stageTabStore`, so the palette's "Collapse or expand the Spine" and this chevron
 * are the same switch; the name is kept for callers that import it from here. */
export const SPINE_COLLAPSED_KEY = SPINE_COLLAPSED_STORAGE_KEY

/** Spine body height per density (§5.1): 160 comfortable (capped — the strip above already shows
 * the stations, so the band is context, not the hero), 120 compact. */
export const SPINE_HEIGHT = { comfortable: 160, compact: 120 } as const

/** The Spine's data from the plugin's own rows, through the scene's model (`spineModel.ts` is the
 * one source of truth for station shape — this file used to carry a copy). The current stage is
 * the row whose `stage_state` is `current`, falling back to `current_phase`; `currentDocs` is the
 * readiness this screen already holds, and only when it IS the current stage's — otherwise null,
 * not an empty arc. */
export function spineDataFor(status: ProjectStatus, readiness: StageReadiness | null): SceneDataSpine {
  const currentPhaseId = status.stages.find((s) => s.stage_state === 'current')?.id ?? status.current_phase?.id ?? null
  const currentDocs = readiness?.ok && currentPhaseId !== null && readiness.stageId === currentPhaseId
    ? { complete: readiness.documents.filter((d) => d.ready).length, total: readiness.documents.length }
    : null
  // Round 2 (I3): the stage whose home is open is the one the reticle marks — the readiness we
  // hold IS that stage's, so its id is the viewed one. Null until readiness has answered.
  const viewedStageId = readiness?.ok ? readiness.stageId : null
  return { ...buildSpineData({ stages: status.stages, currentPhaseId, currentDocs }), viewedStageId }
}

/** The area eyebrow (round 2, S1): "Foundation · Stage 1 of 4" from `groupStages`'s own grouping
 * and the stage's position inside its group — never a count invented here. Null when the stage is
 * not in the project's list (then the header simply has no eyebrow). */
export function stageEyebrow(status: ProjectStatus, stageId: string): string | null {
  for (const group of groupStages(status.stages)) {
    const at = group.stages.findIndex((s) => s.id === stageId)
    if (at >= 0) return `${group.label} · Stage ${at + 1} of ${group.stages.length}`
  }
  return null
}

/** The hero band above the title: the Lifecycle Spine's slot, collapsible, remembered. The
 * registry (`scenes/registerAll.ts`) supplies the scene; this band only owns the chevron, the
 * height and the data. Hover is shared with the sidebar through `spineStore`, so a lit station
 * and a lit row are the same fact. */
function SpineBand({ status, readiness, onNavigate }: {
  status: ProjectStatus
  readiness: StageReadiness | null
  onNavigate?: (target: NavTarget) => void
}) {
  const collapsed = useSpineCollapsed()
  const hover = useSpineHover()
  const density = usePreference(readDensity)
  const data = useMemo(() => spineDataFor(status, readiness), [status, readiness])
  const bandRef = useRef<HTMLElement | null>(null)
  // Round 2 (I8): the chevron plays row #28 on the band and the host applies the collapsed/open
  // state itself (the body mounts or unmounts below), so the end state equals a cold reload whether
  // the row is the stub or the height tween. The ORDER differs by direction, because the row
  // measures the band at play time and ends with `clearProps`:
  //   collapse — play on the OPEN band (it measures the open height), flip the switch when the
  //              timeline reaches its end (`.add(callback)`, the contract's composition verb:
  //              synchronous under the stub, so a test sees one commit; at the last frame under
  //              the engine, before React swaps the markup);
  //   expand   — flip FIRST so the body is in the DOM, then play from 0 to the newly measured open
  //              height in a layout effect (before paint), so the first frame is the closed band.
  const expandPending = useRef(false)
  const toggle = () => {
    const band = bandRef.current
    if (!band) {
      stageTabStore.toggleSpineCollapsed()
      return
    }
    if (collapsed) {
      expandPending.current = true
      stageTabStore.toggleSpineCollapsed()
      return
    }
    spineCollapse.play(choreoContext(band), { band, collapsed: true }).add(() => stageTabStore.toggleSpineCollapsed())
  }
  useLayoutEffect(() => {
    if (collapsed || !expandPending.current) return
    expandPending.current = false
    const band = bandRef.current
    if (!band) return
    const tl = spineCollapse.play(choreoContext(band), { band, collapsed: false })
    return () => { tl.kill() }
  }, [collapsed])
  // One header row: the figure's own eyebrow (SceneShell's) with the chevron beside its toggle.
  // Collapsed, the band shrinks to that same row drawn here, since the figure is gone.
  const chevron = (
    <IconButton
      size="sm"
      label={collapsed ? 'Expand the lifecycle view' : 'Collapse the lifecycle view'}
      icon={collapsed ? ChevronDown : ChevronUp}
      aria-expanded={!collapsed}
      aria-controls="spine-band-body"
      onClick={toggle}
    />
  )
  return (
    <section ref={bandRef} aria-label="Lifecycle" data-testid="spine-band" data-collapsed={collapsed ? '' : undefined} className="space-y-1">
      {collapsed ? (
        <div className="flex items-center justify-between gap-2">
          <Eyebrow as="span">Lifecycle</Eyebrow>
          {chevron}
        </div>
      ) : (
        <div id="spine-band-body">
          <SceneSlot
            id="spine"
            data={data}
            height={SPINE_HEIGHT[density]}
            hoverId={hover}
            onHover={spineStore.setHover}
            onActivate={(id) => onNavigate?.(targetForStage(id))}
            headerExtra={chevron}
          />
        </div>
      )}
    </section>
  )
}

/** A tab's content enters on its own (§4.2 #3 for a `tab` change). `TabPanel` unmounts the
 * inactive panel, so a mount-only enter here runs on every switch, scoped to the panel — the
 * tablist above it is never touched, so the tab that has focus keeps it. */
function TabBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEnter(ref, 'rise')
  // The panel's top gap lives here rather than on TabPanel (which is `pt-0`), so the entering
  // element and the spaced element are the same one.
  return <div ref={ref} className="pt-5">{children}</div>
}

/** The stage's home page: a title, then a Workflow / Documents / Guide tab row, in that order, in the
 * same tab-bar location on every stage (spec 0017).
 *
 * Workflow — a step-by-step guide to the stage, its steps' status derived from the exact same
 * readiness data the Documents tab reads — is the default view. Documents is the flat list spec
 * 0010 shipped, unchanged, in its own component. Read-only by construction — there is nothing
 * here that changes a document. */
export function StageHome({
  projectPath,
  stageId,
  actor,
  status,
  setOpening,
  onSignedOff,
  onOpenDocument,
  onGoToClosing,
  onNavigate,
}: {
  projectPath: string
  stageId?: string
  /** Who a confirmation is recorded under; empty when nobody is signed in. */
  actor: string
  /** The project's stages, for the Spine band. Optional: without it the band is not drawn. */
  status?: ProjectStatus
  setOpening: (opening: Opening | null) => void
  onSignedOff: () => void | Promise<void>
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  /** Where Build actually ends (Build › Closing); shown in place of the sign-off on Build. */
  onGoToClosing?: () => void
  /** Activating a Spine station goes where the sidebar row for that stage goes. */
  onNavigate?: (target: NavTarget) => void
}) {
  const { readiness, loading, refresh } = useStageReadiness()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [tab, setTab] = useState<StageTab>('workflow')
  /** Foundation's gathered pipeline evidence, lifted from the panel so the summary strip can
   * state it; forgotten when the stage or project changes (one project's rails never read under
   * another). Null means "not gathered", which the strip draws as no fact at all. */
  const [pipeline, setPipeline] = useState<PipelineEvidenceResult | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const homeKey = stageHomeKey(projectPath, stageId)
  useEffect(() => { setPipeline(null) }, [homeKey])

  // Opening a DIFFERENT stage — or a different PROJECT — is opening a home page fresh, and
  // Workflow is what a fresh opening lands on (spec 0017), even if the reader had switched to
  // Documents on the stage (or project) they came from. StageHome itself never remounts on
  // either of those (App.tsx keeps it mounted and only changes `projectPath`/`stageId`), so the
  // default has to be re-asserted here rather than left to the initial state, which only fires
  // once. Keyed on BOTH, via `stageHomeKey`, not `stageId` alone: `viewedStageId` resets to
  // `undefined` on every project open (App.tsx's `openPath`), which is not a change at all when
  // the reader never picked a specific stage in the PREVIOUS project either — that was bug #2,
  // where an `undefined`-to-`undefined` "switch" silently kept the reader on Documents.
  useEffect(() => { setTab('workflow') }, [homeKey])

  // The shell's `1`/`2`/`3` shortcuts and the palette ask for a tab through `stageTabStore`
  // (StageHome and Frame share no parent that could hold it). Acted on by NONCE, not by tab name:
  // pressing `1` while Workflow is already up is still a request, and a request made while this
  // screen was not mounted (on the Board, say) is not replayed on the next mount — the nonce
  // seen at mount is the baseline.
  const tabRequest = useStageTabRequest()
  const seenNonce = useRef(tabRequest?.nonce ?? 0)
  useEffect(() => {
    if (!tabRequest || tabRequest.nonce === seenNonce.current) return
    seenNonce.current = tabRequest.nonce
    setTab(tabRequest.tab)
  }, [tabRequest])

  // The title + tab row is the one sticky header on this screen (G4-2): flush at rest, a hairline
  // once the Spine band has scrolled under it.
  const headerRef = useRef<HTMLDivElement | null>(null)
  useStuck(headerRef)

  // Row #3 on the screen root (no wrapper: `main.firstElementChild` stays this div), keyed on
  // the stage/project only. A tab change is a screen change too (§4.2 #3) but it enters through
  // `TabBody` below: re-running the root enter on a tab switch reverts styles across the whole
  // subtree, which drops focus from the tab a keyboard user just arrowed to.
  useEnter(root, 'rise', { key: homeKey })

  const toggle = async (question: SignOffQuestion, confirmed: boolean) => {
    if (!readiness) return
    setBusyId(question.id)
    setConfirmError(null)
    const result = await window.studio.setJudgementConfirmation(projectPath, readiness.stageId, question.id, confirmed, actor)
    if (!result.ok) setConfirmError(result.error ?? 'The confirmation was not recorded.')
    await refresh()
    setBusyId(null)
  }

  if (loading && !readiness) {
    // The sentence stays as `role="status"` text; the skeleton (fixed 3 rows) sits beside it.
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <p className="text-sm text-ink-3">Checking this stage…</p>
        <SkeletonRows rows={3} />
      </div>
    )
  }
  if (!readiness?.ok) {
    return <Notice tone="error">{readiness?.error ?? 'Could not read this stage.'}</Notice>
  }

  return (
    <div ref={root} className="space-y-6">
      {status && <SpineBand status={status} readiness={readiness} onNavigate={onNavigate} />}

      <TabsProvider value={tab} onChange={setTab}>
        {/* Sticky title + tabs INSIDE the screen root (§6.6): `<main>` is the scroll container, the
            negative margin spans its padding, and nothing wraps the root itself. */}
        <div ref={headerRef} className={STICKY_HEADER_CLASS}>
          {/* S1: the kit's one header — eyebrow from the stage's group and ordinal, the heading
              text byte-identical (`readiness.display`), the stage's own description as the lede.
              Not `sticky` itself: the tab row rides in this sticky block with it. */}
          <PageHeader
            eyebrow={status ? stageEyebrow(status, readiness.stageId) ?? undefined : undefined}
            title={readiness.display}
            lede={readiness.description || undefined}
          />
          {/* S2: the facts between the title and the tabs; each is a button into the tab it lives on. */}
          <StageSummaryStrip readiness={readiness} pipeline={pipeline} />
          <TabList<StageTab> value={tab} onChange={setTab} label="Stage view" className="mt-3">
            <Tab<StageTab> value="workflow">Workflow</Tab>
            <Tab<StageTab> value="documents">Documents</Tab>
            <Tab<StageTab> value="guide">Guide</Tab>
          </TabList>
        </div>

        <TabPanel<StageTab> value="workflow" className="pt-0">
          <TabBody>
            <WorkflowTab
              projectPath={projectPath}
              readiness={readiness}
              actor={actor}
              busyId={busyId}
              confirmError={confirmError}
              onToggleSignOff={toggle}
              onOpenDocument={onOpenDocument}
              onRefresh={refresh}
            />
          </TabBody>
        </TabPanel>
        <TabPanel<StageTab> value="guide" className="pt-0">
          <TabBody><GuideTab readiness={readiness} /></TabBody>
        </TabPanel>
        <TabPanel<StageTab> value="documents" className="pt-0">
          <TabBody>
            <DocumentsTab
              readiness={readiness}
              actor={actor}
              busyId={busyId}
              confirmError={confirmError}
              onOpenDocument={onOpenDocument}
              onToggle={toggle}
            />
          </TabBody>
        </TabPanel>
      </TabsProvider>

      {/* Foundation closes only when the delivery rails are PROVEN, not merely present; this is
          where a person finds out which have fired, without leaving the app. Keyed on the project
          so one project's evidence never shows under another. */}
      {tab === 'workflow' && readiness.name === 'foundation' && (
        <PipelineEvidencePanel key={projectPath} projectPath={projectPath} onOpenDocument={onOpenDocument} onResult={setPipeline} />
      )}

      {/* The action itself — sign off and advance — is a whole-stage decision, not a tab's
          content, so it renders once here rather than inside either tab. Same gate as before
          spec 0017 introduced tabs: this is the CURRENT stage, every document is ready, and
          every judgement question has actually been confirmed. Signing off a stage that is not
          current, or that still has open work, is not a decision this button should be able to
          make look easy. */}
      {readiness.stageId === BUILD_STAGE_ID ? (
        // Build does not end here (studio-improvements F3). It is declared complete from Build ›
        // Closing — every spec decided, each team's list confirmed (declare_complete.py) — and
        // the generic sign-off used to offer a way around all of that. signOff.ts refuses
        // `build` too; this is the honest surface for the same rule.
        readiness.isCurrent && (
          <Card data-testid="build-ends-from-closing">
            <h3 className="text-sm font-medium text-ink-1">Build ends from Closing</h3>
            <p className="mt-1 text-sm text-ink-2">
              Build is not signed off like the other stages. It is declared complete from Build › Closing
              once every spec is decided and each team has confirmed its list; the phase advances from there.
            </p>
            {onGoToClosing && <Button size="sm" className="mt-3" onClick={onGoToClosing}>Go to Closing</Button>}
          </Card>
        )
      ) : (
        readiness.isCurrent && readiness.ready && readiness.judgement.every((q) => q.confirmation) && (
          <SignOffPanel
            projectPath={projectPath}
            readiness={readiness}
            actor={actor}
            setOpening={setOpening}
            onSignedOff={onSignedOff}
          />
        )
      )}
    </div>
  )
}
