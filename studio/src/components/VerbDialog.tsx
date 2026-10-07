// The omnibar's dialog (togo-command-center.md §3.6, §2.4): the exact line the plugin will be
// asked to run, the actor and where that identity came from, the preconditions the plugin will
// check, one Confirm — and then the plugin's answer, verbatim, headed by its exit code alone.
// Nothing runs before Confirm; nothing is shown as changed until the exit code AND the host's
// refreshed reads have both arrived (`onDone` re-runs the P-class reads App already holds).
// Every write button carries `data-write` (steering mode asserts zero of them). No actor → the
// Confirm is disabled with `reasons.NO_ACTOR` and the typed-name form opens, when the host could
// not identify the person. A recipient the roster does not know is a visible gap: the Confirm is
// withheld and a roster picker takes its place — no free text reaches `--to`.
import { useCallback, useMemo, useState } from 'react'
import type { SprintVerbRequest } from '../../shared/types'
import { NO_ACTOR, NO_ROSTER, newerPlugin, notOnRoster, PICK_RECIPIENT, TWO_LEDGER_LINES } from '../../shared/reasons'
import { identityLabel, normalizeHandle } from '../../shared/identity'
import { validateSprintVerbRequest, VERB_CAPABILITY } from '../../shared/sprintVerbArgv'
import { Button, Dialog, Field, Input, Notice, cn } from '../ui'
import type { RosterEntry } from '../ui'
import type { NavTarget } from '../../shared/nav'
import type { IntentMatch, Recipient } from '../palette/intents'
import { useConnection } from '../stores/connectionStore'
import { RosterPicker } from './RosterPicker'
import { TypedActorForm } from './TypedActorForm'
import { bridgeMissingView, decisionResultView, dialogTitle, preconditions, previewLine, sprintResultView, transitionResultView, type ResultView } from './verbDialogModel'

export interface VerbDialogProps {
  projectPath: string
  match: IntentMatch
  roster: RosterEntry[]
  /** `generate_status.py --json` capabilities; null while unknown. */
  capabilities: readonly string[] | null
  onClose: () => void
  /** Called after an exit 0: the host re-runs the reads it holds. */
  onDone: () => void
  /** "pull" on a slated spec opens the existing hand-off flow for that spec. */
  onHandOff: (specId: string) => void
  onNavigate: (target: NavTarget) => void
}

const TONE_CLASS: Record<ResultView['tone'], string> = {
  ok: 'border-status-ok-line bg-status-ok-bg text-status-ok-ink',
  warn: 'border-status-warn-line bg-status-warn-bg text-status-warn-ink',
  error: 'border-today-late-line bg-today-late-bg text-today-late-ink',
}

export function VerbDialog({ projectPath, match, roster, capabilities, onClose, onDone, onHandOff, onNavigate }: VerbDialogProps) {
  const connection = useConnection()
  const actor = identityLabel(connection?.account, connection?.rosterHandle)
  const offerTypedName = connection !== null && connection.accountSource === null && connection.cli.signedIn !== 'yes'
  const [recipient, setRecipient] = useState<Recipient | undefined>(match.intent.kind === 'sprint' ? match.intent.recipient : undefined)
  /** The picker's text; it becomes `--to` ONLY once it names a roster handle. */
  const [pickerText, setPickerText] = useState('')
  const [reason, setReason] = useState(match.intent.kind === 'sprint' && 'reason' in match.intent.request ? match.intent.request.reason ?? '' : '')
  const [newSprint, setNewSprint] = useState({ sprint: match.intent.kind === 'new-sprint' ? match.intent.sprint ?? '' : '', goal: '', start: '', days: '', target: '' })
  const [results, setResults] = useState<ResultView[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const intent = match.intent

  /** The request as it stands now — the parsed one, with the picked recipient and typed reason. */
  const request = useMemo<SprintVerbRequest | null>(() => {
    if (intent.kind === 'sprint') {
      const r = intent.request
      if (r.verb === 'handoff') return { ...r, to: recipient?.handle ?? '' }
      if (r.verb === 'verdict' || r.verb === 'unslate' || r.verb === 'carry') return { ...r, reason: reason || undefined } as SprintVerbRequest
      return r
    }
    if (intent.kind === 'pull' && !intent.slated && intent.sprint) return { verb: 'slate', sprint: intent.sprint, specs: [intent.spec] }
    if (intent.kind === 'new-sprint') {
      const days = Number(newSprint.days)
      return { verb: 'new', sprint: newSprint.sprint.trim().toUpperCase(), goal: newSprint.goal, start: newSprint.start, ...(newSprint.days ? { days } : {}), target: Number(newSprint.target) }
    }
    return null
  }, [intent, recipient, reason, newSprint])

  const capability = request ? VERB_CAPABILITY[request.verb] : intent.kind === 'confirm-tier' ? 'confirm-tier' : null
  const lacks = capability && capabilities !== null && !capabilities.includes(capability) ? newerPlugin(capability) : null
  const unresolved = recipient && recipient.handle === null ? recipient.unresolved : null
  /** A hand-off whose `--to` names nobody yet (the `h` key on a card, or a typed stranger): the
   * picker shows and the Confirm is PRESENT and disabled with the reason — never withheld, never a
   * guess (§2.7: a disabled control always carries its reason). */
  const needsRecipient = intent.kind === 'sprint' && intent.request.verb === 'handoff' && !recipient?.handle
  const recipientGap = needsRecipient ? (unresolved ? notOnRoster(unresolved) : PICK_RECIPIENT) : null
  const needsReason = intent.kind === 'sprint' && (intent.request.verb === 'unslate' || intent.request.verb === 'carry' || (intent.request.verb === 'verdict' && intent.request.verdict === 'n-a'))
  const disabledReason = !actor ? NO_ACTOR : lacks ?? recipientGap
  /** The line previewed and later reported as "ran": the LIVE request (picked recipient, typed
   * reason) for a sprint verb; the parsed intent's own line otherwise. */
  const preview = request && intent.kind === 'sprint' ? previewLine({ kind: 'sprint', request }, actor) : previewLine(intent, actor)

  const record = useCallback((view: ResultView) => {
    setResults((prev) => [...prev, view])
    if (view.tone === 'ok') onDone()
    return view.tone === 'ok'
  }, [onDone])

  const runSprint = useCallback(async (req: SprintVerbRequest) => {
    const studio = window.studio as Partial<typeof window.studio>
    if (typeof studio.runSprintVerb !== 'function') return record(bridgeMissingView(previewLine({ kind: 'sprint', request: req }, actor), 'runSprintVerb'))
    return record(sprintResultView(await studio.runSprintVerb(projectPath, req)))
  }, [projectPath, actor, record])

  const confirm = async () => {
    setErrors([])
    setBusy(true)
    try {
      const studio = window.studio as Partial<typeof window.studio>
      const ran = preview
      if (request) {
        const problems = validateSprintVerbRequest(request)
        if (problems.length > 0) { setErrors(problems); return }
        await runSprint(request)
      } else if (intent.kind === 'defer') {
        record(transitionResultView(ran, await window.studio.deferSpec(projectPath, intent.path, intent.reason)))
      } else if (intent.kind === 'decide') {
        if (typeof studio.decideDecision !== 'function') record(bridgeMissingView(ran, 'decideDecision'))
        else record(decisionResultView(ran, await studio.decideDecision(projectPath, intent.id, intent.resolution)))
      } else if (intent.kind === 'decision') {
        if (typeof studio.openDecision !== 'function') record(bridgeMissingView(ran, 'openDecision'))
        else record(decisionResultView(ran, await studio.openDecision(projectPath, intent.text)))
      } else if (intent.kind === 'confirm-tier') {
        if (typeof studio.confirmTier !== 'function') record(bridgeMissingView(ran, 'confirmTier'))
        else record(transitionResultView(ran, await studio.confirmTier(projectPath, intent.path)))
      } else if (intent.kind === 'close') {
        onClose()
        onNavigate({ area: 'closing' })
      } else if (intent.kind === 'pull' && intent.slated) {
        onClose()
        onHandOff(intent.spec)
      }
    } finally {
      setBusy(false)
    }
  }

  /** `defer NNNN to SNN` on a plugin without `sprint-carry`: unslate, then slate — two ledger
   * lines, not atomic, said so; stops at the first non-zero exit. */
  const twoLines = async () => {
    if (intent.kind !== 'sprint' || intent.request.verb !== 'carry') return
    const { spec, to } = intent.request
    setBusy(true)
    try {
      if (await runSprint({ verb: 'unslate', spec, reason: reason || intent.request.reason })) await runSprint({ verb: 'slate', sprint: to, specs: [spec] })
    } finally {
      setBusy(false)
    }
  }

  const confirmLabel = intent.kind === 'close' ? 'Open the close screen' : intent.kind === 'pull' && intent.slated ? 'Open the hand-off' : 'Confirm'
  const isWrite = !(intent.kind === 'close' || (intent.kind === 'pull' && intent.slated))
  const done = results.some((r) => r.tone === 'ok')

  return (
    <Dialog open onClose={onClose} title={dialogTitle(intent)} size="lg" data-testid="verb-dialog"
      description={match.subtitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{done ? 'Dismiss' : 'Cancel'}</Button>
          {intent.kind === 'sprint' && intent.request.verb === 'carry' && lacks ? (
            <Button variant="secondary" data-write="" loading={busy} disabled={!actor} disabledReason={!actor ? NO_ACTOR : undefined} onClick={twoLines} title={TWO_LEDGER_LINES}>
              Unslate, then slate — {TWO_LEDGER_LINES}
            </Button>
          ) : null}
          {!done ? (
            <Button variant="primary" {...(isWrite ? { 'data-write': '' } : {})} loading={busy} loadingLabel="Running…" disabled={Boolean(disabledReason)} disabledReason={disabledReason ?? undefined} onClick={confirm}>
              {confirmLabel}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <pre data-testid="verb-preview" className="overflow-x-auto rounded-[10px] border border-line-1 bg-surface-2 px-3 py-2 font-mono text-(length:--text-ident) leading-(--text-ident--line-height) tracking-(--text-ident--letter-spacing) text-ink-1">{preview}</pre>
        <p className="text-ink-2" data-testid="verb-actor">
          {actor
            ? <>Recorded against <span className="font-medium text-ink-1">{actor}</span>{connection?.accountSource ? <span className="text-ink-3"> · {connection.accountSource}</span> : null}</>
            : <span className="text-ink-3">{NO_ACTOR}</span>}
        </p>
        {!actor && offerTypedName ? <TypedActorForm projectPath={projectPath} /> : null}
        {recipientGap !== null ? (
          <div className="space-y-2">
            <Notice tone={unresolved ? 'warn' : 'info'}>{unresolved ? `“${unresolved}” is not on the roster — pick the person.` : 'Hand off to a person on the roster.'}</Notice>
            <RosterPicker
              roster={roster}
              value={pickerText}
              onChange={(text) => {
                setPickerText(text)
                const hit = roster.find((p) => normalizeHandle(p.handle) === normalizeHandle(text))
                setRecipient(hit ? { handle: hit.handle } : unresolved ? { handle: null, unresolved } : undefined)
              }}
              allowFreeText={false}
              label="Hand off to"
              disabled={roster.length === 0}
              disabledReason={roster.length === 0 ? NO_ROSTER : undefined}
            />
          </div>
        ) : null}
        {needsReason ? (
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="recorded in the ledger line" />
          </Field>
        ) : null}
        {intent.kind === 'new-sprint' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sprint id"><Input value={newSprint.sprint} onChange={(e) => setNewSprint({ ...newSprint, sprint: e.target.value })} placeholder="S09" /></Field>
            <Field label="Start (YYYY-MM-DD)"><Input value={newSprint.start} onChange={(e) => setNewSprint({ ...newSprint, start: e.target.value })} placeholder="2026-10-13" /></Field>
            <Field label="Goal" className="col-span-2"><Input value={newSprint.goal} onChange={(e) => setNewSprint({ ...newSprint, goal: e.target.value })} /></Field>
            <Field label="Business days"><Input value={newSprint.days} onChange={(e) => setNewSprint({ ...newSprint, days: e.target.value })} placeholder="10" /></Field>
            <Field label="Target specs"><Input value={newSprint.target} onChange={(e) => setNewSprint({ ...newSprint, target: e.target.value })} placeholder="6" /></Field>
          </div>
        ) : null}
        {intent.kind === 'pull' && !intent.slated && !intent.sprint ? <Notice tone="info">No active sprint — <code>new sprint</code> first; the hand-off comes after the slate.</Notice> : null}
        <div>
          <p className="text-xs font-medium text-ink-2">The plugin will check</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-3">{preconditions(intent).map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        {errors.length > 0 ? <Notice tone="warn" role="alert"><ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice> : null}
        {results.map((r, i) => (
          <section key={i} data-testid="verb-result" data-tone={r.tone} aria-live="polite" className={cn('rounded-[10px] border px-3 py-2', TONE_CLASS[r.tone])}>
            <h3 className="text-sm font-semibold">{r.heading}</h3>
            <p className="mt-0.5 font-mono text-2xs opacity-80">{r.ran}</p>
            {r.stdout ? <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{r.stdout}</pre> : null}
            {r.stderr ? <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{r.stderr}</pre> : null}
          </section>
        ))}
      </div>
    </Dialog>
  )
}
