import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Flip } from 'gsap/Flip'
import { List, Orbit } from 'lucide-react'
import type { Board, BoardGrouping, BoardRole, BoardRow } from '../../shared/types'
import {
  daysWaiting, filterBoard, groupBoard, isOverdue, rolesFor, samePerson, teamLoad,
} from '../../shared/boardModel'
import {
  Button, Card, Chip, EmptyState, Eyebrow, Field, HoverCard, Input, Notice, Segmented, Select, SkeletonRows,
  VisuallyHidden, cn,
} from '../ui'
import { useEnter } from '../motion/useEnter'
import { useFlipGroup } from '../motion/useFlipGroup'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { useCountUp } from '../motion/useCountUp'
import { flipStore } from '../motion/flipStore'
import { motion } from '../motion/motion'
import { contextFrom, listStagger } from '../motion/choreo'
import { backlogStore } from '../stores/backlogStore'
import { useConnection } from '../stores/connectionStore'
import { hostFeatureReason } from '../../shared/codeHostModel'
import { SceneSlot } from '../scenes/core/SceneSlot'
import type { Body, Ghost, SceneDataConstellation, Tether } from '../scenes/core/types'
import { STICKY_HEADER_CLASS, useStuck } from './useStuck'

const ROLE_OPTIONS: Array<{ value: BoardRole; label: string }> = [
  { value: 'needs-me', label: 'Needs me' },
  { value: 'owner', label: 'I own' },
  { value: 'developer', label: "I'm building" },
  { value: 'checker', label: 'I check' },
  { value: 'everything', label: 'Everything' },
]
const ROW_SELECTOR = '[data-flip-id^="spec:"]'
type Surface = 'list' | 'graph'

/** Every spec, across every team (spec 0011).
 *
 * Fetched ONCE. Every tab, filter, search and grouping below is a transformation of what is
 * already in memory — the spec requires that switching a role view does not re-read the
 * repository, and a board that re-fetched on every tab would be both slow and capable of
 * answering differently for no reason the person caused.
 *
 * It opens on "needs me" because the constraint this screen exists for is not writing code,
 * it is knowing what is waiting to be checked and on whom. The surface opens on List every
 * time, on purpose: the Graph is a second view of the same rows, never a remembered default. */
export function BuildBoard({
  projectPath,
  account,
  onOpenSpec,
}: {
  projectPath: string
  account: string | null
  onOpenSpec: (row: BoardRow) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listsRef = useRef<HTMLDivElement>(null)
  useEnter(rootRef, 'rise')
  // The filter bar is this screen's sticky header (G4-2): flush at rest, a hairline once rows
  // have scrolled under it.
  const filterRef = useRef<HTMLDivElement>(null)
  useStuck(filterRef)
  // Row #6: capture the rows' positions in the handler, before the fact changes; the hook
  // Flips them into place after React commits.
  const flip = useFlipGroup(listsRef, ROW_SELECTOR)

  const [board, setBoard] = useState<Board | null>(null)
  const [role, setRoleState] = useState<BoardRole>('needs-me')
  const [grouping, setGroupingState] = useState<BoardGrouping>('none')
  const [search, setSearchState] = useState('')
  const [team, setTeamState] = useState('')
  const [risk, setRiskState] = useState('')
  const [status, setStatusState] = useState('')
  const [surface, setSurface] = useState<Surface>('list')
  const [loading, setLoading] = useState(true)

  const regroup = <T,>(set: (v: T) => void) => (v: T) => {
    flip.capture()
    set(v)
  }
  const setRole = regroup(setRoleState)
  const setGrouping = regroup(setGroupingState)
  const setSearch = regroup(setSearchState)
  const setTeam = regroup(setTeamState)
  const setRisk = regroup(setRiskState)
  const setStatus = regroup(setStatusState)
  // Why live status is off, in the §7.1 words, once the main process has said which CLI this
  // project's host needs and what is wrong with it. Before that: today's sentence.
  const connection = useConnection()
  const codeHostDownReason = (connection && hostFeatureReason(connection, 'board'))
    ?? 'Live status — where each change is and who it is waiting on — needs the code host.'

  const load = useCallback(async () => {
    setLoading(true)
    const next = await window.studio.getBoard(projectPath)
    setBoard(next)
    // The palette's "#" group and the constellation read what this screen already fetched.
    backlogStore.setRows(projectPath, next?.rows ?? [])
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  // Row #4: stagger the rows in on FIRST arrival only — a refresh re-rendering in place is not
  // an event worth announcing with motion.
  const revealed = useRef(false)
  useStudioGSAP(() => {
    const scope = rootRef.current
    if (!scope || !board || revealed.current) return
    revealed.current = true
    const ctx = contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion)
    listStagger.play(ctx, { items: Array.from(scope.querySelectorAll('[data-reveal]')) })
  }, { scope: rootRef, dependencies: [board !== null] })

  // One clock for the whole render, so two rows never disagree about what "today" is.
  const now = useMemo(() => new Date(), [board])

  const rows = board?.rows ?? []
  const visible = useMemo(
    () => filterBoard(rows, { role, search, team, risk, status }, account),
    [rows, role, search, team, risk, status, account],
  )
  const groups = useMemo(() => groupBoard(visible, grouping), [visible, grouping])
  const load_ = useMemo(() => teamLoad(rows, board?.teamLimits ?? null), [rows, board])
  const teams = useMemo(() => [...new Set(rows.map((r) => r.team).filter(Boolean))].sort(), [rows])
  const scene = useMemo(() => (surface === 'graph' ? constellationFrom(visible) : null), [surface, visible])
  const total = useCountUp('board.total', board ? rows.length : null)

  /** Row #8: stash where the row is so the detail's title can Flip from it; then open. */
  const open = (row: BoardRow, e: MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget
    if (motion.enabled()) flipStore.stash(`spec:${row.spec}`, Flip.getState(el), el)
    onOpenSpec(row)
  }

  /** ↑/↓ move between rows across groups; everything else is left to the row. */
  const onRowsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const container = listsRef.current
    const target = e.target as HTMLElement
    if (!container || !target.matches(ROW_SELECTOR)) return
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(ROW_SELECTOR))
    const index = buttons.indexOf(target as HTMLButtonElement)
    if (index === -1) return
    const next = buttons[index + (e.key === 'ArrowDown' ? 1 : -1)]
    if (!next) return
    e.preventDefault()
    next.focus()
  }

  if (loading && !board) {
    return (
      <div ref={rootRef} className="space-y-3" aria-busy="true">
        <p className="text-sm text-ink-4" role="status">Reading the specs…</p>
        <SkeletonRows rows={3} />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl text-ink-1" data-page-heading>Build</h2>
          {/* Stays the heading's next sibling: BuildBoard.test reads the count from there. */}
          <p className="mt-1 max-w-[64ch] text-sm text-ink-3 tabular-nums">
            <span ref={total.ref}>{total.text}</span> spec{rows.length === 1 ? '' : 's'}
            {visible.length !== rows.length && <> · {visible.length} shown</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-2 pt-0.5">
          <Button size="sm" onClick={load}>Refresh</Button>
        </div>
      </div>

      {board && !board.codeHostAvailable && (
        // Every row is still here — an empty board would read as "there is no work", which is
        // a different claim from "we could not reach the code host". The host's own words sit
        // behind a disclosure (G4-10) rather than as a mono block run into the prose.
        <Notice tone="warn" title="Showing what the spec files say.">
          {codeHostDownReason}
          {board.error && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px]">Show the host's message</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{board.error}</pre>
            </details>
          )}
        </Notice>
      )}

      {load_.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {load_.map((t) => (
            // One fact row per team, read left to right: dot · team · in flight / limit · words.
            // Still the kit's pill (BuildBoard.test finds it by `span.rounded-full` and reads the
            // tone off it), but typeset as facts rather than a sentence stuffed into a chip.
            <Chip
              key={t.team}
              size="sm"
              dot
              // §5.4 "Amber stays amber": over limit / over alarm / at limit are the plugin's
              // warn-class facts, so the chip is warn — the bold words below tell them apart.
              // `error` is reserved for hard failures (an unreachable code host), never a limit.
              tone={t.overLimit || t.anyOverAlarm || t.atLimit ? 'warn' : 'neutral'}
              className="gap-1.5 whitespace-normal tabular-nums"
            >
              <span className="font-medium text-ink-1">{t.team}</span>
              <span>· {t.inFlight} in flight{t.limit !== null && <> / {t.limit}</>}</span>
              {t.overLimit && <span className="font-semibold">over limit</span>}
              {t.atLimit && !t.overLimit && <span className="font-semibold">at limit</span>}
              {t.limit === null && <span className="text-ink-4">· no limit set</span>}
              {t.longestWaitHours !== null && (
                <span className={t.anyOverAlarm ? 'font-semibold' : ''}>
                  · waiting {t.longestWaitHours.toFixed(0)}h{t.anyOverAlarm && ' — OVER ALARM'}
                </span>
              )}
            </Chip>
          ))}
        </div>
      )}

      {/* Sticky inside the screen root (never a wrapper around it), so the measure in
          workflow.spec is untouched and the filters stay in reach of a long list. One wrapping
          row: role views, then the search and the four filters at their natural widths, and the
          surface toggle at the end. */}
      <div ref={filterRef} className={cn(STICKY_HEADER_CLASS, 'flex flex-wrap items-center gap-x-2 gap-y-2 pt-2')}>
        {/* Role views. Switching these re-reads nothing. */}
        <Segmented<BoardRole> label="Role view" tone="accent" options={ROLE_OPTIONS} value={role} onChange={setRole} />
        <Field label={<VisuallyHidden>Search</VisuallyHidden>} className="gap-0">
          <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-36" />
        </Field>
        <Select size="sm" aria-label="Team" value={team} onChange={setTeam} options={withAll('All teams', teams)} />
        <Select size="sm" aria-label="Risk" value={risk} onChange={setRisk} options={withAll('Any risk', ['LOW', 'MEDIUM', 'HIGH'])} />
        <Select size="sm" aria-label="Status" value={status} onChange={setStatus} options={withAll('Any status', ['draft', 'ready', 'in-flight', 'merged', 'deferred'])} />
        <Select
          size="sm"
          aria-label="Grouping"
          value={grouping === 'none' ? '' : grouping}
          onChange={(v) => setGrouping((v || 'none') as BoardGrouping)}
          options={withAll('No grouping', ['sprint', 'team', 'person'])}
        />
        <Segmented<Surface>
          label="Board surface"
          tone="neutral"
          size="sm"
          className="ml-auto"
          options={[{ value: 'list', label: 'List', icon: List }, { value: 'graph', label: 'Graph', icon: Orbit }]}
          value={surface}
          onChange={setSurface}
        />
      </div>

      {scene && (
        // The board's own List | Graph above is the surface control; the figure draws no second
        // toggle, so there is one switch with one meaning on this screen.
        <SceneSlot
          id="constellation-board"
          data={scene}
          showToggle={false}
          height={280}
          onActivate={(id) => {
            const row = visible.find((r) => r.spec === id)
            if (row) onOpenSpec(row)
          }}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={role !== 'needs-me'
            ? 'No specs match. Try a wider filter.'
            : account
              ? 'Nothing is waiting on you.'
              // Signed out, "waiting on me" has no "me" — an empty list here is not a clean
              // slate, and claiming one was the F10 defect.
              : 'Nobody is signed in, so this view cannot say what is waiting on you. Sign in to the code host, or switch to Everything.'}
        />
      ) : (
        // The Flip container: positioned, so `absolute: true` resolves against it, not <main>.
        <div ref={listsRef} className="relative space-y-4" onKeyDown={onRowsKeyDown}>
          {groups.map((group) => (
            <div key={group.key || 'all'} className="space-y-1">
              {group.key && <Eyebrow as="h3" data-flip-id={`spec:group:${group.key}`}>{group.key}</Eyebrow>}
              <Card padding="none">
                <ul className="divide-y divide-line-1">
                  {group.rows.map((row) => (
                    <SpecRow key={row.spec} row={row} account={account} now={now} onOpen={(e) => open(row, e)} />
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function withAll(label: string, options: string[]) {
  return [{ value: '', label }, ...options.map((o) => ({ value: o, label: o }))]
}

/** The Graph surface's data, built from the FILTERED rows only — the scene is a view of the
 * same list, never a second list. A dependency outside the filter is a Ghost ("not shown"). */
export function constellationFrom(rows: BoardRow[]): SceneDataConstellation {
  const shown = new Set(rows.map((r) => r.spec))
  const bodies: Body[] = rows.map((row) => ({
    id: row.spec,
    source: 'board',
    label: row.title || row.name,
    status: row.status,
    risk: row.risk,
    channel: row.channel || undefined,
    team: row.team || undefined,
    sprint: row.sprint,
    nextOwner: row.nextOwner || undefined,
    engReview: row.engReview || undefined,
    dataReview: row.dataReview || undefined,
    dependsOn: row.dependsOn,
    buildOrderIndex: null,
    isNextUp: false,
    waitingOn: row.pullRequest?.waitingOn,
    overAlarm: row.pullRequest?.overAlarm,
    waitHours: row.pullRequest?.waitHours,
    row,
  }))
  const tethers: Tether[] = []
  const ghosts = new Map<string, Ghost>()
  for (const row of rows) {
    for (const dep of row.dependsOn) {
      const ghost = !shown.has(dep)
      tethers.push({ from: row.spec, to: dep, ghost })
      if (ghost) {
        const entry = ghosts.get(dep) ?? { id: dep, reason: 'not-shown', referencedBy: [] }
        entry.referencedBy.push(row.spec)
        ghosts.set(dep, entry)
      }
    }
  }
  return {
    source: 'board', bodies, tethers, ghosts: [...ghosts.values()], buildOrder: [], nextUp: null,
    dependencyGaps: [], hasData: rows.length > 0, note: null,
  }
}

function SpecRow({
  row, account, now, onOpen,
}: {
  row: BoardRow
  account: string | null
  now: Date
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const mine = rolesFor(row, account)
  const overdue = isOverdue(row, now)
  const days = daysWaiting(row, now)
  const where = row.pullRequest?.waitingOn ?? (row.status || 'no status')

  return (
    // No overflow-hidden on the Card (it would clip the hover card), so the corner rows round
    // themselves to match it.
    <li data-reveal="" className="first:[&_button]:rounded-t-xl last:[&_button]:rounded-b-xl">
      <HoverCard
        className="flex w-full"
        placement="bottom"
        content={<SpecHoverContent row={row} account={account} />}
        trigger={
          <button
            type="button"
            data-flip-id={`spec:${row.spec}`}
            onClick={onOpen}
            className="flex w-full items-start gap-4 px-4 py-2.5 text-left hover:bg-surface-2"
          >
            {/* Chips carry states (risk, mine, sprint); sentences are text. Aligned baselines
                and tabular ids are what make a dense board scannable (G4-5). */}
            <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-ink-3">{row.spec}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink-1">{row.title || row.name}</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                <Person handle={row.owner} label="owns" account={account} />
                <Person handle={row.developer} label="builds" account={account} />
                <Person handle={row.checker} label="checks" account={account} />
                <Person handle={row.nextOwner} label="next on" account={account} />
                {row.team && <span className="ml-2 text-ink-4">{row.team}</span>}
                {row.sprint && (
                  <Chip tone="mono" size="xs" className="ml-2" data-testid="sprint-chip">
                    {row.sprint}
                  </Chip>
                )}
              </span>
            </span>
            <span className="w-16 shrink-0">
              {row.risk && <Chip tone="mono" size="xs">{row.risk}</Chip>}
            </span>
            <span className="min-w-0 flex-1 text-xs">
              <span className={overdue ? 'font-medium text-status-error-ink' : 'text-ink-2'}>{where}</span>
              {days !== null && (
                <span className="ml-2 text-ink-4">
                  {/* "last moved", never "has waited" — the two are different, and only one of
                      them has actually been measured. */}
                  last moved {days === 0 ? 'today' : `${days}d ago`}
                </span>
              )}
              {overdue && <span className="ml-2 font-semibold text-status-error-ink">overdue</span>}
            </span>
            {mine.length > 0 && (
              <Chip tone="accent" size="xs" className="shrink-0">
                {mine.join(' · ')}
              </Chip>
            )}
          </button>
        }
      />
    </li>
  )
}

/** §6.5: the row's own facts, nothing aggregated, nothing that writes. */
function SpecHoverContent({ row, account }: { row: BoardRow; account: string | null }) {
  const who = (handle: string) => (samePerson(handle, account) ? 'you' : handle || 'nobody')
  const pr = row.pullRequest
  return (
    <span className="block space-y-1" data-testid="spec-hover-card">
      <span className="block">
        <span className="font-mono text-ink-4">{row.spec}</span> <span className="font-medium">{row.title || row.name}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <Chip tone="neutral" dot>{row.status || 'no status'}</Chip>
        {row.risk && <Chip tone="mono">{row.risk}</Chip>}
        {row.team && <Chip tone="neutral">{row.team}</Chip>}
        {row.sprint && <Chip tone="mono">{row.sprint}</Chip>}
      </span>
      <span className="block text-ink-2">
        owner {who(row.owner)} · developer {who(row.developer)} · checker {who(row.checker)}
      </span>
      {row.dependsOn.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-ink-4">depends on</span>
          {row.dependsOn.map((d) => <Chip key={d} tone="mono">{d}</Chip>)}
        </span>
      )}
      {pr && (
        <span className="block text-ink-2">
          {pr.waitingOn}
          {pr.waitHours !== undefined && <span className="text-ink-4"> · {pr.waitHours}h as reported</span>}
        </span>
      )}
      {row.nextOwner && <span className="block text-ink-2">next on {who(row.nextOwner)}</span>}
    </span>
  )
}

/** A person's handle, marked when it is the signed-in person — the spec asks for their own
 * name to stand out wherever it appears, which is what makes a dense board scannable. */
function Person({ handle, label, account }: { handle: string; label: string; account: string | null }) {
  if (!handle) return null
  const isMe = samePerson(handle, account)
  return (
    <span className="mr-2 whitespace-nowrap">
      {label}{' '}
      <span className={isMe ? 'font-semibold text-accent-700' : ''}>{isMe ? 'you' : handle}</span>
    </span>
  )
}
