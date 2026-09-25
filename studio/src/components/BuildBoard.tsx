import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Board, BoardGrouping, BoardRole, BoardRow } from '../../shared/types'
import {
  daysWaiting, filterBoard, groupBoard, isOverdue, rolesFor, samePerson, teamLoad,
} from '../../shared/boardModel'

/** Every spec, across every team (spec 0011).
 *
 * Fetched ONCE. Every tab, filter, search and grouping below is a transformation of what is
 * already in memory — the spec requires that switching a role view does not re-read the
 * repository, and a board that re-fetched on every tab would be both slow and capable of
 * answering differently for no reason the person caused.
 *
 * It opens on "needs me" because the constraint this screen exists for is not writing code,
 * it is knowing what is waiting to be checked and on whom. */
export function BuildBoard({
  projectPath,
  account,
  onOpenSpec,
}: {
  projectPath: string
  account: string | null
  onOpenSpec: (row: BoardRow) => void
}) {
  const [board, setBoard] = useState<Board | null>(null)
  const [role, setRole] = useState<BoardRole>('needs-me')
  const [grouping, setGrouping] = useState<BoardGrouping>('none')
  const [search, setSearch] = useState('')
  const [team, setTeam] = useState('')
  const [risk, setRisk] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setBoard(await window.studio.getBoard(projectPath))
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

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

  if (loading && !board) return <p className="text-sm text-slate-400">Reading the specs…</p>

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Build</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {rows.length} spec{rows.length === 1 ? '' : 's'}
            {visible.length !== rows.length && <> · {visible.length} shown</>}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
        >
          Refresh
        </button>
      </div>

      {board && !board.codeHostAvailable && (
        // Every row is still here — an empty board would read as "there is no work", which is
        // a different claim from "we could not reach the code host".
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Showing what the spec files say.</p>
          <p className="mt-0.5 text-xs">
            Live status — where each change is and who it is waiting on — needs the code host.
            {board.error && <> {board.error}</>}
          </p>
        </div>
      )}

      {load_.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {load_.map((t) => (
            <div
              key={t.team}
              className={`rounded-xl border px-3 py-2 text-xs ${
                t.overLimit ? 'border-red-300 bg-red-50 text-red-900'
                  : t.atLimit ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span className="font-medium">{t.team}</span>
              <span className="ml-2">
                {t.inFlight} in flight{t.limit !== null && <> / {t.limit}</>}
              </span>
              {t.overLimit && <span className="ml-2 font-semibold">over limit</span>}
              {t.atLimit && !t.overLimit && <span className="ml-2 font-semibold">at limit</span>}
              {t.limit === null && <span className="ml-2 text-slate-400">no limit set</span>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Role views. Switching these re-reads nothing. */}
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {([
            ['needs-me', 'Needs me'],
            ['owner', 'I own'],
            ['developer', "I'm building"],
            ['checker', 'I check'],
            ['everything', 'Everything'],
          ] as Array<[BoardRole, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              className={`px-3 py-1.5 text-xs font-medium ${
                role === value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
        />
        <Select value={team} onChange={setTeam} label="All teams" options={teams} />
        <Select value={risk} onChange={setRisk} label="Any risk" options={['LOW', 'MEDIUM', 'HIGH']} />
        <Select value={status} onChange={setStatus} label="Any status" options={['draft', 'ready', 'in-flight', 'merged']} />
        <Select
          value={grouping === 'none' ? '' : grouping}
          onChange={(v) => setGrouping((v || 'none') as BoardGrouping)}
          label="No grouping"
          options={['epic', 'team', 'person']}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-400">
          {role === 'needs-me'
            ? 'Nothing is waiting on you.'
            : 'No specs match. Try a wider filter.'}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.key || 'all'} className="space-y-1">
            {group.key && (
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">{group.key}</h3>
            )}
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {group.rows.map((row) => (
                <SpecRow key={row.spec} row={row} account={account} now={now} onOpen={() => onOpenSpec(row)} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}

function Select({
  value, onChange, label, options,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  options: string[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function SpecRow({
  row, account, now, onOpen,
}: {
  row: BoardRow
  account: string | null
  now: Date
  onOpen: () => void
}) {
  const mine = rolesFor(row, account)
  const overdue = isOverdue(row, now)
  const days = daysWaiting(row, now)
  const where = row.pullRequest?.waitingOn ?? (row.status || 'no status')

  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-slate-50">
        <span className="w-12 shrink-0 font-mono text-xs text-slate-400">{row.spec}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900">{row.title || row.name}</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            <Person handle={row.owner} label="owns" account={account} />
            <Person handle={row.developer} label="builds" account={account} />
            <Person handle={row.checker} label="checks" account={account} />
            {row.team && <span className="ml-2 text-slate-400">{row.team}</span>}
          </span>
        </span>
        <span className="w-16 shrink-0 text-xs font-medium text-slate-500">{row.risk}</span>
        <span className="min-w-0 flex-1 text-xs">
          <span className={overdue ? 'font-medium text-red-700' : 'text-slate-600'}>{where}</span>
          {days !== null && (
            <span className="ml-2 text-slate-400">
              {/* "last moved", never "has waited" — the two are different, and only one of
                  them has actually been measured. */}
              last moved {days === 0 ? 'today' : `${days}d ago`}
            </span>
          )}
          {overdue && <span className="ml-2 font-semibold text-red-700">overdue</span>}
        </span>
        {mine.length > 0 && (
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {mine.join(' · ')}
          </span>
        )}
      </button>
    </li>
  )
}

/** A person's handle, marked when it is the signed-in person — the spec asks for their own
 * name to stand out wherever it appears, which is what makes a dense board scannable. */
function Person({ handle, label, account }: { handle: string; label: string; account: string | null }) {
  if (!handle) return null
  const isMe = samePerson(handle, account)
  return (
    <span className="mr-2">
      {label}{' '}
      <span className={isMe ? 'font-semibold text-brand-700' : ''}>{isMe ? 'you' : handle}</span>
    </span>
  )
}
