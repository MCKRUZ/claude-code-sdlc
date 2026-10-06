import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Flip } from 'gsap/Flip'
import { Check, ChevronRight, Search, Settings, SunMoon, Terminal, type LucideIcon } from 'lucide-react'
import type { ProjectStage, ProjectStatus, SyncState } from '../../shared/types'
import {
  activeNav, BUILD_VIEWS, groupStages, nodeKind, stageMeta, targetForBuildView, targetForStage,
  type Area, type DocProgress, type NavTarget, type NodeKind,
} from '../../shared/nav'
import { SyncChip } from './SyncChip'
import { DensityToggle, Icon, Kbd, MotionToggle, ProgressBar, ThemeToggle, VisuallyHidden } from '../ui'
import { TogoMark } from './brand/TogoMark'
import { PRODUCT_NAME } from './brand/TogoWordmark'
import { spineStore } from '../stores/spineStore'
import { attachPulse } from '../motion/pulse'
import { enabled as motionEnabled, motion } from '../motion/motion'
import { MOTION_DURATIONS, MOTION_EASES } from '../motion/contract'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { contextFrom, sidebarProgress } from '../motion/choreo'

/** Studio's only navigation: the project, its journey grouped into Foundation / Build / Ship /
 * Close, and the project-wide things (Settings, Console, Search, Appearance, sync) in the footer.
 *
 * It replaced a list of phases sitting beside a row of tabs that looked as if they belonged to the
 * phase picked — only one did. Now every screen is reached from here, and Build Loop, the one
 * stage with screens of its own, opens them beneath itself. Purely presentational: the app hands
 * it the state and receives where the person wants to go.
 *
 * Observatory (§7 Sidebar row): the aside's class and the markup shape are unchanged (the
 * `renderToStaticMarkup` tests read them); the progress line is the kit's `ProgressBar`; the
 * current node breathes for three cycles; hovering a row tells `spineStore` so the Spine scene
 * lights the same station; and the footer gains Search and Appearance — both `<button>`s, never
 * an `<input>` (board.spec counts page-wide inputs). */
export function Sidebar({
  status, area, viewedStageId, currentDocs, syncState, consoleOpen, onToggleConsole, onNavigate, onOpenPalette,
}: {
  status: ProjectStatus
  area: Area
  /** The stage whose documents were picked, or undefined for the project's current stage. */
  viewedStageId: string | undefined
  /** Document progress of the current stage, when known. */
  currentDocs: DocProgress | null
  syncState: SyncState
  consoleOpen: boolean
  onToggleConsole: () => void
  onNavigate: (target: NavTarget) => void
  /** Opens the command palette. Frame keeps the palette's open flag to itself today, so when this
   * is absent the button raises the same ⌘K / Ctrl+K keydown the shortcut map already answers. */
  onOpenPalette?: () => void
}) {
  const current = status.stages.find((s) => s.stage_state === 'current')
  const active = activeNav(area, viewedStageId, current?.id ?? null)
  const done = status.stages.filter((s) => s.stage_state === 'signed_off').length
  const total = status.stages.length
  const navRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  useProgressChoreo(navRef, barRef, total > 0 ? done / total : 0, current?.id ?? null)

  const openPalette = () => {
    if (onOpenPalette) return onOpenPalette()
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? '')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }))
  }

  return (
    // `max-h-[50vh] sm:max-h-none` — below `sm`, Frame.tsx's row becomes a COLUMN (spec 0018),
    // so this aside's own cross axis is width, not height, and its main axis (height) sizes to
    // CONTENT by default: nothing bounds it, so `nav`'s own `min-h-0 flex-1 overflow-y-auto`
    // below has no bounded ancestor to size against and the full stage list renders at full
    // content height, pushing `main`/`ChatPanel` off-screen below it. Capping height here (not
    // in Frame.tsx) is the smaller, more honest fix: Frame.tsx only needs to know Sidebar
    // stacks, not how tall it is allowed to be — that is this component's own concern, the same
    // way `w-72` already is. At `sm:`+, `max-h-none` lifts the cap so the previous row-stretch
    // behaviour (this aside taking the row's own full height) is exactly what it was before.
    <aside className="flex max-h-[50vh] w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 sm:max-h-none">
      <div className="border-b border-line-1 px-4 pb-3.5 pt-4">
        {/* The mark sits where a workspace icon sits (24 px, the in-app minimum); the project
            name is the title it is. The hidden "Tōgō · " prefix lets assistive tech hear the
            product while the visible text — and `toContain('acme-claims')` — stays the project. */}
        <div className="flex items-center gap-2.5">
          <TogoMark className="h-6 w-6 shrink-0 text-accent-600" />
          <h1 className="min-w-0 truncate text-md text-ink-1"><VisuallyHidden>{`${PRODUCT_NAME} · `}</VisuallyHidden>{status.project_name}</h1>
        </div>
        <p className="mt-0.5 truncate pl-[34px] text-xs text-ink-3">{status.profile_id}</p>
        {/* The fill is the kit's accent — "now" is the accent (G2-1); the signed count is said in
            words beneath it, so no second colour is needed on the rail. */}
        <ProgressBar ref={barRef} value={done} max={total} label="stages done" className="mt-3.5" />
        <p className="mt-1.5 flex justify-between text-xs tabular-nums text-ink-3">
          <span>{`${done} of ${total} stages done`}</span>
          {current && <span>{`Now: ${shortName(current)}`}</span>}
        </p>
      </div>

      <nav ref={navRef} aria-label="Project" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
        {groupStages(status.stages).map((group, i) => (
          <div key={group.label}>
            {/* One eyebrow voice across the app: the same 11px / 600 / 0.08em the kit's Eyebrow
                uses (§6), written out here so this file and the kit need not read each other. */}
            <div className={`px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4 ${i === 0 ? 'pt-1.5' : 'pt-4'}`}>
              {group.label}
            </div>
            <ol>
              {group.stages.map((stage, idx) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  isLast={idx === group.stages.length - 1}
                  isActive={active.stageId === stage.id && active.buildView === null}
                  docs={stage.stage_state === 'current' ? currentDocs : null}
                  buildView={stage.id === 'build' && active.stageId === 'build' ? active.buildView : undefined}
                  onNavigate={onNavigate}
                />
              ))}
            </ol>
          </div>
        ))}
      </nav>

      <div className="grid gap-0.5 border-t border-line-1 px-2.5 pb-2.5 pt-2">
        <FooterButton label="Search" icon={Search} active={false} onClick={openPalette} trailing={<Kbd keys={['Mod', 'K']} />} />
        <AppearanceButton />
        <FooterButton label="Settings" icon={Settings} active={active.footer === 'settings'} onClick={() => onNavigate({ area: 'settings' })} />
        <FooterButton label="Console" icon={Terminal} active={consoleOpen} pressed={consoleOpen} onClick={onToggleConsole} />
        <div className="mx-1 mt-1.5"><SyncChip syncState={syncState} /></div>
      </div>
    </aside>
  )
}

/** Choreography #9: when the stage list changes, the bar tweens from the previous REAL fraction,
 * the "Now" chip Flips from its old row to the new one and the new current ring pops. The Flip
 * state is read after every commit so the OLD position is known when the current stage moves;
 * `null` for the first fraction means "set, do not tween" — never a tween from 0. */
function useProgressChoreo(navRef: RefObject<HTMLElement | null>, barRef: RefObject<HTMLDivElement | null>, fraction: number, currentId: string | null) {
  const previous = useRef<{ fraction: number | null; currentId: string | null; now: Flip.FlipState | null }>({ fraction: null, currentId: null, now: null })
  useStudioGSAP(() => {
    const nav = navRef.current
    if (!nav) return
    const prev = previous.current
    const changed = prev.fraction !== null && (prev.fraction !== fraction || prev.currentId !== currentId)
    if (changed) {
      const ctx = contextFrom(nav, { enabled: motion.enabled(), reduced: motion.reduced() }, { durations: MOTION_DURATIONS, eases: MOTION_EASES })
      sidebarProgress.play(ctx, {
        bar: barRef.current?.firstElementChild ?? null,
        fromFraction: prev.fraction,
        toFraction: fraction,
        nowState: prev.currentId !== currentId ? prev.now : null,
        nowBadge: nav.querySelector('[data-flip-id="now"]'),
        newRing: prev.currentId !== currentId ? nav.querySelector('[data-node="current"]') : null,
      })
    }
    const nowEl = nav.querySelector('[data-flip-id="now"]')
    previous.current = { fraction, currentId, now: nowEl && motionEnabled() ? Flip.getState(nowEl) : null }
  }, { scope: navRef, dependencies: [fraction, currentId] })
}

function shortName(stage: ProjectStage): string {
  return stage.display.replace(/^Phase [^:]+:\s*/, '')
}

function FooterButton({
  label, icon, active, pressed, expanded, controls, trailing, onClick,
}: {
  label: string; icon: LucideIcon; active: boolean; pressed?: boolean; expanded?: boolean; controls?: string
  trailing?: ReactNode; onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active && pressed === undefined ? 'page' : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[10px] border border-transparent px-2.5 py-[7px] text-left text-sm ${
        active ? 'bg-surface-1 text-ink-1 shadow-1' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      <Icon icon={icon} size={16} className="text-ink-3" />
      <span>{label}</span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </button>
  )
}

/** Theme / density / animations, in a disclosure under the button (§6.6 "Sidebar footer
 * popover"). Each toggle is a `Segmented` of buttons, so the shell still holds no `<input>`.
 * Closed by default, so the static markup tests see only the button. */
function AppearanceButton() {
  const [open, setOpen] = useState(false)
  const panelId = 'sidebar-appearance'
  return (
    <div onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}>
      <FooterButton label="Appearance" icon={SunMoon} active={open} pressed={open} expanded={open} controls={panelId} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div id={panelId} className="mx-1 mt-1 grid gap-2 rounded-[10px] border border-line-1 bg-surface-1 p-2 shadow-1">
          <ThemeToggle />
          <DensityToggle />
          <MotionToggle note="On overrides the system's reduced-motion setting." />
        </div>
      )}
    </div>
  )
}

/** 18 px nodes with 1.5 px strokes are instrument marks; 22 px with 2 px borders read as
 * buttons. Token classes (not `var()` arbitrary values) so the dark remap lives in one place. */
const NODE: Record<NodeKind, string> = {
  signed: 'bg-stage-signed-fill text-white',
  completed: 'border-[1.5px] border-stage-signed-fill bg-stage-signed-bg text-stage-signed-fill',
  current: 'border-[1.5px] border-stage-current-fill',
  later: 'border-[1.5px] border-dashed border-stage-later-fill',
}

function StageRow({
  stage, isLast, isActive, docs, buildView, onNavigate,
}: {
  stage: ProjectStage
  isLast: boolean
  isActive: boolean
  docs: DocProgress | null
  /** Set only on Build Loop while it is where you are: which of its screens is showing. */
  buildView: ReturnType<typeof activeNav>['buildView'] | undefined
  onNavigate: (target: NavTarget) => void
}) {
  const kind = nodeKind(stage)
  const meta = stageMeta(stage, docs)
  const expanded = buildView !== undefined
  const isBuild = stage.id === 'build'
  const nodeRef = useRef<HTMLSpanElement>(null)

  // The current station breathes for three cycles (§4 #2 / #9) and then rests; a no-op in test
  // mode and with motion off, and killed before the node ever changes hands.
  useEffect(() => {
    if (kind !== 'current') return
    const pulse = attachPulse(nodeRef.current, { cycles: 3 })
    return () => pulse.kill()
  }, [kind, stage.id])

  const hover = (on: boolean) => spineStore.setHover(on ? stage.id : null)

  return (
    <li className="relative">
      {!isLast && (
        <span
          aria-hidden="true"
          // Node centre = 10 px row padding + 9 px half-node = 19 px; a 2 px line starts at 18.
          // The node spans 7–25 px of the row, so the line starts 4 px under it and runs 9 px
          // into the next row, where that row's node (z-10) covers the join.
          className={`absolute left-[18px] top-[29px] -bottom-[9px] w-0.5 ${
            stage.stage_state === 'signed_off' ? 'bg-stage-signed-line' : 'bg-line-1'
          }`}
        />
      )}
      <button
        type="button"
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={isBuild ? expanded : undefined}
        aria-label={`${stage.display}. ${meta}`}
        onClick={() => onNavigate(targetForStage(stage.id))}
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
        onFocus={() => hover(true)}
        onBlur={() => hover(false)}
        // `shadow-1` carries the inset hairline, so the active row has one edge, not a border
        // plus a shadow; the border stays (transparent) so the geometry never shifts on hover.
        className={`relative flex w-full items-start gap-3 rounded-[10px] border border-transparent px-2.5 py-[7px] text-left ${
          isActive ? 'bg-surface-1 shadow-1' : 'hover:bg-surface-2'
        }`}
      >
        <span
          ref={nodeRef}
          data-node={kind}
          aria-hidden="true"
          className={`relative z-10 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${NODE[kind]}`}
        >
          {(kind === 'signed' || kind === 'completed') && <Icon icon={Check} size={14} className="h-3 w-3 [&_path]:stroke-[3]" />}
          {kind === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-stage-current-fill" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-2 text-sm font-medium ${kind === 'later' ? 'text-ink-3' : 'text-ink-1'}`}>
            {shortName(stage)}
            {kind === 'current' && (
              <span data-flip-id="now" className="inline-flex h-4 items-center rounded-full bg-stage-current-bg px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-stage-current-ink">Now</span>
            )}
            {isBuild && (
              <Icon icon={ChevronRight} size={14} className={`ml-auto h-3.5 w-3.5 text-ink-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            )}
          </span>
          <span className={`mt-px block text-xs ${kind === 'signed' ? 'text-stage-signed-ink' : 'text-ink-3'}`}>{meta}</span>
        </span>
      </button>

      {isBuild && expanded && (
        <ul className="mb-1 ml-11 mt-0.5">
          {BUILD_VIEWS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                aria-current={buildView === v.id ? 'page' : undefined}
                onClick={() => onNavigate(targetForBuildView(v.id))}
                className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm ${
                  buildView === v.id
                    ? 'bg-stage-current-bg font-medium text-stage-current-ink'
                    : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                <span>{v.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
