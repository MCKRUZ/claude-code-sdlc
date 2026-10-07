import { useEffect, useRef, useState } from 'react'
import type { BoardRow, HandoffResult } from '../../shared/types'
import { NAME_DEVELOPER_FIRST, REASON_REQUIRED_PAST_LIMIT } from '../../shared/reasons'
import { Button, Card, Chip, DefinitionList, Eyebrow, Field, Input, Notice, toast } from '../ui'
import type { RosterEntry } from '../ui'
import { useEnter } from '../motion/useEnter'
import { contextFrom, handoffCeremony } from '../motion/choreo'
import { handoffCeremonyDue } from '../motion/choreo/handoffCeremony'
import { enabled as motionEnabled, motion, reduced as motionReduced } from '../motion/motion'
import { useRegisterDirty } from '../stores/dirtyStore'
import { RosterPicker } from './RosterPicker'
import { TypedActorForm } from './TypedActorForm'
import { useConnection } from '../stores/connectionStore'
import { hostReasons } from '../hostReasons'

/** Handing a spec to a developer (spec 0011).
 *
 * This screen enforces nothing. Every rule about who may be handed what lives in the
 * plugin's command, and asking it is the only way to find out — so the flow here is
 * deliberately "try it, and deal with the answer", not "check first, then try". A copy of
 * the rules living in this file would be a rule enforced only in the app, which is exactly
 * what the spec's Checking Plan tells its reviewer to look for.
 *
 * What it DOES do is respond usefully to each refusal, and it decides that from the
 * refusal's kind rather than its wording.
 *
 * It stays inline in `<main>` rather than a modal: the `<input>` it carries is the only one on
 * the screen, and board.spec counts page-wide inputs on the spec view, which this replaces. */
export function HandoffDialog({
  projectPath,
  row,
  roster,
  onClose,
  onHandedOff,
}: {
  projectPath: string
  row: BoardRow
  /** The Settings roster, when the host already holds it. Absent → the Developer field is free
   * text (no IPC is added here; the hand-off command validates the handle either way). */
  roster?: RosterEntry[]
  onClose: () => void
  onHandedOff: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEnter(rootRef, 'rise')
  const [developer, setDeveloper] = useState('')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<HandoffResult | null>(null)
  const [busy, setBusy] = useState(false)
  // Typed text is unsaved work until the hand-off succeeds; Esc-as-back waits for it (§6.2).
  useRegisterDirty(() => result?.ok !== true && (developer.trim() !== '' || reason.trim() !== ''))
  // M9: the success card's cells the ceremony moves — the developer's name (BUILDS IT), and the
  // branch / PR chips. The dialog half (the form fading, 120 ms) plays in `submit` before the
  // success card replaces it; this half plays once the card is in the DOM.
  const developerRef = useRef<HTMLSpanElement>(null)
  const branchRef = useRef<HTMLElement>(null)
  const prRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root || !handoffCeremonyDue(result, true)) return
    const ctx = contextFrom(root, { enabled: motionEnabled(), reduced: motionReduced() }, motion)
    const tl = handoffCeremony.play(ctx, { buildsCell: developerRef.current, prChips: [branchRef.current, prRef.current] })
    return () => { tl.kill() }
  }, [result])

  const refusal = result?.ok === false ? result.refusal! : null
  const atLimit = refusal?.kind === 'team_at_limit'
  // The hand-off's local half (branch, frontmatter, push) never needs the code-host CLI, so the
  // button stays enabled when the CLI is unavailable — it just says what will be skipped.
  const connection = useConnection()
  // Why code-host assignment will be skipped, or null when the CLI is usable (§7.1 wording).
  const skipReason = hostReasons(connection).handoff
  const onAzureDevOps = connection?.host === 'azure-devops'
  // D-OWNER-5: a typed name is offered only when the host could not identify the person.
  const offerTypedName = connection !== null && connection.accountSource === null && connection.cli.signedIn !== 'yes'

  const submit = async () => {
    setBusy(true)
    // The reason is sent ONLY after a refusal has already said the team is at its limit.
    // Sending it pre-emptively would let someone breach a limit they were never told about,
    // which is the whole value of having one.
    const next = await window.studio.handOff(projectPath, row.path, developer.trim(), atLimit ? reason : undefined)
    if (next.ok && rootRef.current) {
      // The plugin said yes: the form fades (M9's first beat) before the card takes its place. A
      // refusal skips this — nothing plays, the Notice below says why in the plugin's words.
      const ctx = contextFrom(rootRef.current, { enabled: motionEnabled(), reduced: motionReduced() }, motion)
      await handoffCeremony.play(ctx, { dialog: rootRef.current }).then()
    }
    setResult(next)
    setBusy(false)
    if (next.ok) {
      toast({
        tone: 'ok',
        title: next.alreadyInFlight ? `${row.spec} was already with a developer` : `${row.spec} handed off`,
        // The plugin's own value, never a guess at who it chose.
        detail: next.developer ? `Now with ${next.developer}` : undefined,
      })
    }
  }

  // The two roots are KEYED: M9's first beat tweens the form's root to opacity 0 and leaves it
  // there (the form is about to go). Without a key React would reuse that same <div> for the
  // success card — same type, same position — and "Handed off" would inherit the inline
  // `opacity: 0`. A fresh node starts at its natural state, which is what a cold reload shows.
  if (result?.ok) {
    return (
      <div key="handed-off" ref={rootRef} className="space-y-4">
        <h3 className="text-lg text-ink-1" data-page-heading>
          {result.alreadyInFlight ? 'Already with a developer' : 'Handed off'}
        </h3>
        <Card className="text-sm">
          <p className="text-ink-1">
            {row.spec} → <span ref={developerRef} className="font-medium" data-testid="handoff-developer">{result.developer}</span>
            {result.checker && <span className="text-ink-3"> · {result.checker} checks it</span>}
          </p>
          {(result.branch || result.prUrl) && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              {result.branch && <Chip ref={branchRef} casing="identifier" tone="mono" size="sm">{result.branch}</Chip>}
              {result.prUrl && <Chip ref={prRef} tone="accent" size="sm" dot>Pull request opened.</Chip>}
            </p>
          )}
          {result.assignmentError && (
            // The branch and the commit are real; nobody was told. Hiding this would leave
            // someone waiting for a review request that was never sent.
            <Notice tone="warn" className="mt-2">
              The hand-off is done locally, but the code host could not be told:{' '}
              {result.assignmentError} — assign it by hand once that is working.
            </Notice>
          )}
        </Card>
        <Button variant="primary" onClick={onHandedOff}>
          Back to the board
        </Button>
      </div>
    )
  }

  return (
    <div key="form" ref={rootRef} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          {/* Detail-screen rank (G4-1): the same size the spec view's title wears. */}
          <h3 className="text-lg text-ink-1" data-page-heading>Hand off {row.spec}</h3>
          <p className="mt-1 max-w-[64ch] text-sm text-ink-3">{row.title || row.name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {/* The three roles, stated before anyone commits to anything — the spec asks for the
          hand-off to name all three, because confusing who owns a change with who builds it
          is what makes review theatre. */}
      <Card>
        <DefinitionList
          columns={3}
          className="text-sm"
          items={[
            // C2: a WORD is never `ink-4` (decoration only) — these placeholders are words.
            { term: <Eyebrow as="span">Owns it</Eyebrow>, detail: row.owner || <span className="text-ink-3">nobody</span> },
            {
              term: <Eyebrow as="span">Builds it</Eyebrow>,
              detail: developer.trim() || <span className="text-ink-3">choose below</span>,
            },
            {
              term: <Eyebrow as="span">Checks it</Eyebrow>,
              detail: row.checker || <span className="text-ink-3">nobody yet</span>,
            },
          ]}
        />
      </Card>

      <RosterPicker
        roster={roster ?? []}
        value={developer}
        onChange={setDeveloper}
        label="Developer"
        placeholder="@handle"
        disabled={busy}
      />
      {onAzureDevOps && (
        <p className="text-xs text-ink-3">
          The checker&apos;s <code>email:</code> in <code>.sdlc/team.yaml</code> is what Azure DevOps receives.
        </p>
      )}
      {offerTypedName && <TypedActorForm projectPath={projectPath} />}

      {refusal && (
        <Notice tone="warn" title={refusalHeading(refusal.kind)}>
          {/* The plugin's own words, not a paraphrase — it knows why it refused. */}
          <p className="whitespace-pre-wrap">{refusal.message}</p>

          {atLimit && (
            <Field label="Why are you going past the limit? This is written into the record." className="mt-3">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
        </Notice>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={submit}
          loading={busy}
          loadingLabel="Handing off…"
          disabled={!developer.trim() || (atLimit && !reason.trim())}
          disabledReason={
            !developer.trim() ? NAME_DEVELOPER_FIRST
              : atLimit && !reason.trim() ? REASON_REQUIRED_PAST_LIMIT
                : undefined
          }
        >
          {skipReason
            ? `Hand off locally; code-host assignment will be skipped: ${skipReason}`
            : atLimit ? 'Hand off anyway' : 'Hand off'}
        </Button>
        {atLimit && !reason.trim() && (
          <span className="text-xs text-status-warn-ink">{REASON_REQUIRED_PAST_LIMIT}</span>
        )}
      </div>
    </div>
  )
}

/** A plain-language heading per refusal, chosen from the KIND. The detail underneath is
 * always the plugin's own message — this only frames it. */
function refusalHeading(kind: string): string {
  switch (kind) {
    case 'not_ready': return 'This spec is not ready to hand off yet'
    case 'unknown_developer': return 'That person is not on this project'
    case 'developer_is_checker': return 'That person is already checking this change'
    case 'team_at_limit': return 'That team is at its limit'
    default: return 'The hand-off was refused'
  }
}
