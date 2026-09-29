/** Spec 0017's fix pass, bugs #6 and #8.
 *
 * #6: `fetchDocumentSnapshot` wraps `openDocument()` in a try/catch, so a rejected or throwing
 * read (the TOCTOU gap in `documents.ts`'s real `openDocument()`) becomes an ordinary error
 * snapshot instead of an unhandled promise rejection.
 *
 * #8: "not created yet" is recognised through the shared `documentNotFoundError()` spelling,
 * not a second hand-copied literal — proven here by using that exact function to build the
 * fixture's error, rather than typing the string again.
 */

import { describe, expect, it } from 'vitest'
import { documentNotFoundError } from '../shared/documentErrors'
import { fetchDocumentSnapshot } from '../src/documentSnapshot'
import type { OpenDocumentResult } from '../shared/types'

const OK_DOC: OpenDocumentResult = { ok: true, path: 'a.md', shaped: true, warnings: [], sections: [] }

describe('fetchDocumentSnapshot', () => {
  it('returns an ok snapshot for a successful read', async () => {
    const snap = await fetchDocumentSnapshot(async () => OK_DOC, '/proj', 'a.md')
    expect(snap).toEqual({ kind: 'ok', doc: OK_DOC })
  })

  it('returns a waiting snapshot when the document does not exist yet', async () => {
    const notFound: OpenDocumentResult = {
      ok: false, path: 'a.md', shaped: false, warnings: [], sections: [],
      error: documentNotFoundError('a.md'),
    }
    const snap = await fetchDocumentSnapshot(async () => notFound, '/proj', 'a.md')
    expect(snap).toEqual({ kind: 'waiting' })
  })

  it('returns an error snapshot for any other ok:false result', async () => {
    const broken: OpenDocumentResult = {
      ok: false, path: 'a.md', shaped: false, warnings: [], sections: [], error: 'disk on fire',
    }
    const snap = await fetchDocumentSnapshot(async () => broken, '/proj', 'a.md')
    expect(snap).toEqual({ kind: 'error', message: 'disk on fire' })
  })

  it('bug #6: a REJECTED read becomes an error snapshot, never an unhandled rejection', async () => {
    const openDocument = async (): Promise<OpenDocumentResult> => {
      throw new Error('ENOENT: file changed mid-read')
    }
    // If this awaited without a try/catch around the call, the rejection would propagate out of
    // fetchDocumentSnapshot instead of resolving — this assertion is what a missing try/catch
    // would fail (the promise would reject, not resolve to an error snapshot).
    await expect(fetchDocumentSnapshot(openDocument, '/proj', 'a.md')).resolves.toEqual({
      kind: 'error', message: 'ENOENT: file changed mid-read',
    })
  })

  it('bug #6: a rejection with a non-Error value still resolves to a readable error snapshot', async () => {
    const openDocument = async (): Promise<OpenDocumentResult> => {
      throw 'a string rejection' // eslint-disable-line @typescript-eslint/no-throw-literal
    }
    await expect(fetchDocumentSnapshot(openDocument, '/proj', 'a.md')).resolves.toEqual({
      kind: 'error', message: 'a string rejection',
    })
  })
})
