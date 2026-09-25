import { useCallback, useEffect, useState } from 'react'
import type { FoundationSummary, GateInventory, Scorecard } from '../../shared/types'
import { buildScorecardExport, hasNothingRecorded } from '../../shared/scorecardExport'

/** Three read-only screens (spec 0013): what Build inherited, how Build is going, and every
 * check a change must pass.
 *
 * Nothing here writes anything, and nothing here computes anything. Every scorecard number is
 * the plugin's, every gate description is the rails guide's, and what Foundation delivered is
 * read from those documents — Studio doing its own arithmetic on delivery measures is the
 * failure this spec names first, because a number nobody can trace is worse than no number in
 * a steering meeting.
 *
 * The rule that shapes most of the code below: NO DATA IS NOT ZERO. "Nobody has merged
 * anything yet" and "everything merged was rejected" are opposite situations, and a zero shows
 * them identically. Every measure says which it is, and what would produce data.
 */
export function ExplainViews({ projectPath }: { projectPath: string }) {
  const [view, setView] = useState<'foundation' | 'scorecard' | 'gates'>('foundation')

  return (
    <div className="space-y-5">
      <div className="flex gap-1">
        {([['foundation', 'What Build inherited'], ['scorecard', 'How Build is going'],
          ['gates', 'Checks and gates']] as const).map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                view === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {view === 'foundation'
        ? <FoundationView projectPath={projectPath} />
        : view === 'scorecard'
          ? <ScorecardView projectPath={projectPath} />
          : <GatesView projectPath={projectPath} />}
    </div>
  )
}

const WINDOWS = [14, 30, 90]

function ScorecardView({ projectPath }: { projectPath: string }) {
  const [windowDays, setWindowDays] = useState(14)
  const [card, setCard] = useState<Scorecard | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadable, setUnreadable] = useState(false)
  const [exported, setExported] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.studio.getScorecard(projectPath, windowDays)
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
      windowDays,
      now: new Date(),
    })
    const result = await window.studio.exportDocument(`how-build-is-going-${windowDays}d.md`, contents)
    setExported(result.ok ? (result.path ?? 'saved') : null)
  }

  if (loading && !card) return <p className="text-sm text-slate-400">Reading the scorecard…</p>

  if (unreadable) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {/* Deliberately NOT an all-zero scorecard. A zeroed screen is a claim about the
            project; this is a claim about the tool, and a steering meeting is exactly where
            confusing the two costs something. */}
        <p className="font-medium">The scorecard could not be read.</p>
        <p className="mt-0.5 text-xs">
          This is not the same as "nothing has happened" — no numbers are being shown because
          none could be read, not because they are zero.
        </p>
      </div>
    )
  }
  if (!card) return null

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">How Build is going</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Every number here is computed by the plugin from recorded events. Studio does no
            arithmetic of its own.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={exportScorecard}
            className="mr-2 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
          >
            Export for a meeting
          </button>
          {WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setWindowDays(d)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                windowDays === d ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
              }`}
            >
              {d} days
            </button>
          ))}
        </span>
      </div>

      {exported && (
        <p className="text-xs text-[var(--color-command-ok)]">
          Saved to <span className="font-mono">{exported}</span> — it contains exactly what is
          on this screen.
        </p>
      )}

      {nothingRecorded && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <p className="font-medium text-slate-900">No data in the last {windowDays} days.</p>
          <p className="mt-0.5 text-xs text-slate-500">
            These measures come from merged specs, reverts, deployments and incidents. They
            start filling in as work goes through the loop — this is an empty record, not a
            score of zero.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Measure
          label="Accepted as-is"
          value={card.accepted_as_is_rate}
          format={(v) => `${Math.round(v * 100)}%`}
          produces="a merged spec recorded as accepted without rework"
        />
        <Measure
          label="Rework or revert"
          value={card.rework_revert_rate}
          format={(v) => `${Math.round(v * 100)}%`}
          produces="a merged spec that was later reverted or reworked"
        />
        <Measure
          label="Sent back"
          value={card.bounce_back_rate}
          format={(v) => `${Math.round(v * 100)}%`}
          produces="a spec returned to its developer during checking"
        />
        <Measure
          label="Review wait (median)"
          value={card.review_wait_median_hours}
          format={(v) => `${v.toFixed(1)}h`}
          produces="a review that has been requested and answered"
        />
        {/* On its own line, never folded into the figure above. A slow security review hidden
            inside an average is a slow security review nobody acts on. */}
        <Measure
          label="Security review wait (median)"
          value={card.security_review_wait_median_hours}
          format={(v) => `${v.toFixed(1)}h`}
          produces="a security review that has been requested and answered"
          emphasis
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Delivery
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Measure label="Deployments" value={card.dora.deploy_count}
                   format={(v) => String(v)} produces="a recorded deployment" />
          <Measure label="Lead time (median)" value={card.dora.lead_time_median_hours}
                   format={(v) => `${v.toFixed(1)}h`} produces="a merged change that reached production" />
          <Measure label="Change failure rate" value={card.dora.change_fail_rate}
                   format={(v) => `${Math.round(v * 100)}%`} produces="a deployment that caused an incident" />
          <Measure label="Time to recover (median)" value={card.dora.time_to_recover_median_hours}
                   format={(v) => `${v.toFixed(1)}h`} produces="a closed incident" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Bugs that got through
        </h3>
        {card.escaped_bugs.length === 0 ? (
          <p className="text-sm text-slate-400">None recorded in this window.</p>
        ) : (
          <ul className="space-y-2">
            {card.escaped_bugs.map((bug, i) => (
              <li key={i} className="text-sm">
                <span className="text-slate-900">{String(bug.summary ?? 'a bug')}</span>
                {/* The retro input, not a bug count: which check should have caught it, and
                    what is proposed about that check. */}
                <span className="mt-0.5 block text-xs text-slate-500">
                  Should have been caught by: {String(bug.which_check ?? 'not recorded')}
                </span>
                {bug.proposed_fix ? (
                  <span className="block text-xs text-slate-500">
                    Proposed: {String(bug.proposed_fix)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Spec 0013 asks for this to be STATED, not merely absent. An absence explains nothing;
          saying why these are not measured is the part that changes a conversation. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Not measured here, on purpose
        </h3>
        <p className="mt-1 text-sm text-slate-700">
          Velocity, story points, pull-request counts and lines of code.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          They measure activity rather than outcome, and every one of them improves when work is
          split more finely — so a team can raise them without delivering anything more. The
          plugin refuses to record them at all, which is why they cannot appear here even by
          accident.
        </p>
      </div>
    </div>
  )
}

/** One measure. `null` is "no data" and says what would produce some — never rendered as a
 * zero, which would be a different and false claim. */
function Measure({
  label, value, format, produces, emphasis,
}: {
  label: string
  value: number | null
  format: (v: number) => string
  produces: string
  emphasis?: boolean
}) {
  return (
    <div className={`rounded-xl border p-3 ${emphasis ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      {value === null ? (
        <>
          <p className="mt-0.5 text-sm font-medium text-slate-400">no data</p>
          <p className="mt-0.5 text-xs text-slate-400">Produced by {produces}.</p>
        </>
      ) : (
        <p className="mt-0.5 text-lg font-semibold text-slate-900">{format(value)}</p>
      )}
    </div>
  )
}

function GatesView({ projectPath }: { projectPath: string }) {
  const [inventory, setInventory] = useState<GateInventory | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setInventory(await window.studio.getGateInventory(projectPath))
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  if (loading && !inventory) return <p className="text-sm text-slate-400">Reading the gates…</p>
  if (!inventory) return null

  if (!inventory.ok) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {/* Never "this project has no gates" — that is a much more alarming claim, and a
            different one. */}
        <p className="font-medium">The gates could not be described.</p>
        <p className="mt-0.5 text-xs">{inventory.error}</p>
      </div>
    )
  }

  const installed = inventory.gates.filter((g) => g.state === 'installed')
  const missing = inventory.gates.filter((g) => g.state === 'missing')
  const local = inventory.gates.filter((g) => g.state === 'not_a_pipeline')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Checks and gates</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          What every change has to pass. Described in{' '}
          <span className="font-mono text-xs">{inventory.guide_source}</span> — Studio does not
          describe the gates itself, so this screen and the pipelines cannot disagree.
        </p>
      </div>

      <GateList title="On every change here" gates={installed} tone="installed" />

      {missing.length > 0 && (
        <GateList
          title="The playbook ships these; this project does not run them"
          gates={missing}
          tone="missing"
          note="These are not protecting anything here. Listing them as gates would suggest otherwise."
        />
      )}

      {local.length > 0 && (
        <GateList
          title="Local gates"
          gates={local}
          tone="local"
          note="These run on a person's own machine rather than in the pipeline, so whether they are in place cannot be confirmed from the repository."
        />
      )}

      {inventory.unexpected.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            This project's own, not in the playbook
          </h3>
          <ul className="space-y-1">
            {inventory.unexpected.map((u) => (
              <li key={u.file} className="text-sm text-slate-700">
                <span className="font-mono text-xs">{u.file}</span>
                <span className="ml-2 text-xs text-slate-500">{u.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Recorded ways past a gate
        </h3>
        <ul className="space-y-1">
          {inventory.bypass_ledgers.map((l) => (
            <li key={l.file} className="text-sm">
              <span className="text-slate-900">{l.gate}</span>
              <span className="ml-2 text-xs text-slate-500">
                {l.present
                  ? <>recorded in <span className="font-mono">{l.file}</span></>
                  : 'no ledger in this project — there is no sanctioned way past it'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function GateList({
  title, gates, tone, note,
}: {
  title: string
  gates: GateInventory['gates']
  tone: 'installed' | 'missing' | 'local'
  note?: string
}) {
  const border = tone === 'missing' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</h3>
      <ul className="divide-y divide-slate-200">
        {gates.map((g) => (
          <li key={`${g.gate}-${g.file}`} className="py-2 text-sm">
            <span className="font-medium text-slate-900">{g.gate}</span>
            {g.optional && <span className="ml-2 text-xs text-slate-400">optional</span>}
            <span className="ml-2 font-mono text-xs text-slate-400">{g.file}</span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Runs on {g.fires_on || 'unstated'} · {g.blocks || 'unstated'}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

/** What Foundation handed to Build (spec 0013).
 *
 * Every item is read from the documents themselves — the spec asks for that explicitly, and
 * the reason is worth keeping in mind while reading this: a list written into the application
 * would look right the day somebody wrote it and stop matching the moment a template changed,
 * leaving a confident summary of something no longer true.
 *
 * A document Foundation did not produce is SHOWN, saying so. A Build that opened without a
 * risk-tier map is a real situation, and a quietly shorter list hides exactly that.
 */
function FoundationView({ projectPath }: { projectPath: string }) {
  const [summary, setSummary] = useState<FoundationSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setSummary(await window.studio.getFoundationSummary(projectPath))
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  if (loading && !summary) return <p className="text-sm text-slate-400">Reading what Foundation delivered…</p>
  if (!summary) return null

  if (!summary.ok) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {/* Never an empty list — that would read as "Foundation delivered nothing", a claim
            about the project rather than about this failing to read. */}
        <p className="font-medium">What Foundation delivered could not be read.</p>
        <p className="mt-0.5 text-xs">{summary.error}</p>
      </div>
    )
  }

  const delivered = summary.documents.filter((d) => d.exists)
  const absent = summary.documents.filter((d) => !d.exists)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">What Build inherited</h2>
        {summary.stage?.description && (
          <p className="mt-0.5 text-sm text-slate-500">{summary.stage.description}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          Read from the documents themselves, so this cannot describe a Foundation that no
          longer matches them.
        </p>
      </div>

      {delivered.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Delivered
          </h3>
          <ul className="divide-y divide-slate-200">
            {delivered.map((doc) => (
              <li key={doc.path} className="py-2">
                <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                {/* Where it lives, because a person reading this will want to open it. */}
                <p className="font-mono text-xs text-slate-400">{doc.path}</p>
                {doc.sections.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-600">{doc.sections.join(' · ')}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    No sections yet — the document exists but has not been filled in.
                  </p>
                )}
                {doc.note && <p className="mt-0.5 text-xs text-amber-700">{doc.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {absent.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Not delivered
          </h3>
          <ul className="space-y-2">
            {absent.map((doc) => (
              <li key={doc.path} className="text-sm">
                <span className="font-medium text-amber-900">{doc.name}</span>
                <span className="mt-0.5 block font-mono text-xs text-amber-800">{doc.path}</span>
                {doc.note && <span className="block text-xs text-amber-800">{doc.note}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Build can run without these. What they would have told you is simply not written
            down anywhere, which is worth knowing before anyone needs it.
          </p>
        </div>
      )}
    </div>
  )
}
