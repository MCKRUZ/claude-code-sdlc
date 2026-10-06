import type { AdvanceResult, DeclarationStatus, HandoffReportResult, ProjectStage } from '../../shared/types'
import { Button, Card, Eyebrow, Notice } from '../ui'

/** Build was declared finished, and the project says so — not this session.
 *
 * Two things are said carefully rather than conveniently:
 *
 *   A date that was never recorded reads as "not recorded", never as today. Showing the
 *   current date beside "declared" would invent a fact, and this screen exists to stop exactly
 *   that kind of invention.
 *
 *   A missing NAME says so too. A stage advanced before sign-offs were recorded, or advanced
 *   without a name, is a real and different thing from one nobody signed — and rendering an
 *   empty name would put a blank signature line in front of somebody, which reads as signed.
 */
export function AlreadyDeclared({ stage }: { stage: ProjectStage }) {
  const when = stage.completed_at ? new Date(stage.completed_at).toLocaleString() : null
  return (
    <div className="space-y-4">
      <Card>
        <h2 data-page-heading tabIndex={-1} className="text-xl font-semibold text-ink-1">Build is declared complete</h2>
        <p className="mt-1 text-sm text-ink-1">
          {stage.signed_off_by
            ? <>Signed off by {stage.signed_off_by}</>
            : <>No name was recorded against this declaration</>}
          {when ? <> on {when}.</> : <>. The time was not recorded.</>}
        </p>
        <p className="mt-2 text-xs text-ink-3">
          Read from the project's own record, so it says the same thing on everybody's machine.
        </p>
      </Card>
      {/* C2: a sentence is never `ink-4` — that colour is for decoration, not words. */}
      <p className="text-xs text-ink-3">
        Late work rides the loop one spec at a time, as usual. Build does not reopen.
      </p>
    </div>
  )
}

/** Moving the project to the next stage — the act that makes the declaration permanent.
 *
 * Before this existed, the screen said who declared Build finished and forgot it the moment the
 * window closed: true of one session rather than of the project. The stage move is what writes
 * the name and the time into the project's own record, which is why the two are one piece of
 * work rather than two.
 *
 * Every rule belongs to the plugin. Its gate checks decide whether the stage may move, and when
 * they refuse, their own words are shown rather than a summary — a person who needs to fix a
 * gate needs to know which one. The success card carries `data-ceremony-card` so the screen can
 * hand it to the sign-off ceremony (§4.2 #10) once the plugin has said yes.
 */
export function AdvancePanel({ result, busy, onAdvance }: { result: AdvanceResult | null; busy: boolean; onAdvance: () => void }) {
  if (result?.ok) {
    // M1's signer line, in the detail voice. A declaration the plugin recorded with no name says
    // "no name recorded" — an empty signature line reads as signed by somebody.
    const signer = result.signedBy?.trim() ?? ''
    return (
      <Card tone="ok" data-ceremony-card="">
        <h3 className="text-sm font-medium text-ink-1">
          Moved on from {result.fromPhase} to {result.toPhase}
        </h3>
        <p className="mt-2 text-lg font-[650] tracking-[-0.02em] text-ink-1">
          {signer ? <>Signed off by {signer}</> : <>Completed · no name recorded</>}
        </p>
        {result.note && <p className="mt-1 text-sm text-ink-1">{result.note}</p>}
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="text-sm font-medium text-ink-1">Move to the next stage</h3>
      <p className="mt-1 text-sm text-ink-2">
        This is what records the declaration in the project itself, rather than only here. It
        runs the stage's own gate checks first.
      </p>
      {result && !result.ok && (
        <Notice tone="warn" className="mt-2">
          {/* The plugin's gate output, whole. Somebody who has to fix a gate needs to know
              which one, and a tidied summary is how that gets lost. */}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{result.error}</pre>
          {result.advancedLocally && (
            <p className="mt-2 text-xs font-medium">
              The stage moved on this machine only — for everybody else Build is still open.
            </p>
          )}
        </Notice>
      )}
      <Button variant="primary" className="mt-3" onClick={onAdvance} disabled={busy} loading={busy} loadingLabel="Moving…">
        {result && !result.ok ? 'Try again' : 'Move to the next stage'}
      </Button>
    </Card>
  )
}

/** What happened to the hand-over document, said plainly in every case.
 *
 * Three outcomes, and each needs a different thing from the person, so none of them is folded
 * into the others:
 *
 *   produced and saved  — the numbers are assembled; the judgement sections still need writing
 *   one already exists  — the generator refused rather than overwrite somebody's editing, and
 *                         replacing it is offered as a choice rather than taken as a default
 *   it failed           — including the half-and-half case, where it was written here but
 *                         never reached anybody
 */
export function HandoffPanel({
  result, busy, onReplace, onRetry,
}: { result: HandoffReportResult | null; busy: boolean; onReplace: () => void; onRetry: () => void }) {
  if (busy) return <p role="status" className="text-sm text-ink-3">Drafting the hand-over document…</p>
  if (!result) return null

  if (result.ok) {
    return (
      <Card>
        <h3 className="text-sm font-medium text-ink-1">Hand-over document</h3>
        <p className="mt-1 font-mono text-xs text-ink-3">{result.path}</p>
        <p className="mt-2 text-sm text-ink-1">{result.note}</p>
        <p className="mt-2 text-xs text-ink-3">
          The deferred items and their reasons are in it, taken from the specs themselves.
        </p>
      </Card>
    )
  }

  return (
    <Notice
      tone="warn"
      title={result.alreadyExists ? 'A hand-over document is already there' : 'The hand-over document was not produced'}
      actions={result.alreadyExists
        ? <Button size="sm" onClick={onReplace}>Replace it with a fresh draft</Button>
        : <Button size="sm" onClick={onRetry}>Try again</Button>}
    >
      <p className="text-sm">{result.error}</p>
      {result.wroteLocally && (
        <p className="mt-1 text-xs">
          The file exists on this machine only — saving it is what makes it a hand-over.
        </p>
      )}
    </Notice>
  )
}

export function DeferredList({ deferred }: { deferred: DeclarationStatus['deferred'] }) {
  return (
    <Card>
      <Eyebrow as="h3" className="mb-2">Deferred, and why</Eyebrow>
      <ul className="space-y-2">
        {deferred.map((spec) => (
          <li key={spec.spec} className="text-sm" data-reveal="">
            <span className="font-mono text-xs text-ink-3">{spec.spec}</span>{' '}
            <span className="text-ink-1">{spec.name}</span>
            <span className="mt-0.5 block text-xs text-ink-2">
              {/* A deferral with no reason is reported as such rather than left blank, because
                  blank reads as "nobody wrote one" when it may mean "it was lost". */}
              {spec.reason || 'No reason recorded — this cannot be told apart from an oversight.'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        These reasons go into the hand-over document, which is where somebody will look when
        they ask why an expected thing is not there.
      </p>
    </Card>
  )
}
