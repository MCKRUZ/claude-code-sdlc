// The lifecycle strip (togo-command-center.md §1 "What replaces the sidebar"): Studio's only
// navigation, as a 64 px band of nine SVG stations on a lit rail. It takes the sidebar's seat
// inside the shell's first `<aside>` (Frame.tsx) and holds `<nav aria-label="Project">`, so every
// a11y count the sidebar answered to is unchanged. The stations come from `spineModel`
// (`buildSpineData` → `nodeKind`, `railProgress`, `STAGE_SHORT_LABEL`); the Build station names
// the sprint the plugin reports — "Build Loop · S08 · 8th sprint" when `sprint.py list --json`
// gave an ordinal, "Build Loop · S08" from `status` alone, "Build Loop" with no sprint — and
// carries `sprintHomeUnavailableReason` when the plugin lacks `sprint-status`. It expands on
// click or Enter (`aria-expanded`, never hover) to the `BUILD_VIEWS`; `activeNav` keeps deciding
// which single entry carries `aria-current="page"`. The viewed station carries `data-viewing`.
//
// Motion: the current station breathes (`attachPulse`, `full` tier only — the one idle motion);
// the rail draws and the stations pop once per project open through `frameAssemble.join`
// (row #32, `stripDraw`); the sign-off ceremony finds the signed node and the next ring through
// `ceremonyRegistry`. Hovering a station tells `spineStore`, so the Spine on the lifecycle home
// lights the same station. Nothing here calls the bridge: every fact arrives as a prop.
import { memo, useEffect, useMemo, useRef } from 'react'
import type { CommandCenter, ProjectStatus } from '../../shared/types'
import {
  activeNav, BUILD_STAGE_ID, BUILD_VIEWS, sprintHomeUnavailableReason, stageMeta, targetForBuildView, targetForStage,
  type Area, type NavTarget,
} from '../../shared/nav'
import { CAPABILITIES } from '../../shared/reasons'
import { buildSpineData, railProgress, shortLabel } from '../scenes/spine/spineModel'
import { SpineStrip, type StripStation } from '../scenes/spine/SpineStrip'
import { spineStore } from '../stores/spineStore'
import { attachPulse } from '../motion/pulse'
import { motion } from '../motion/motion'
import { ceremonyRegistry } from '../motion/ceremonyRegistry'
import { frameAssemble, stripDraw } from '../motion/choreo'
import { useHeightReveal } from '../motion/useHeightReveal'
import { cn } from '../ui/cn'

/** What the strip knows about the sprint, read by App from the command-center document
 * (`sprints.active` and that entry's `ordinal`; `capabilities`). Null = the plugin said nothing. */
export interface StripSprintFacts {
  sprintId: string | null
  /** The plugin's 1-based ordinal for the active sprint (`sprint.py list --json`), or null. */
  ordinal: number | null
  /** `generate_status.py --json` capabilities; null while unknown (the read has not landed). */
  capabilities: readonly string[] | null
}

export const NO_SPRINT_FACTS: StripSprintFacts = { sprintId: null, ordinal: null, capabilities: null }

/** The strip's facts from the command-center document: the active sprint id (`sprint.py list`'s
 * `active`, else the status sprint's own id), that entry's `ordinal` ONLY when the plugin has
 * `sprint-list` (an older plugin shows the id alone), and the capability list. Lookups on plugin
 * fields, never a count of Studio's own. */
export function stripFactsFrom(cc: CommandCenter | null | undefined): StripSprintFacts {
  if (!cc) return NO_SPRINT_FACTS
  const listed = cc.capabilities.includes(CAPABILITIES.sprintList)
  const sprintId = cc.sprints.data?.active ?? cc.sprint.data?.sprint?.id ?? null
  const entry = listed && sprintId ? cc.sprints.data?.sprints.find((s) => s.id === sprintId) : undefined
  return { sprintId, ordinal: entry ? entry.ordinal : null, capabilities: cc.capabilities }
}

/** "8th" — English ordinal wording for the plugin's number. Wording only: the number is theirs. */
export function ordinalWord(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

/** The Build station's line. Starts with the stage's own display ("Build Loop") so every e2e
 * locator (`/^Build Loop/`) still finds it; the sprint id and ordinal follow only when given. */
export function buildStationLabel(display: string, facts: Pick<StripSprintFacts, 'sprintId' | 'ordinal'>): string {
  const parts = [display]
  if (facts.sprintId) {
    parts.push(facts.sprintId)
    if (facts.ordinal !== null && Number.isInteger(facts.ordinal) && facts.ordinal > 0) parts.push(`${ordinalWord(facts.ordinal)} sprint`)
  }
  return parts.join(' · ')
}

export interface LifecycleStripProps {
  status: ProjectStatus
  projectPath: string
  area: Area
  viewedStageId: string | undefined
  sprint?: StripSprintFacts
  onNavigate: (target: NavTarget) => void
}

export const LifecycleStrip = memo(function LifecycleStrip({ status, projectPath, area, viewedStageId, sprint = NO_SPRINT_FACTS, onNavigate }: LifecycleStripProps) {
  const current = status.stages.find((s) => s.stage_state === 'current')
  const active = activeNav(area, viewedStageId, current?.id ?? null)
  const data = useMemo(() => buildSpineData({ stages: status.stages, currentPhaseId: current?.id ?? status.current_phase?.id ?? null }), [status, current?.id])
  const { uLit } = railProgress(data)
  const expanded = active.stageId === BUILD_STAGE_ID
  const reason = sprint.capabilities === null ? null : sprintHomeUnavailableReason(sprint.capabilities)

  const stations = useMemo<StripStation[]>(() => data.stations.map((station) => {
    const stage = status.stages[station.index]
    const isBuild = station.isBuild
    const display = isBuild ? buildStationLabel(station.display, sprint) : station.display
    return {
      id: station.id,
      display,
      kind: station.kind,
      label: isBuild ? display : shortLabel(station),
      meta: stageMeta(stage, null),
      isBuild,
      isCurrent: station.isCurrent,
      viewing: active.stageId === station.id,
      active: active.stageId === station.id && active.buildView === null,
      expanded: isBuild ? expanded : undefined,
      note: isBuild ? reason : null,
    }
  }), [data, status.stages, sprint, active.stageId, active.buildView, expanded, reason])

  const navRef = useRef<HTMLElement>(null)
  const hovering = useRef(false)
  usePulse(navRef, hovering, projectPath, current?.id ?? null)
  useCeremonyNodes(navRef)
  useStripAssemble(navRef, projectPath)

  const viewsRef = useRef<HTMLUListElement>(null)
  useHeightReveal(viewsRef, expanded)

  return (
    <nav
      ref={navRef}
      aria-label="Project"
      data-lifecycle-strip=""
      data-testid="lifecycle-strip"
      data-expanded={expanded ? '' : undefined}
      // `overflow-x-hidden`: nine absolutely positioned stations never widen the document (a
      // 400 px window stacks the panes and must not scroll sideways).
      className="overflow-x-hidden border-b border-line-1 bg-surface-0"
      onMouseEnter={() => { hovering.current = true }}
      onMouseLeave={() => { hovering.current = false }}
    >
      <SpineStrip
        stations={stations}
        uLit={uLit}
        done={data.signedCount}
        total={data.stations.length}
        onActivate={(id) => onNavigate(targetForStage(id))}
        onHover={spineStore.setHover}
      >
        {expanded ? (
          <ul ref={viewsRef} aria-label="Build Loop views" className="flex h-8 list-none items-center justify-center gap-1 pb-1">
            {BUILD_VIEWS.map((view) => {
              const lit = active.buildView === view.id
              return (
                <li key={view.id}>
                  <button
                    type="button"
                    data-pressable=""
                    aria-current={lit ? 'page' : undefined}
                    onClick={() => onNavigate(targetForBuildView(view.id))}
                    className={cn(
                      'h-6 rounded-full px-2.5 text-xs leading-6 transition-colors',
                      lit ? 'bg-stage-current-bg font-medium text-stage-current-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1',
                    )}
                  >
                    <span>{view.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </SpineStrip>
    </nav>
  )
})

/** The current station breathes for three cycles, held while the pointer is over the strip —
 * `full` familiarity tier only (visual §7 "Current-station pulse"). No-op under test and off. */
function usePulse(navRef: React.RefObject<HTMLElement | null>, hovering: React.MutableRefObject<boolean>, projectPath: string, currentId: string | null) {
  useEffect(() => {
    if (currentId === null || motion.familiarity(projectPath) !== 'full') return
    const node = navRef.current?.querySelector('[data-node="current"]') ?? null
    const pulse = attachPulse(node, { cycles: 3, hold: () => hovering.current })
    return () => pulse.kill()
  }, [navRef, hovering, projectPath, currentId])
}

/** M1: the sign-off ceremony's nodes, as getters resolved at play time. The strip has no
 * connector line, no Now badge to Flip and no HTML bar (the rail is an SVG line that re-renders
 * from the refreshed status), so only the two rings are offered. */
function useCeremonyNodes(navRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const currentRing = () => navRef.current?.querySelector('[data-node="current"]') ?? null
    const signedRing = (): Element | null => {
      const nav = navRef.current
      if (!nav) return null
      const li = currentRing()?.closest('li') ?? null
      const prev = li?.previousElementSibling ?? null
      const before = prev?.querySelector('[data-node="signed"], [data-node="completed"]') ?? null
      if (before) return before
      const finished = nav.querySelectorAll('[data-node="signed"], [data-node="completed"]')
      return finished.length > 0 ? finished[finished.length - 1] : null
    }
    return ceremonyRegistry.register({ signedNode: signedRing, nextRing: currentRing })
  }, [navRef])
}

/** Row #32 joins the Frame's assemble once per project open; a familiar project (`quiet`,
 * `settled`) paints the strip at once because `stripDraw` reads the tier itself. */
function useStripAssemble(navRef: React.RefObject<HTMLElement | null>, projectPath: string) {
  useEffect(() => frameAssemble.join((ctx) => {
    const nav = navRef.current
    if (!nav) return
    return stripDraw.play({ ...ctx, scope: nav, parent: undefined, parentLabel: undefined }, {
      rail: nav.querySelector<SVGGeometryElement>('[data-strip-rail]'),
      stations: Array.from(nav.querySelectorAll('[data-station-ring]')),
      tier: motion.familiarity(projectPath),
    }) as unknown as gsap.core.Animation
  }), [navRef, projectPath])
}
