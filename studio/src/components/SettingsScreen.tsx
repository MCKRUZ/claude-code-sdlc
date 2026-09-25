import { useCallback, useEffect, useState } from 'react'
import type { ConnectionInfo, ProjectSettings, SettingsSection } from '../../shared/types'

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
export function SettingsScreen({ projectPath }: { projectPath: string }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null)
  const [connection, setConnection] = useState<ConnectionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c] = await Promise.all([
      window.studio.getProjectSettings(projectPath),
      window.studio.getConnectionInfo(projectPath),
    ])
    setSettings(s)
    setConnection(c)
    setLoading(false)
  }, [projectPath])

  useEffect(() => { load() }, [load])

  if (loading && !settings) return <p className="text-sm text-slate-400">Reading this project’s settings…</p>
  if (!settings) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Settings</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Every setting here is stored in the project itself, not in Studio — so it travels with
          the repository and changes like any other file.
        </p>
      </div>

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
              <li key={t.team} className="flex items-baseline justify-between text-sm">
                <span className="text-slate-900">{t.team}</span>
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
              <li key={st.stage} className="flex items-baseline justify-between">
                <span className="text-slate-900">{st.stage}</span>
                <span className="text-slate-600">
                  {st.approval_required ? `needs ${st.approver || 'a named approver'}` : 'no approval needed'}
                </span>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-all text-slate-900">{value}</dd>
    </div>
  )
}
