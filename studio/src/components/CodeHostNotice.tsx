import type { ConnectionInfo } from '../../shared/types'
import { Button, Notice } from '../ui'
import { connectionBannerText } from '../hostReasons'

/** The non-blocking banner at the top of the project area when the project's code-host CLI is
 * not ready (code-host-providers.md §7 App.tsx row): missing, missing its extension, or signed
 * out. A project OPENS regardless (D4) — this only says what the missing CLI costs, in the §7.1
 * sentence the main process recorded, and each control repeats its own reason where it sits.
 * Dismissible for the session; renders nothing when there is nothing to say. The INFO tone, as
 * `role="status"`: a CLI that is not ready is a degraded read, not a measured wait — amber is
 * reserved for the plugin's own warn-class facts (visual §8 #4). */
export function CodeHostNotice({
  connection,
  onDismiss,
}: {
  connection: ConnectionInfo | null
  onDismiss: () => void
}) {
  const text = connectionBannerText(connection)
  if (!text) return null
  return (
    <Notice
      tone="info"
      role="status"
      className="mb-4"
      data-testid="code-host-notice"
      actions={<Button size="sm" variant="link" onClick={onDismiss}>Dismiss</Button>}
    >
      {text}
    </Notice>
  )
}
