/** The Documents tab, extracted verbatim out of StageHome for spec 0017 (the Workflow tab's
 * sibling). Its acceptance check is specific: byte-for-byte what existed before the Workflow
 * tab did — no snapshot file (this suite does not use `toMatchSnapshot()`), so the proof here
 * is a reference component holding the exact pre-0017 markup, rendered against the same props
 * and compared for literal string equality. If `DocumentsTab.tsx` drifts from this by so much
 * as an attribute, this test fails on the diff.
 *
 * Built with `createElement` rather than JSX, like the rest of this `.test.ts` suite (see
 * `signOffQuestions.test.ts`) — this file has no `.tsx` sibling to borrow a JSX transform from.
 */

import { createElement as h, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  DocumentFocus, ReadinessFinding, SignOffQuestion, StageDocument, StageReadiness,
} from '../shared/types'
import { DocumentsTab } from '../src/components/DocumentsTab'
import { SignOffQuestions } from '../src/components/SignOffQuestions'

// --- the reference: StageHome's own JSX for this section, before spec 0017 touched it --------

function referenceDescribe(finding: ReadinessFinding): string {
  const doc = finding.path.split('/').pop() ?? finding.path
  const where = finding.field ? `${finding.field} in ${finding.section}` : finding.section
  return `${where} — ${doc}`
}

function ReferenceDocumentsMarkup({
  readiness, actor, busyId, confirmError, onOpenDocument, onToggle,
}: {
  readiness: StageReadiness
  actor: string
  busyId: string | null
  confirmError: string | null
  onOpenDocument: (relPath: string, focus?: DocumentFocus) => void
  onToggle: (question: SignOffQuestion, confirmed: boolean) => void
}) {
  const documentRows = readiness.documents.map((doc) => h(
    'li', { key: doc.path },
    h(
      'button',
      {
        type: 'button',
        disabled: !doc.exists || doc.folder,
        onClick: () => onOpenDocument(doc.path),
        className: 'flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white',
      },
      h(
        'span', { className: 'min-w-0' },
        h(
          'span', { className: 'block text-sm font-medium text-slate-900' },
          doc.name,
          doc.folder && h('span', { className: 'ml-2 text-xs font-normal text-slate-400' }, 'folder'),
        ),
        doc.description && h('span', { className: 'mt-0.5 block text-xs text-slate-500' }, doc.description),
      ),
      h(
        'span', { className: 'shrink-0 text-xs font-medium' },
        !doc.exists
          ? h('span', { className: 'text-slate-400' }, 'Not started')
          : doc.findingCount > 0
            ? h('span', { className: 'text-amber-700' }, doc.findingCount, ' to fill')
            : h('span', { className: 'text-[var(--color-command-ok)]' }, 'Complete'),
      ),
    ),
  ))

  const findingRows = readiness.findings.length > 0 && h(
    'div', null,
    h('h3', { className: 'mb-2 text-xs font-medium uppercase tracking-wide text-slate-400' }, 'What is missing'),
    h(
      'ul', { className: 'divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white' },
      readiness.findings.map((f) => h(
        'li', { key: `${f.path}#${f.section}#${f.field ?? ''}` },
        h(
          'button',
          {
            type: 'button',
            onClick: () => onOpenDocument(f.path, { section: f.section, field: f.field }),
            className: 'flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-slate-50',
          },
          h('span', { className: 'text-sm font-medium text-slate-900' }, referenceDescribe(f)),
          h('span', { className: 'text-xs text-slate-500' }, f.reason),
        ),
      )),
    ),
  )

  return h(
    'div', { className: 'space-y-6' },
    h(
      'div', null,
      h('h3', { className: 'mb-2 text-xs font-medium uppercase tracking-wide text-slate-400' }, 'Documents'),
      h('ul', { className: 'divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white' }, documentRows),
    ),
    findingRows,
    readiness.judgement.length > 0 && h(SignOffQuestions, {
      questions: readiness.judgement, actor, busyId, error: confirmError, onToggle,
    }),
    h(
      'div', { className: 'rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm' },
      readiness.ready
        ? h('span', { className: 'text-[var(--color-command-ok)]' }, 'Every required document is present and complete.')
        : h(
          'span', { className: 'text-amber-700' },
          readiness.documents.filter((d) => !d.ready).length, ' document(s) still need work before this stage can be signed off.',
        ),
      readiness.signOff.signedOffBy && h(
        'span', { className: 'ml-2 text-slate-500' }, 'Signed off by ', readiness.signOff.signedOffBy, '.',
      ),
    ),
  )
}

// --- fixtures ----------------------------------------------------------------------------

const DOCS: StageDocument[] = [
  { name: 'requirements.md', path: 'requirements.md', exists: true, folder: false, shaped: true, description: 'What the system must do.', findingCount: 2, ready: false },
  { name: 'epics.md', path: 'epics.md', exists: false, folder: false, shaped: true, description: undefined, findingCount: 0, ready: false },
  { name: 'adrs', path: 'adrs', exists: true, folder: true, shaped: false, description: undefined, findingCount: 0, ready: true },
  { name: 'business-rules.md', path: 'business-rules.md', exists: true, folder: false, shaped: true, description: undefined, findingCount: 0, ready: true },
]

const FINDINGS: ReadinessFinding[] = [
  { path: 'requirements.md', section: 'FR-002', field: 'Dependencies', reason: 'absent or empty' },
]

const QUESTIONS: SignOffQuestion[] = [
  { id: 'q-1', text: 'Scope boundaries are unambiguous', hint: { status: 'looks_met', detail: '2 out of scope' }, confirmation: null },
]

function makeReadiness(over: Partial<StageReadiness> = {}): StageReadiness {
  return {
    ok: true,
    stageId: '1',
    display: 'Phase 1: Requirements',
    isCurrent: true,
    documents: DOCS,
    findings: FINDINGS,
    judgement: QUESTIONS,
    signOff: { status: 'pending', signedOffBy: null, completedAt: null },
    ready: false,
    ...over,
  }
}

function props(over: Partial<StageReadiness> = {}) {
  return {
    readiness: makeReadiness(over),
    actor: 'Matt K',
    busyId: null as string | null,
    confirmError: null as string | null,
    onOpenDocument: () => {},
    onToggle: () => {},
  }
}

describe('DocumentsTab (spec 0017)', () => {
  it('renders byte-for-byte what StageHome rendered for this section before the Workflow tab existed', () => {
    const p = props()
    const reference = renderToStaticMarkup(h(Fragment, null, h(ReferenceDocumentsMarkup, p)))
    const actual = renderToStaticMarkup(h(Fragment, null, h(DocumentsTab, p)))
    expect(actual).toBe(reference)
  })

  it('stays byte-for-byte identical when the stage is fully ready and signed off', () => {
    const p = props({
      documents: DOCS.map((d) => ({ ...d, exists: true, findingCount: 0, ready: true })),
      findings: [],
      ready: true,
      signOff: { status: 'signed_off', signedOffBy: 'Priya N', completedAt: '2026-09-29T00:00:00.000Z' },
    })
    const reference = renderToStaticMarkup(h(Fragment, null, h(ReferenceDocumentsMarkup, p)))
    const actual = renderToStaticMarkup(h(Fragment, null, h(DocumentsTab, p)))
    expect(actual).toBe(reference)
  })

  it('stays byte-for-byte identical with no judgement questions and no findings', () => {
    const p = props({ findings: [], judgement: [] })
    const reference = renderToStaticMarkup(h(Fragment, null, h(ReferenceDocumentsMarkup, p)))
    const actual = renderToStaticMarkup(h(Fragment, null, h(DocumentsTab, p)))
    expect(actual).toBe(reference)
  })

  it('still lists every document and what is missing, in words a person can act on', () => {
    const html = renderToStaticMarkup(h(DocumentsTab, props()))
    expect(html).toContain('requirements.md')
    expect(html).toContain('epics.md')
    expect(html).toContain('Not started')
    expect(html).toContain('2 to fill')
    expect(html).toContain('What is missing')
    expect(html).toContain('Dependencies in FR-002 — requirements.md')
    expect(html).toContain('absent or empty')
  })
})
