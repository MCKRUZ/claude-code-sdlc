// @vitest-environment jsdom
//
// A step whose document does not exist yet offers "Start this document", not Edit. Edit on a document that
// is not there only ever failed ("<path> does not exist"; smoke review, bug 2). Starting creates the file from
// the plugin's template, refreshes the stage, and opens the new document for editing.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowTab } from '../src/components/WorkflowTab'
import type { OpenDocumentResult, StageDocument, StageReadiness } from '../shared/types'

function doc(over: Partial<StageDocument> & { path: string }): StageDocument {
  return {
    name: over.path.split('/').pop() ?? over.path, exists: true, folder: false, shaped: true,
    description: undefined, findingCount: 0, ready: true, ...over,
  }
}
const readiness = (documents: StageDocument[]): StageReadiness => ({
  ok: true, stageId: '0', name: 'discovery', display: 'Phase 0: Discovery', isCurrent: true, documents,
  findings: [], judgement: [], signOff: { status: 'pending', signedOffBy: null, completedAt: null },
  ready: documents.every((d) => d.ready),
})
const okDoc = (path: string): OpenDocumentResult => ({ ok: true, path, shaped: true, warnings: [], sections: [] })

function install(startDocument: ReturnType<typeof vi.fn>) {
  const studio = {
    startDocument,
    openDocument: vi.fn().mockImplementation((_p: string, rel: string) => Promise.resolve(okDoc(rel))),
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}
afterEach(() => {
  // @ts-expect-error - cleaning up the test double between tests
  delete window.studio
})

function renderTab(r: StageReadiness, over: { onOpenDocument?: (p: string) => void; onRefresh?: () => Promise<void> } = {}) {
  return render(
    <WorkflowTab
      projectPath="/tmp/project" readiness={r} actor="Matt K" busyId={null} confirmError={null}
      onToggleSignOff={() => {}} onOpenDocument={over.onOpenDocument ?? (() => {})} onRefresh={over.onRefresh}
    />,
  )
}

describe('a step whose document does not exist yet', () => {
  it('offers Start this document, and no Edit', () => {
    install(vi.fn())
    renderTab(readiness([doc({ path: 'a.md', exists: false, ready: false })]))
    expect(screen.getByRole('button', { name: 'Start this document' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('starts it, refreshes the stage, and opens the new document', async () => {
    const startDocument = vi.fn().mockResolvedValue({ ok: true, created: true })
    install(startDocument)
    const onOpenDocument = vi.fn()
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    renderTab(readiness([doc({ path: 'a.md', exists: false, ready: false })]), { onOpenDocument, onRefresh })

    await userEvent.click(screen.getByRole('button', { name: 'Start this document' }))

    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith('a.md'))
    expect(startDocument).toHaveBeenCalledWith('/tmp/project', 'a.md')
    expect(onRefresh).toHaveBeenCalled()
  })

  it('says so, in words, and opens nothing when it cannot be started', async () => {
    install(vi.fn().mockResolvedValue({ ok: false, error: 'There is no template for a.md, so it cannot be started here.' }))
    const onOpenDocument = vi.fn()
    renderTab(readiness([doc({ path: 'a.md', exists: false, ready: false })]), { onOpenDocument })

    await userEvent.click(screen.getByRole('button', { name: 'Start this document' }))

    expect(await screen.findByText(/no template for a\.md/)).toBeTruthy()
    expect(onOpenDocument).not.toHaveBeenCalled()
  })

  it('cannot be pressed twice while it is starting', async () => {
    let finish: (v: { ok: boolean }) => void = () => {}
    const startDocument = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    install(startDocument)
    renderTab(readiness([doc({ path: 'a.md', exists: false, ready: false })]))

    const button = screen.getByRole('button', { name: /Start this document|Starting/ })
    await userEvent.click(button)
    expect((screen.getByRole('button', { name: /Starting/ }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /Starting/ }))
    expect(startDocument).toHaveBeenCalledTimes(1)
    finish({ ok: true })
  })
})

describe('a step whose document exists', () => {
  it('still offers Edit, and no Start', () => {
    install(vi.fn())
    // Exists but not finished, so it is the step the panel shows.
    renderTab(readiness([doc({ path: 'a.md', ready: false, findingCount: 2 })]))
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start this document' })).toBeNull()
  })
})
