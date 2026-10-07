import { useCallback, useEffect, useState } from 'react'
import type { SpecReadiness } from '../../shared/types'
import { WAITING_FOR_PLUGIN_ANSWER } from '../../shared/reasons'
import { Button, Card, Disclosure, EYEBROW_CLASS, EYEBROW_TYPE_CLASS, Eyebrow, Field, Input, Notice, Segmented } from '../ui'

type Tier = 'LOW' | 'MEDIUM' | 'HIGH'
const TIERS: Tier[] = ['LOW', 'MEDIUM', 'HIGH']

/** What a spec still needs before anyone can be handed it (spec 0011).
 *
 * Studio decides nothing here. Every item comes from the plugin's readiness checker — the
 * same source the hand-off command uses — so this screen and the command that actually
 * refuses cannot drift apart. A panel with its own opinion would eventually say "ready" to
 * something the hand-off then rejects, which is worse than no panel.
 *
 * The blocking/advisory split is the checker's too. In particular the vague-acceptance-check
 * lint ADVISES and never blocks: it flags a check two people could build different things
 * from, and that judgement belongs to a person, not to a pattern match. Showing it as
 * blocking would be Studio promoting a hint into a rule.
 *
 * One warn Notice per fact-class (G4-10): "not ready" is ONE fact, so the headline, the
 * checker's lines and a refusal all live inside the same amber frame rather than three boxes in
 * a row that read as three alarms. */
export function SpecReadinessPanel({
  projectPath,
  specPath,
  onHandOff,
}: {
  projectPath: string
  specPath: string
  onHandOff?: () => void
}) {
  const [readiness, setReadiness] = useState<SpecReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Only ever shown after a refusal has said a downgrade needs a name. Never pre-filled,
   * never remembered — the point of the rule is that each downgrade is a deliberate act
   * with somebody's name on it, and a remembered name would make the second one free. */
  const [authorisedBy, setAuthorisedBy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setReadiness(await window.studio.getSpecReadiness(projectPath, specPath))
    setLoading(false)
  }, [projectPath, specPath])

  useEffect(() => { load() }, [load])

  const act = async (run: () => Promise<{ ok: boolean; refusal?: { kind: string; message: string } }>) => {
    setBusy(true)
    setRefusal(null)
    const result = await run()
    setBusy(false)
    if (!result.ok) {
      setRefusal(result.refusal?.message ?? 'That change was refused.')
      // The window does not decide this; it reacts to what the plugin said.
      if (result.refusal?.kind === 'lowering_needs_authorisation') setAuthorisedBy('')
      return
    }
    setAuthorisedBy(null)
    await load()
  }

  if (loading && !readiness) return <p className="text-sm text-ink-3" role="status" aria-busy="true">Checking this spec…</p>
  if (!readiness) return null

  if (!readiness.ok) {
    return <Notice tone="error">{readiness.error ?? 'Could not check this spec.'}</Notice>
  }

  // The plugin's tier is the value; a tier it does not know is shown as none selected rather
  // than snapped to one Studio chose.
  const currentTier = TIERS.includes(readiness.risk as Tier) ? (readiness.risk as Tier) : ('' as Tier)

  /* Two buttons, two different rules, deliberately.
     HAND OFF appears only when the spec is actually ready — offering an action that is going to
     be refused teaches people to ignore the panel above it.
     MARK READY appears even when it is not, because its refusal comes back from the plugin WITH
     its reasons; hiding that button would make the rule invisible instead of enforced, and the
     person would never learn what is missing. */
  const markReady = readiness.status === 'draft' && (
    <Button
      size="sm"
      disabled={busy}
      disabledReason={WAITING_FOR_PLUGIN_ANSWER}
      onClick={() => act(() => window.studio.markSpecReady(projectPath, specPath))}
    >
      Mark ready
    </Button>
  )

  return (
    <div className="space-y-3">
      {readiness.ready ? (
        <Card tone="ok">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-status-ok-ink">Ready to hand off.</p>
            <div className="flex shrink-0 gap-2">
              {markReady}
              {onHandOff && <Button variant="primary" size="sm" onClick={onHandOff}>Hand off</Button>}
            </div>
          </div>
        </Card>
      ) : (
        // The ONE notice for "not ready": headline, the checker's own lines under a small
        // eyebrow, and — when the plugin refused something — its words as the last paragraph.
        // `aria-label` names the block for a reader; the kit's warn role (polite status) stays.
        <Notice
          tone="warn"
          aria-label="Still needed"
          title={`${readiness.blocking.length} thing${readiness.blocking.length === 1 ? '' : 's'} still needed before this can be handed off.`}
          actions={markReady || undefined}
        >
          {/* The eyebrow TYPE by name: bare `text-eyebrow` compiles to the colour utility only. */}
          <p className={`mt-1 ${EYEBROW_TYPE_CLASS} text-status-warn-ink`}>Still needed</p>
          <ul className="mt-1 space-y-1.5">
            {readiness.blocking.map((f, i) => (
              <li key={`${f.check}-${i}`} className="text-sm">
                <span className="text-status-warn-ink">•</span>{' '}
                <span className="text-ink-1">{f.message}</span>
              </li>
            ))}
          </ul>
          {refusal && <p className="mt-2 whitespace-pre-wrap">{refusal}</p>}
        </Notice>
      )}

      <Card>
        <Eyebrow as="h3" className="mb-2">Risk tier</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Tier>
            label="Risk tier"
            tone="inverse"
            value={currentTier}
            disabled={busy}
            disabledReason={WAITING_FOR_PLUGIN_ANSWER}
            options={TIERS.map((tier) => ({ value: tier, label: tier }))}
            onChange={(tier) => act(() => window.studio.setSpecRisk(
              projectPath, specPath, tier, authorisedBy?.trim() || undefined,
            ))}
          />
          <span className="text-xs text-ink-3">
            Raising a tier is free. Lowering one is recorded against whoever decided it.
          </span>
        </div>

        {authorisedBy !== null && (
          <Field label="Who authorised lowering this tier? Written into the spec." className="mt-3">
            <Input
              value={authorisedBy}
              onChange={(e) => setAuthorisedBy(e.target.value)}
              className="border-status-warn-line"
            />
          </Field>
        )}
      </Card>

      {/* A refusal on a READY spec (a tier change, say) has no "not ready" notice to live in, so
          it gets its own — the plugin's own words, never a paraphrase. */}
      {refusal && readiness.ready && (
        <Notice tone="warn">
          <p className="whitespace-pre-wrap">{refusal}</p>
        </Notice>
      )}

      {readiness.advisory.length > 0 && (
        // Plain card, not a notice: nothing here stops a hand-off.
        <Card as="div" role="region" aria-label="Worth a look" data-tone="advisory">
          <Eyebrow as="h3" className="text-accent-text">Worth a look</Eyebrow>
          <ul className="mt-2 space-y-1.5">
            {readiness.advisory.map((f, i) => (
              <li key={`${f.check}-${i}`} className="text-sm">
                <span aria-hidden="true" className="text-ink-4">–</span>{' '}
                <span className="text-ink-1">{f.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">
            These do not stop a hand-off. A flagged acceptance check is a hint that two people could build
            different things from it — whether that is true is a judgement, not a pattern match.
          </p>
        </Card>
      )}

      {readiness.passed.length > 0 && (
        <Card as="div" padding="md">
          <Disclosure
            summaryProps={{ className: `cursor-pointer ${EYEBROW_CLASS}` }}
            summary={`${readiness.passed.length} check${readiness.passed.length === 1 ? '' : 's'} already passing`}
          >
            <ul className="mt-2 space-y-1">
              {readiness.passed.map((f, i) => (
                <li key={`${f.check}-${i}`} className="text-sm text-ink-3">
                  <span className="text-status-ok-ink">✓</span> {f.message}
                </li>
              ))}
            </ul>
          </Disclosure>
        </Card>
      )}
    </div>
  )
}
