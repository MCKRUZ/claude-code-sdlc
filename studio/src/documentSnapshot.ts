import { documentNotFoundError } from '../shared/documentErrors'
import type { OpenDocumentResult } from '../shared/types'

export type DocumentSnapshot =
  | { kind: 'ok'; doc: OpenDocumentResult }
  | { kind: 'waiting' }
  | { kind: 'error'; message: string }

/** Fetches one document for the Workflow tab's live panel, classifying the result into exactly
 * one of three states instead of handing the caller a raw `OpenDocumentResult` to re-interpret
 * (spec 0017's fix pass, bugs #6 and #8).
 *
 * Bug #6: the awaited `openDocument()` call had no try/catch. `documents.ts`'s `openDocument()`
 * has a TOCTOU gap — `existsSync` then a separate `readFileSync` — that can throw if the file
 * changes in between, which is a real possibility now that spec 0016's chat engine can be
 * actively rewriting the same document this panel polls. A thrown/rejected read becomes an
 * `{ kind: 'error' }` snapshot here, same as an ordinary `{ ok: false }` result — never an
 * unhandled promise rejection. Self-healing: the next poll tries again regardless of this one's
 * outcome.
 *
 * Bug #8: "not created yet" is recognised through `documentNotFoundError()`, the one shared
 * spelling of that message — not a second, hand-copied literal. */
export async function fetchDocumentSnapshot(
  openDocument: (projectPath: string, relPath: string) => Promise<OpenDocumentResult>,
  projectPath: string,
  relPath: string,
): Promise<DocumentSnapshot> {
  let result: OpenDocumentResult
  try {
    result = await openDocument(projectPath, relPath)
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  if (!result.ok) {
    if (result.error === documentNotFoundError(relPath)) return { kind: 'waiting' }
    return { kind: 'error', message: result.error ?? 'Could not open this document.' }
  }
  return { kind: 'ok', doc: result }
}
