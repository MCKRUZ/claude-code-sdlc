import { useRef, useState } from 'react'
import { formatDateTime, NO_DATE } from '../../shared/format'
import type { ClashChoice, FileClash } from '../../shared/types'
import { Button, Card, EmptyState, Eyebrow, Notice } from '../ui'
import { useCountUp } from '../motion/useCountUp'
import { engineFor, useStudioGSAP } from '../motion/useStudioGSAP'
import { clashResolve } from '../motion/choreo'
import { useRegisterDirty } from '../stores/dirtyStore'
import { ClashDiff } from './ClashDiff'
import { choreoContext } from './entryScreenBits'

/** C6: the shared date formatting; a string the clock cannot read is shown as the plugin wrote it. */
function formatWhen(iso: string): string {
  const formatted = formatDateTime(iso)
  return formatted === NO_DATE ? iso : formatted
}

/** One clashing section at a time — spec 0009's own language: "keep mine / keep theirs / let
 * Claude combine." It says what differs (a sentence, then only the changed lines, with the changed
 * words marked) and when each version was last changed, because two versions that look alike on
 * screen leave nothing to choose between. Nothing is saved until the person chooses (or accepts a
 * combined draft); the unchosen version stays reachable through the repository's own history,
 * never silently discarded. */
export function ClashScreen({
  clashes,
  onResolve,
  onCombine,
  onDone,
}: {
  clashes: FileClash[]
  onResolve: (filePath: string, sectionKey: string, choice: ClashChoice, combinedText?: string) => Promise<void>
  onCombine: (localText: string, remoteText: string) => Promise<string>
  onDone: () => void
}) {
  const [combining, setCombining] = useState(false)
  const [combinedDraft, setCombinedDraft] = useState<string | null>(null)
  // A combined draft awaiting review is unsaved work (§6.2).
  useRegisterDirty(() => combinedDraft !== null)
  const [combineError, setCombineError] = useState<string | null>(null)
  const [showFull, setShowFull] = useState(false)

  const remaining = clashes.flatMap((c) => c.sections.map((s) => ({ file: c.path, clash: c, section: s })))
  const current = remaining[0]
  const currentKey = current ? `${current.file}#${current.section.key}` : null

  // "(N left)" follows counter rule #11: it tweens between two real counts and never from 0.
  const left = useCountUp('clash-left', remaining.length)

  // Row #22: the settled card leaves left, the next arrives from the right. The incoming half
  // runs when the current section changes (not on first paint — that is the screen's own enter).
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const seenKey = useRef<string | null>(null)
  useStudioGSAP(
    () => {
      const el = bodyRef.current
      const first = seenKey.current === null
      seenKey.current = currentKey
      if (!el || first || currentKey === null) return
      clashResolve.play(choreoContext(el), { incoming: el })
    },
    { scope: bodyRef, dependencies: [currentKey] },
  )

  if (!current) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 p-6">
        <EmptyState
          title="Every clash is resolved."
          action={<Button variant="primary" onClick={onDone} className="rounded-xl px-4 text-sm">Continue</Button>}
        />
      </div>
    )
  }

  const { file, clash, section } = current

  const resolve = async (choice: ClashChoice, combinedText?: string) => {
    // The card starts leaving while the write runs; whatever happens to the write, the element
    // is handed back clean — React replaces it when the fact changed, and if it did not (the
    // parent kept the same clash) the card must not stay invisible.
    const el = bodyRef.current
    const out = el ? clashResolve.play(choreoContext(el), { outgoing: el }) : null
    try {
      await onResolve(file, section.key, choice, combinedText)
    } finally {
      out?.kill()
      if (el) engineFor().set(el, { clearProps: 'opacity,transform' })
    }
    setCombinedDraft(null)
    setCombineError(null)
    setShowFull(false)
  }

  const requestCombine = async () => {
    setCombining(true)
    setCombineError(null)
    try {
      const draft = await onCombine(section.localText, section.remoteText)
      setCombinedDraft(draft)
    } catch (err) {
      setCombineError(err instanceof Error ? err.message : 'Could not combine these — pick one of the versions instead.')
    } finally {
      setCombining(false)
    }
  }

  return (
    <div className="flex h-screen flex-col gap-4 overflow-auto bg-surface-0 p-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-1">A change needs your input</h1>
        <p className="text-sm text-ink-3">
          {file} — {section.heading} (<span ref={left.ref} className="tabular-nums">{left.text}</span> left)
        </p>
      </div>

      <div ref={bodyRef} key={currentKey} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <Eyebrow className="text-accent-text">Your version</Eyebrow>
            {clash.localModifiedAt && (
              <p className="mt-1 text-sm text-ink-2">{`Last saved ${formatWhen(clash.localModifiedAt)}`}</p>
            )}
          </Card>
          <Card>
            <Eyebrow className="text-status-warn-ink">Their version</Eyebrow>
            {clash.remote && (
              <>
                <p className="mt-1 text-sm text-ink-2">{`Last changed ${formatWhen(clash.remote.when)} by ${clash.remote.author}`}</p>
                {clash.remote.subject && <p className="mt-0.5 truncate text-xs text-ink-3">{clash.remote.subject}</p>}
              </>
            )}
          </Card>
        </div>

        <Card padding="none" className="min-h-0">
          <ClashDiff mine={section.localText} theirs={section.remoteText} />
        </Card>

        <div>
          <Button variant="link" size="sm" onClick={() => setShowFull((v) => !v)} className="text-ink-3 hover:text-ink-1">
            {showFull ? 'Hide the full versions' : 'Show both versions in full'}
          </Button>
          {showFull && (
            <div className="mt-2 grid grid-cols-2 gap-4">
              <FullVersion label="Your version" text={section.localText} />
              <FullVersion label="Their version" text={section.remoteText} />
            </div>
          )}
        </div>

        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Button variant="primary" onClick={() => resolve('local')} className="px-4 text-sm">
            Keep mine
          </Button>
          <Button variant="primary" onClick={() => resolve('remote')} className="px-4 text-sm">
            Keep theirs
          </Button>
          {combinedDraft === null && (
            <Button variant="secondary" onClick={requestCombine} loading={combining} loadingLabel="Asking Claude…" className="text-sm">
              Let Claude combine
            </Button>
          )}
          {combineError && <Notice tone="error" className="w-full">{combineError}</Notice>}
        </Card>

        {combinedDraft !== null && (
          <Notice tone="info" title="Claude's combined draft — review before accepting" className="rounded-xl p-4">
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-1 p-3 text-sm text-ink-1">{combinedDraft}</pre>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => resolve('combined', combinedDraft)}>
                Accept this
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCombinedDraft(null)}>
                Discard
              </Button>
            </div>
          </Notice>
        )}
      </div>
    </div>
  )
}

function FullVersion({ label, text }: { label: string; text: string }) {
  return (
    <Card padding="none" className="flex max-h-[28rem] flex-col">
      <Eyebrow className="border-b border-line-1 px-4 py-2">{label}</Eyebrow>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm text-ink-1">{text}</pre>
    </Card>
  )
}
