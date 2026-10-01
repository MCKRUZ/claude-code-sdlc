// @vitest-environment jsdom
/** Spec 0018's shared-source acceptance check, asserted DIRECTLY rather than by convention: for
 * the same document, the Workflow tab's live step panel and the Documents tab's structured
 * editor (`DocumentView`) must render identical section headings and field values for every
 * section — including the exact label the Documents tab already uses for an empty field
 * ("Empty") and for one the shape declares but the document does not carry
 * ("Not in this document.").
 *
 * Both already call the SAME `SectionCard` (`DocumentSections.tsx`) with `editing={false}` and
 * no highlight — this proves that fact live, from the real components, rather than trusting it
 * holds because the source code happens to look that way today. */

import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowTab } from '../src/components/WorkflowTab'
import { DocumentView } from '../src/components/DocumentView'
import type { DocumentSection, OpenDocumentResult, StageDocument, StageReadiness } from '../shared/types'

const SECTIONS: DocumentSection[] = [
  {
    kind: 'section',
    key: 'Overview',
    heading: 'Overview',
    start: 0,
    end: 10,
    text: '',
    fields: {
      Summary: {
        label: 'Summary', value: 'A real filled-in value.', start: 0, end: 10,
        type: 'text', required: true, anchor: 'Summary', empty: false,
      },
      Rationale: {
        label: 'Rationale', value: '', start: 10, end: 10,
        type: 'longtext', required: false, anchor: 'Rationale', empty: true,
      },
      // Declared by the shape, absent from this document — the field is `null`.
      Owner: null,
    },
  },
]

function docResult(): OpenDocumentResult {
  return { ok: true, path: 'requirements.md', shaped: true, warnings: [], sections: SECTIONS, description: 'What the system must do.' }
}

function doc(overrides: Partial<StageDocument> & { path: string }): StageDocument {
  return {
    name: overrides.path.split('/').pop() ?? overrides.path,
    exists: true, folder: false, shaped: true, description: undefined, findingCount: 0, ready: false,
    ...overrides,
  }
}

function makeReadiness(documents: StageDocument[]): StageReadiness {
  return {
    ok: true, stageId: '1', name: 'requirements', display: 'Phase 1: Requirements', isCurrent: true,
    documents, findings: [], judgement: [],
    signOff: { status: 'pending', signedOffBy: null, completedAt: null },
    ready: documents.every((d) => d.ready),
  }
}

function installStudioMock() {
  const studio = {
    openDocument: vi.fn().mockResolvedValue(docResult()),
    getDocumentChanges: vi.fn().mockResolvedValue([]),
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
}

afterEach(() => {
  // @ts-expect-error - cleaning up the test double between tests
  delete window.studio
})

/** Every section's own markup — keyed by `data-section-key`, stripped of surrounding whitespace
 * differences that do not affect what a reader sees — pulled out of a render root so the two
 * renders' very different HEADERS (Back/Previous/Next/Edit here, History/Edit/changes there)
 * never enter the comparison; only the section cards themselves do. */
function sectionMarkupByKey(container: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {}
  container.querySelectorAll('[data-section-key]').forEach((el) => {
    out[el.getAttribute('data-section-key')!] = el.outerHTML
  })
  return out
}

describe('the Workflow tab\'s live document panel and the Documents tab render identical sections (spec 0018)', () => {
  it('byte-for-byte identical section markup — heading, a filled field, an "Empty" field, and a "Not in this document." field', async () => {
    installStudioMock()

    const { container: workflowContainer } = render(
      <WorkflowTab
        projectPath="/p"
        readiness={makeReadiness([doc({ path: 'requirements.md' })])}
        actor="Matt K"
        busyId={null}
        confirmError={null}
        onToggleSignOff={() => {}}
        onOpenDocument={() => {}}
      />,
    )
    await waitFor(() => expect(workflowContainer.querySelector('[data-testid="live-document-panel"]')).toBeTruthy())

    const { container: documentViewContainer } = render(
      <DocumentView projectPath="/p" relPath="requirements.md" actor="Matt K" onBack={() => {}} onShowHistory={() => {}} />,
    )
    await waitFor(() => expect(documentViewContainer.querySelector('[data-section-key="Overview"]')).toBeTruthy())

    const workflowSections = sectionMarkupByKey(workflowContainer)
    const documentViewSections = sectionMarkupByKey(documentViewContainer)

    expect(Object.keys(workflowSections)).toEqual(['Overview'])
    expect(workflowSections).toEqual(documentViewSections)

    // Spelled out too, not just trusted via the byte-identical diff above — these are the exact
    // acceptance-check assertions, in words.
    for (const html of [workflowSections.Overview, documentViewSections.Overview]) {
      expect(html).toContain('Overview')
      expect(html).toContain('A real filled-in value.')
      expect(html).toContain('Empty')
      expect(html).toContain('Not in this document.')
    }
  })
})
