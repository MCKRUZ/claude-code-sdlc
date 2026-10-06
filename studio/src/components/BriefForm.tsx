import { useEffect, useRef, useState } from 'react'
import type { BriefCandidatesResult, BuildBriefResult, DocumentFocus, RosterPerson } from '../../shared/types'
import { buildIssue, buildSelections, isWorkshopQuestion, type BriefCandidates } from '../briefFormRules'
import {
  clearBriefForm, initialBriefForm, loadBriefForm, saveBriefForm, type BriefFormState,
} from '../briefFormStore'
import { Notice } from '../ui'
import { messageOf, PanelButton, PanelError, PanelLoading, useLoaded } from './activityPanelBits'
import { toggled, withoutIndex } from './briefBits'
import { LogisticsSection } from './BriefLogistics'
import { ContradictionsSection, DocumentsSection, QuestionsSection } from './BriefPicks'
import { BriefResultView } from './BriefResultView'
import { ClaimsSection, DecisionsSection } from './BriefWriting'

const CANDIDATES_FAILED = 'The brief candidates could not be read.'
const BUILD_FAILED = 'The brief could not be built.'

type Built = Extract<BuildBriefResult, { ok: true }>

interface BriefFormProps {
  projectPath: string
  /** Who is signed in; the facilitator field starts as this name. */
  actor?: string
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
}

/** The workshop brief (spec 0032): choose what makes the one page, write what the documents say and
 * the decisions the room must leave with, fill in the logistics and build it. Opening it reads the
 * candidates and writes nothing; only Build writes. The main process checks every selection again. */
export function BriefForm({ projectPath, actor = '', onOpenDocument }: BriefFormProps) {
  const loaded = useLoaded<BriefCandidatesResult>(projectPath, () => window.studio.getBriefCandidates(projectPath), CANDIDATES_FAILED)
  return (
    <div data-testid="brief-panel" className="mt-2 space-y-2">
      {loaded.kind === 'loading' && <PanelLoading lines={3}>Reading the brief candidates…</PanelLoading>}
      {loaded.kind === 'failed' && <PanelError message={loaded.message} />}
      {loaded.kind === 'ready' && <Candidates result={loaded.value} projectPath={projectPath} actor={actor} onOpenDocument={onOpenDocument} />}
    </div>
  )
}

function Candidates({ result, ...rest }: { result: BriefCandidatesResult } & BriefFormProps) {
  if (!result.ok) return <PanelError message={result.error || CANDIDATES_FAILED} />
  if (!result.hasData) {
    return <div className="space-y-1 text-xs text-ink-2">{result.notes.map((note) => <p key={note}>{note}</p>)}</div>
  }
  return <BriefFormBody key={rest.projectPath} candidates={result} {...rest} />
}

/** The form's state is kept in the store on every change, so leaving the screen loses nothing. */
function useStoredForm(projectPath: string, candidates: BriefCandidates, actor: string) {
  const [form, setForm] = useState<BriefFormState>(() => loadBriefForm(projectPath) ?? initialBriefForm(candidates, actor))
  const latest = useRef(form)
  const update = (patch: Partial<BriefFormState>) => {
    latest.current = { ...latest.current, ...patch }
    saveBriefForm(projectPath, latest.current)
    setForm(latest.current)
  }
  return { form, update }
}

function useRoster(projectPath: string): RosterPerson[] {
  const [people, setPeople] = useState<RosterPerson[]>([])
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => window.studio.getProjectSettings(projectPath))
      .then((settings) => { if (!cancelled && settings.ok) setPeople(settings.roster.people) })
      .catch(() => { if (!cancelled) setPeople([]) })
    return () => { cancelled = true }
  }, [projectPath])
  return people
}

function useAlive() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  return alive
}

function BriefFormBody({ candidates, projectPath, actor = '', onOpenDocument }: BriefFormProps & { candidates: BriefCandidates }) {
  const { form, update } = useStoredForm(projectPath, candidates, actor)
  const roster = useRoster(projectPath)
  const [result, setResult] = useState<Built | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const building = useRef(false)
  const alive = useAlive()

  // The signed-in name can arrive after the form opened; it fills the field only while untouched.
  useEffect(() => {
    if (result === null && !form.facilitatorEdited && form.facilitator === '' && actor !== '') update({ facilitator: actor })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor])

  const issue = buildIssue(form, candidates)

  const build = async () => {
    if (building.current || issue !== null) return
    building.current = true
    setBusy(true)
    setError(null)
    try {
      const built = await window.studio.buildBrief(projectPath, buildSelections(form, candidates))
      if (!built.ok) {
        if (alive.current) setError(built.error || BUILD_FAILED)
        return
      }
      clearBriefForm(projectPath)
      if (!alive.current) return
      setResult(built)
      onOpenDocument(built.path)
    } catch (err) {
      if (alive.current) setError(messageOf(err, BUILD_FAILED))
    } finally {
      building.current = false
      if (alive.current) setBusy(false)
    }
  }

  if (result !== null) return <BriefResultView result={result} />
  return (
    <div data-testid="brief-form" className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <FormSections candidates={candidates} form={form} update={update} roster={roster} />
      <BuildBar candidates={candidates} form={form} update={update} issue={issue} busy={busy} onBuild={build} />
      {error && <PanelError message={error} />}
    </div>
  )
}

interface SectionsProps {
  candidates: BriefCandidates
  form: BriefFormState
  update: (patch: Partial<BriefFormState>) => void
  roster: RosterPerson[]
}

function FormSections({ candidates, form, update, roster }: SectionsProps) {
  const { limits } = candidates
  const addClaim = () => update({
    claims: [...form.claims, { text: form.claimDraft.text.trim(), docRef: form.claimDraft.docRef }],
    claimDraft: { text: '', docRef: '' },
  })
  const addDecision = () => update({ decisions: [...form.decisions, form.decisionDraft.trim()], decisionDraft: '' })
  return (
    <>
      <ContradictionsSection
        items={candidates.contradictions}
        ticked={form.contradictions}
        limit={limits.contradictions}
        onToggle={(id) => update({ contradictions: toggled(form.contradictions, id) })}
      />
      <QuestionsSection
        items={candidates.questions}
        ticked={form.questions}
        limit={limits.questions}
        onToggle={(id) => {
          if (candidates.questions.some((q) => q.id === id && isWorkshopQuestion(q))) update({ questions: toggled(form.questions, id) })
        }}
      />
      <DocumentsSection
        items={candidates.documents}
        ticked={form.loadBearing}
        range={limits.loadBearing}
        onToggle={(id) => update({ loadBearing: toggled(form.loadBearing, id) })}
      />
      <ClaimsSection
        documents={candidates.documents}
        claims={form.claims}
        draft={form.claimDraft}
        onDraft={(claimDraft) => update({ claimDraft })}
        onAdd={addClaim}
        onRemove={(i) => update({ claims: withoutIndex(form.claims, i) })}
      />
      <DecisionsSection
        decisions={form.decisions}
        draft={form.decisionDraft}
        standing={candidates.standingDecisions}
        range={limits.decisions}
        onDraft={(decisionDraft) => update({ decisionDraft })}
        onAdd={addDecision}
        onRemove={(i) => update({ decisions: withoutIndex(form.decisions, i) })}
      />
      <LogisticsSection form={form} roster={roster} onChange={update} />
    </>
  )
}

interface BuildBarProps {
  candidates: BriefCandidates
  form: BriefFormState
  update: (patch: Partial<BriefFormState>) => void
  issue: string | null
  busy: boolean
  onBuild: () => void
}

/** The reason Build is off (`brief-build-reason`) is printed once beside it, so it is not also
 * handed to the Button as a `disabledReason` — that would read twice. */
function BuildBar({ candidates, form, update, issue, busy, onBuild }: BuildBarProps) {
  return (
    <div className="space-y-2">
      {candidates.existingBrief && (
        <Notice tone="warn" role="none">
          <p>A brief already exists.</p>
          <label className="mt-1 flex items-center gap-2">
            <input type="checkbox" checked={form.replaceExisting} onChange={(e) => update({ replaceExisting: e.target.checked })} />
            Replace the existing brief
          </label>
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <PanelButton disabled={busy || issue !== null} onClick={onBuild}>Build the brief</PanelButton>
        {busy && <p role="status" className="text-xs text-ink-2">Building…</p>}
        {issue && <p data-testid="brief-build-reason" className="text-xs text-ink-3">{issue}</p>}
      </div>
    </div>
  )
}
