import { useCallback, useEffect, useState } from 'react'
import type {
  ApprovalStage, ConnectionInfo, ConnectionReport, ProjectSettings, SettingsSection,
} from '../../shared/types'

/** The project's settings (spec 0012) — read-only in this first cut, and honest about it.
 *
 * Every section names the FILE it is stored in, which spec 0012 asks for directly: a setting
 * whose home is invisible is one nobody can correct outside the app, and an app is not always
 * the right place to correct it from.
 *
 * Two distinctions this screen must never blur:
 *
 *   NOT CONFIGURED vs MISCONFIGURED. A project with no roster is ordinary. A project with a
 *   broken one needs fixing. Merging them sends a person to the wrong place.
 *
 *   A FIXED RULE vs A SETTING. The rules at the bottom cannot be changed here, and each says
 *   where it IS enforced. Listing an unenforced rule as a fact would tell someone they are
 *   protected by something that is not there — which is why this spec's own acceptance check
 *   was amended before this screen existed.
 */
export function SettingsScreen({ projectPath, actor }: { projectPath: string; actor: string }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null)
  const [connection, setConnection] = useState<ConnectionInfo | null>(null)
  const [report, setReport] = useState<ConnectionReport | null>(null)
  const [loading, setLoading] = useState(true)
  /** Nothing on this screen changes anything until edit mode is on, and the controls are
   * ABSENT rather than disabled outside it — the same rule spec 0010's document editor
   * follows, for the same reason: a greyed-out control still advertises something you
   * cannot do. */
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  /** What changed locally but has not reached the repository yet. Kept as the set of FILES
   * rather than a boolean, so the save can name exactly what it is committing. */
  const [unsaved, setUnsaved] = useState<string[]>([])
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c, r] = await Promise.all([
      window.studio.getProjectSettings(projectPath),
      window.studio.getConnectionInfo(projectPath),
      window.studio.getConnectionReport(projectPath),
    ])
    setSettings(s)
    setConnection(c)
    setReport(r)
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  /** Run one setting change, then re-read. The plugin validated before it wrote, so a refusal
   * means the file is untouched and there is nothing to undo. */
  const change = async (run: () => Promise<{ ok: boolean; file?: string; refusal?: { message: string } }>) => {
    setBusy(true)
    setRefusal(null)
    const result = await run()
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.refusal?.message ?? 'That change was refused.')
      return
    }
    if (result.file) setUnsaved((prev) => (prev.includes(result.file!) ? prev : [...prev, result.file!]))
    await load()
  }

  /** Send the change to the repository as an ordinary commit, with who and why — spec 0012's
   * own requirement. Deliberately a separate act from making the change: writing and
   * committing in one step gives nobody the chance to look at what they did first. */
  const saveToRepository = async () => {
    setBusy(true)
    setRefusal(null)
    const result = await window.studio.save(projectPath, reason.trim(), { actor })
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.error ?? 'Could not save this change.')
      return
    }
    setUnsaved([])
    setReason('')
  }

  if (loading && !settings) return <p className="text-sm text-slate-400">Reading this project’s settings…</p>
  if (!settings) return null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Settings</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Every setting here is stored in the project itself, not in Studio — so it travels with
            the repository and changes like any other file.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditing((on) => !on); setRefusal(null) }}
          className={editing
            ? 'shrink-0 rounded-lg border border-brand-600 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700'
            : 'shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700'}
        >
          {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>

      {refusal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {/* The plugin's own words — it knows why it refused, and it refused before writing,
              so nothing needs undoing. */}
          <p className="whitespace-pre-wrap">{refusal}</p>
        </div>
      )}

      {unsaved.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-medium text-brand-900">
            Changed here, not yet in the repository
          </p>
          <ul className="mt-1 space-y-0.5">
            {unsaved.map((f) => <li key={f} className="font-mono text-xs text-brand-800">{f}</li>)}
          </ul>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-brand-900">Why did this change?</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-brand-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={saveToRepository}
              disabled={busy || !reason.trim() || !actor.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Save to the repository
            </button>
            {!reason.trim() && (
              <span className="text-xs text-brand-800">
                A reason is required — it becomes the commit message, which is how anyone later
                finds out why this is set the way it is.
              </span>
            )}
          </div>
        </div>
      )}

      <Section title="Repository" file={connection?.localFolder ?? ''} fileLabel="This project lives at">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Repository" value={connection?.repo || 'no remote configured'} />
          <Row label="Branch" value={connection?.branch || 'unknown'} />
          <Row label="Signed in as" value={connection?.account || 'not signed in'} />
          <Row
            label="Default branch protected"
            value={
              connection?.branchProtected === null || connection?.branchProtected === undefined
                ? 'could not tell'
                : connection.branchProtected ? 'yes' : 'no'
            }
          />
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Studio reads and writes the project's own documents and specs. It never writes your
          code — that stays read-only, and a save it makes is an ordinary commit with a person
          and a reason on it.
        </p>
        {/* Stated as best-effort because it is: the real gate is whether a push gets
            rejected, never this probe. Presenting a guess as a fact here would be the same
            mistake as listing an unenforced rule below. */}
        <p className="mt-1 text-xs text-slate-400">
          Whether the branch is protected is a best guess from the code host's settings. What
          actually decides is whether a direct push is refused.
        </p>
      </Section>

      {report && (
        <Section title="Connection checks" file="" fileLabel="">
          <ul className="space-y-2">
            {report.checks.map((c) => (
              <li key={c.check} className="flex items-baseline gap-3 text-sm">
                {/* Three states, never two. "Could not tell" is its own answer and reads
                    differently from "no", because they send a person to different places. */}
                <span
                  className={`w-20 shrink-0 text-xs font-medium ${
                    c.state === 'yes' ? 'text-[var(--color-command-ok)]'
                      : c.state === 'no' ? 'text-amber-700'
                      : 'text-slate-400'
                  }`}
                >
                  {c.state === 'yes' ? 'yes' : c.state === 'no' ? 'no' : 'could not tell'}
                </span>
                <span className="min-w-0">
                  <span className="block text-slate-900">{c.question}</span>
                  <span className="block text-xs text-slate-500">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {Object.keys(report.not_universally_expected).length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-400">
                Pipelines not expected of every project
              </summary>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(report.not_universally_expected).map(([name, why]) => (
                  <li key={name} className="text-xs text-slate-500">
                    <span className="font-mono">{name}</span> — {why}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      )}

      <Section title="People and teams" file={settings.roster.file} section={settings.roster}>
        {settings.roster.present && settings.roster.people.length > 0 ? (
          <ul className="divide-y divide-slate-200">
            {settings.roster.people.map((person) => (
              <li key={person.handle} className="py-2 text-sm">
                <span className="font-medium text-slate-900">{person.name || person.handle}</span>
                <span className="ml-2 text-slate-500">{person.handle}</span>
                {person.team && <span className="ml-2 text-slate-400">{person.team}</span>}
                {settings.roster.teams.some((t) => t.lead === person.handle) && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">lead</span>
                )}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {person.roles?.length ? `May be: ${person.roles.join(', ')}` : 'No roles listed'}
                  {person.signs_off?.length ? ` · Signs off stages ${person.signs_off.join(', ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-slate-400">
          Adding someone here records that they may hold a role. It grants nobody access —
          Studio never invites anyone or changes anyone's repository permissions.
        </p>
      </Section>

      <Section title="Build limits" file={settings.wip_limits.file} section={settings.wip_limits}>
        {settings.wip_limits.teams.length > 0 && (
          <ul className="space-y-2">
            {settings.wip_limits.teams.map((t) => (
              <li key={t.team} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-900">{t.team}</span>
                {editing && (
                  <LimitEditor
                    current={t.wip_limit}
                    busy={busy}
                    onSet={(value) => change(() => window.studio.setTeamLimit(projectPath, t.team, value))}
                  />
                )}
                <span>
                  {/* The limit and what is actually in flight, always together. One without
                      the other invites the reader to supply the missing half from memory. */}
                  <span className={t.over_limit ? "text-red-700" : t.at_limit ? "text-amber-700" : "text-slate-600"}>
                    {t.in_flight} in flight / {t.wip_limit}
                  </span>
                  {t.over_limit && <span className="ml-2 font-semibold text-red-700">over limit</span>}
                  {t.at_limit && !t.over_limit && <span className="ml-2 font-semibold text-amber-700">at limit</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Change approval" file={settings.approval.file} section={settings.approval}>
        {settings.approval.stages.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {settings.approval.stages.map((st) => (
              <li key={st.stage} className="flex items-baseline justify-between gap-3">
                <span className="text-slate-900">{st.stage}</span>
                {editing ? (
                  <ApprovalEditor
                    stage={st}
                    busy={busy}
                    people={settings.roster.people.map((p) => p.handle)}
                    onSet={(required, approver) =>
                      change(() => window.studio.setStageApproval(projectPath, st.stage, required, approver))}
                  />
                ) : (
                  <span className="text-slate-600">
                    {st.approval_required ? `needs ${st.approver || 'a named approver'}` : 'no approval needed'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-slate-400">
          Where approval is on, changing a signed-off document saves your work to its own branch
          and asks the named person to approve it. Everyone else keeps seeing the signed-off
          version until they do.
        </p>
      </Section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Fixed here — change these in the playbook, not the project
        </h3>
        <ul className="mt-2 space-y-2">
          {settings.fixed_rules.map((r) => (
            <li key={r.rule} className="text-sm">
              <span className="text-slate-900">{r.rule}</span>
              {/* Where it is ACTUALLY enforced. A rule listed without that is a claim
                  nobody can check. */}
              <span className="mt-0.5 block text-xs text-slate-500">{r.enforced_by}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-400">
        Notifications and project details are not built yet.
      </p>
    </div>
  )
}

function Section({
  title, file, fileLabel = 'Stored in', section, children,
}: {
  title: string
  file: string
  fileLabel?: string
  section?: SettingsSection
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {file && (
          <span className="shrink-0 font-mono text-xs text-slate-400">{fileLabel} {file}</span>
        )}
      </div>

      {/* Not configured and misconfigured are different answers, shown differently. */}
      {section && !section.present && (
        <p className="mt-2 text-sm text-slate-500">
          This project has not set this up. Nothing is wrong — the file simply does not exist yet.
        </p>
      )}
      {section && section.errors.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-900">This file exists but could not be read cleanly:</p>
          <ul className="mt-1 space-y-0.5">
            {section.errors.map((e) => (
              <li key={e} className="text-xs text-amber-900">{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">{children}</div>
    </div>
  )
}

/** One team's limit. Committed on blur or Enter rather than per keystroke — the plugin
 * validates and writes on every call, and doing that per character would write the file
 * four times to set a two-digit number. */
function LimitEditor({
  current, busy, onSet,
}: {
  current: number
  busy: boolean
  onSet: (value: number) => void
}) {
  const [value, setValue] = useState(String(current))

  useEffect(() => { setValue(String(current)) }, [current])

  const commit = () => {
    const parsed = Number(value)
    // Refused by the plugin anyway; not sending it saves a pointless round trip and an
    // error message for something the person is probably mid-typing.
    if (!Number.isInteger(parsed) || parsed < 1 || parsed === current) {
      setValue(String(current))
      return
    }
    onSet(parsed)
  }

  return (
    <input
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs"
      aria-label="limit"
    />
  )
}

/** Approval for one stage. The approver list is the ROSTER — the plugin refuses anyone not on
 * it, since nothing could route an approval to them, so offering a free-text box here would
 * only invite a refusal. */
function ApprovalEditor({
  stage, busy, people, onSet,
}: {
  stage: ApprovalStage
  busy: boolean
  people: string[]
  onSet: (required: boolean, approver?: string) => void
}) {
  const [approver, setApprover] = useState(stage.approver ?? '')

  return (
    <span className="flex items-center gap-2">
      <select
        value={stage.approval_required ? 'on' : 'off'}
        disabled={busy}
        onChange={(e) => onSet(e.target.value === 'on', approver || undefined)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
        aria-label={`approval for ${stage.stage}`}
      >
        <option value="off">no approval needed</option>
        <option value="on">needs approval</option>
      </select>
      {stage.approval_required && (
        <select
          value={approver}
          disabled={busy}
          onChange={(e) => { setApprover(e.target.value); onSet(true, e.target.value) }}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
          aria-label={`approver for ${stage.stage}`}
        >
          <option value="">choose someone</option>
          {people.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      )}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-all text-slate-900">{value}</dd>
    </div>
  )
}
