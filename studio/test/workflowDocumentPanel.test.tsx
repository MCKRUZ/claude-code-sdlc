// @vitest-environment jsdom
/** The document panel's own header (spec 0018): Back to Workflow / Previous / Next / Edit.
 *
 * `workflowTab.test.ts` (renderToStaticMarkup) pins the header's STATIC shape — present, with
 * Previous/Next disabled at the right ends of the declared order. What that file cannot prove,
 * because `renderToStaticMarkup` never runs an effect or a click handler, is that clicking these
 * controls actually does anything — that is what this file is for, the same split
 * `ChatPanel.test.tsx` already uses for its own interactive behaviour. */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowTab } from '../src/components/WorkflowTab'
import type { OpenDocumentResult, StageDocument, StageReadiness } from '../shared/types'

function doc(overrides: Partial<StageDocument> & { path: string }): StageDocument {
  return {
    name: overrides.path.split('/').pop() ?? overrides.path,
    exists: true,
    folder: false,
    shaped: true,
    description: undefined,
    findingCount: 0,
    ready: true,
    ...overrides,
  }
}

function makeReadiness(documents: StageDocument[], over: Partial<StageReadiness> = {}): StageReadiness {
  return {
    ok: true,
    stageId: '1',
    name: 'requirements',
    display: 'Phase 1: Requirements',
    isCurrent: true,
    documents,
    findings: [],
    judgement: [],
    signOff: { status: 'pending', signedOffBy: null, completedAt: null },
    ready: documents.every((d) => d.ready),
    ...over,
  }
}

function okDoc(path: string): OpenDocumentResult {
  return { ok: true, path, shaped: true, warnings: [], sections: [] }
}

function installStudioMock() {
  const studio = { openDocument: vi.fn().mockImplementation((_p: string, relPath: string) => Promise.resolve(okDoc(relPath))) }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  // @ts-expect-error - cleaning up the test double between tests
  delete window.studio
})

function renderTab(readiness: StageReadiness, onOpenDocument: (relPath: string) => void = () => {}) {
  return render(
    <WorkflowTab
      projectPath="/tmp/project"
      readiness={readiness}
      actor="Matt K"
      busyId={null}
      confirmError={null}
      onToggleSignOff={() => {}}
      onOpenDocument={onOpenDocument}
    />,
  )
}

describe('WorkflowTab — spec 0018: Previous/Next move between documents without leaving the Workflow tab', () => {
  it('clicking Next moves the panel to the adjacent document in declared order, and Previous moves back', async () => {
    installStudioMock()
    const readiness = makeReadiness([
      doc({ path: 'a.md', ready: false }),
      doc({ path: 'b.md', ready: false }),
      doc({ path: 'c.md', ready: false }),
    ])
    renderTab(readiness)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'a.md' })).toBeTruthy())
    // The step list is still here — this never leaves the Workflow tab.
    expect(screen.getAllByTestId('workflow-step')).toHaveLength(4) // 3 documents + Sign-off

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'b.md' })).toBeTruthy())
    expect(screen.getAllByTestId('workflow-step')).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'a.md' })).toBeTruthy())
  })

  it('Previous is disabled on the first required document; Next is disabled on the last', async () => {
    installStudioMock()
    const readiness = makeReadiness([
      doc({ path: 'a.md', ready: false }),
      doc({ path: 'b.md', ready: false }),
      doc({ path: 'c.md', ready: false }),
    ])
    renderTab(readiness)

    const previous = () => screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement
    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    await waitFor(() => expect(previous().disabled).toBe(true))
    expect(next().disabled).toBe(false)

    const user = userEvent.setup()
    await user.click(next())
    await user.click(next())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'c.md' })).toBeTruthy())
    expect(next().disabled).toBe(true)
    expect(previous().disabled).toBe(false)
  })

  it('Back to Workflow snaps the view back to the real current step after browsing with Next', async () => {
    installStudioMock()
    const readiness = makeReadiness([
      doc({ path: 'a.md', ready: false }), // current — the first not-ready document
      doc({ path: 'b.md', ready: false }),
    ])
    renderTab(readiness)

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'a.md' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'b.md' })).toBeTruthy())

    await user.click(screen.getByRole('button', { name: /Back to Workflow/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'a.md' })).toBeTruthy())
  })
})

describe('WorkflowTab — spec 0018: the header\'s Edit control opens the existing structured editor', () => {
  it('calls onOpenDocument with the VIEWED document\'s path, not necessarily the workflow\'s current one', async () => {
    installStudioMock()
    const onOpenDocument = vi.fn()
    const readiness = makeReadiness([
      doc({ path: 'a.md', ready: false }),
      doc({ path: 'b.md', ready: false }),
    ])
    renderTab(readiness, onOpenDocument)

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'a.md' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onOpenDocument).toHaveBeenCalledWith('a.md')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'b.md' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onOpenDocument).toHaveBeenCalledWith('b.md')

    // Opening the editor is a prop call, never a second read/write path of its own — proven by
    // there being no `electron/main` call this component could have made for it.
    expect(onOpenDocument).toHaveBeenCalledTimes(2)
  })

  it('the Edit control is disabled for a folder step, which cannot be opened as one document', async () => {
    installStudioMock()
    const onOpenDocument = vi.fn()
    const readiness = makeReadiness([doc({ path: 'adrs', ready: false, folder: true })])
    renderTab(readiness, onOpenDocument)

    await waitFor(() => expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText(/is a folder of documents/)).toBeTruthy()
  })
})
