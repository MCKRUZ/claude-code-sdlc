import { useState } from 'react'
import type { DisciplineSignoff, StageReadiness } from '../../shared/types'
import { useClaudeIssue } from './ClaudeIssueContext'

interface Opening {
  projectName: string
  startedAt: number
  title?: string
  subtitle?: string
}

/** One optional Discipline / Section / Name row — the same triple `/sdlc-next` offers to
 * capture. All-empty rows are dropped before the call, so leaving this untouched is exactly
 * "no sign-offs", byte-identical to not offering the feature at all. */
function DisciplineRow({
  value, onChange, onRemove,
}: {
  value: DisciplineSignoff
  onChange: (v: DisciplineSignoff) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value.discipline}
        onChange={(e) => onChange({ ...value, discipline: e.target.value })}
        placeholder="Discipline (e.g. Design)"
        className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs"
      />
      <input
        value={value.section}
        onChange={(e) => onChange({ ...value, section: e.target.value })}
        placeholder="Section (e.g. interaction-specs)"
        className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-xs"
      />
      <input
        value={value.by}
        onChange={(e) => onChange({ ...value, by: e.target.value })}
        placeholder="Signed by"
        className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs"
      />
      <button type="button" onClick={onRemove} className="text-xs text-slate-400 hover:text-slate-700">
        Remove
      </button>
    </div>
  )
}

/** Signs off the current stage and advances the phase — the window's own version of
 * `/sdlc-next`. Shown only when there is something to offer: the stage is the project's
 * current one, every required document is complete, and every judgement question is already
 * confirmed (`SignOffQuestions`' own job, above this). Everything this does — checking the
 * gates, drafting and validating the frozen-layer summary, snapshotting the artifact record,
 * advancing — is the plugin's; a refusal is shown in the plugin's own words, naming which step
 * it stopped at, never a guess dressed up as an explanation. */
export function SignOffPanel({
  projectPath,
  readiness,
  actor,
  setOpening,
  onSignedOff,
}: {
  projectPath: string
  readiness: StageReadiness
  actor: string
  setOpening: (opening: Opening | null) => void
  onSignedOff: () => void
}) {
  const [signedBy, setSignedBy] = useState(actor)
  const [rows, setRows] = useState<DisciplineSignoff[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ fromPhase?: string; toPhase?: string; note?: string } | null>(null)
  // Drafting the phase summary is a model call; an installed Claude Code that lacks a flag Studio
  // emits would fail it after the gates passed. Disabled with the reason instead (F1).
  const claudeIssue = useClaudeIssue()

  if (success) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-medium text-slate-900">
          Signed off — moved from Phase {success.fromPhase} to Phase {success.toPhase}
        </h3>
        {success.note && <p className="mt-1 text-sm text-slate-700">{success.note}</p>}
      </div>
    )
  }

  const signOff = async () => {
    setBusy(true)
    setError(null)
    setOpening({
      projectName: readiness.display,
      startedAt: Date.now(),
      title: `Signing off ${readiness.display}…`,
      subtitle: 'Checking gates, drafting the phase summary, and advancing.',
    })
    try {
      const result = await window.studio.signOffStage(projectPath, readiness.stageId, signedBy, rows)
      if (result.ok) {
        setSuccess({ fromPhase: result.fromPhase, toPhase: result.toPhase, note: result.note })
        onSignedOff()
      } else {
        setError(result.error)
      }
    } finally {
      setOpening(null)
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-medium text-slate-900">Sign off {readiness.display}</h3>
      <p className="mt-1 text-sm text-slate-600">
        Checks the gates, drafts and validates a summary of this phase, and advances — the same
        thing <code className="rounded bg-slate-100 px-1 text-xs">/sdlc-next</code> does.
      </p>

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Signed by
        <input
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          className="mt-1 block w-56 rounded-lg border border-slate-200 px-2 py-1 text-sm"
        />
      </label>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-700">Discipline sign-offs (optional)</p>
        <div className="mt-1 space-y-1">
          {rows.map((row, i) => (
            <DisciplineRow
              key={i}
              value={row}
              onChange={(v) => setRows(rows.map((r, j) => (j === i ? v : r)))}
              onRemove={() => setRows(rows.filter((_, j) => j !== i))}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRows([...rows, { discipline: '', section: '', by: '' }])}
          className="mt-1 text-xs font-medium text-slate-500 underline decoration-slate-300 hover:text-slate-800"
        >
          + Add a discipline sign-off
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          {/* The plugin's own wording, whole — a person fixing a gate needs to know which one. */}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-amber-900">{error}</pre>
        </div>
      )}

      {claudeIssue && <p className="mt-3 text-xs text-amber-800">{claudeIssue}</p>}

      <button
        type="button"
        onClick={signOff}
        disabled={busy || !signedBy.trim() || claudeIssue !== null}
        className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
      >
        {busy ? 'Signing off…' : error ? 'Try again' : `Sign off and advance`}
      </button>
    </div>
  )
}
