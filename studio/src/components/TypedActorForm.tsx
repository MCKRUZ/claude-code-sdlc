import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Notice } from '../ui'
import { connectionStore } from '../stores/connectionStore'

/** "Sign in as a typed name" (code-host providers, D-OWNER-5).
 *
 * Shown only in the one state the rule allows: the host could not say who is signed in
 * (`accountSource === null` and `cli.signedIn !== 'yes'` — a PAT-only `az`, or no sign-in at
 * all). The main process is the judge: `setTypedActor` rejects a bad name, or a name offered
 * while the host DOES identify the person, with one sentence — shown here verbatim, never
 * paraphrased. On success the result is a fresh ConnectionInfo and goes straight into the
 * connection store, so every screen reading it updates at once.
 *
 * Mounted by HandoffDialog (an actor-gated control) and by SettingsScreen's "Signed in as" row.
 * Standalone-safe: it needs only a project path and `window.studio.setTypedActor`. */
export function TypedActorForm({
  projectPath,
  onIdentified,
  className,
}: {
  projectPath: string
  /** Called with the new connection after the main process accepted the name. */
  onIdentified?: (account: string) => void
  className?: string
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejection, setRejection] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const typed = name.trim()
    if (!typed || busy) return
    setBusy(true)
    setRejection(null)
    try {
      const info = await window.studio.setTypedActor(projectPath, typed)
      connectionStore.set(info)
      onIdentified?.(info.account ?? typed)
    } catch (err) {
      // The main process's own sentence: it knows why it refused.
      setRejection(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby="typed-actor-title" className={className}>
      <p id="typed-actor-title" className="text-xs font-medium text-ink-2">Sign in as a typed name</p>
      <p className="mt-0.5 text-xs text-ink-3">
        The code host could not say who you are, so a name you type is recorded as the actor for this session only.
      </p>
      <div className="mt-2 flex items-end gap-2">
        <Field label="Your name" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="off" />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={busy}
          loadingLabel="Signing in…"
          disabled={!name.trim()}
          disabledReason={!name.trim() ? 'Type a name first.' : undefined}
        >
          Use this name
        </Button>
      </div>
      {rejection && (
        <Notice tone="error" role="alert" className="mt-2">
          <p>{rejection}</p>
        </Notice>
      )}
    </form>
  )
}
