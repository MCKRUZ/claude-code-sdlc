// @vitest-environment jsdom
/** The document outline rail (studio-upgrade-2 S5): one link per headed section, the stage's
 * findings for this document counted beside the section they match, a click that marks exactly
 * one card — and the card does not claim the reader was "sent" there. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentSection, OpenDocumentResult, ReadinessFinding, StageReadiness } from '../shared/types'
import { DocumentOutline, outlineCounts } from '../src/components/DocumentOutline'
import { DocumentView } from '../src/components/DocumentView'
import { StageReadinessProvider } from '../src/components/StageReadinessContext'
import { readinessWith } from './activityFixtures'

function section(key: string, heading: string, kind: DocumentSection['kind'] = 'section'): DocumentSection {
  return { kind, key, heading, start: 0, end: 0, text: '', fields: {} }
}

const REL = '.sdlc/artifacts/01-requirements/requirements.md'
const SECTIONS = [section('free_text@0', '', 'free_text'), section('overview', 'Overview'), section('fr#2', 'FR-002', 'repeating_instance'), section('scope', 'Scope')]
const FINDINGS: ReadinessFinding[] = [
  { path: REL, section: 'Functional Requirements > FR-002', field: 'Dependencies', reason: 'absent or empty' },
  { path: REL, section: 'FR-002', field: null, reason: 'section is empty' },
  { path: REL, section: 'Scope', field: 'Out of scope', reason: 'absent or empty' },
  { path: 'other.md', section: 'Overview', field: null, reason: 'not this document' },
]

describe('DocumentOutline', () => {
  it('counts each finding once against the section it matches, for this document only', () => {
    const counts = outlineCounts(SECTIONS, FINDINGS, REL)
    expect(counts.get('fr#2')).toBe(2)
    expect(counts.get('scope')).toBe(1)
    expect(counts.get('overview')).toBeUndefined()
  })

  it('one link per headed section (free text has none), "N to fill" beside the ones with findings, click selects', () => {
    const onSelect = vi.fn()
    render(<DocumentOutline sections={SECTIONS} findings={FINDINGS} relPath={REL} activeKey="scope" onSelect={onSelect} />)
    const nav = screen.getByRole('navigation', { name: 'Document outline' })
    const links = within(nav).getAllByRole('button')
    expect(links.map((l) => l.getAttribute('data-outline-key'))).toEqual(['overview', 'fr#2', 'scope'])
    expect(within(links[1]).getByText('2 to fill')).toBeTruthy()
    expect(within(links[2]).getByText('1 to fill')).toBeTruthy()
    expect(within(links[0]).queryByText(/to fill/)).toBeNull()
    expect(links[2].getAttribute('aria-current')).toBe('true')
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
    fireEvent.click(links[1])
    expect(onSelect).toHaveBeenCalledWith('fr#2')
  })

  it('draws nothing for a document with no headed sections', () => {
    const { container } = render(<DocumentOutline sections={[section('free_text@0', '', 'free_text')]} findings={[]} relPath={REL} activeKey={null} onSelect={vi.fn()} />)
    expect(container.querySelector('nav')).toBeNull()
  })
})

describe('DocumentView with the outline', () => {
  const DOC: OpenDocumentResult = { ok: true, path: REL, shaped: true, warnings: [], sections: [section('overview', 'Overview'), section('scope', 'Scope')] }
  const READINESS: StageReadiness = readinessWith({ findings: FINDINGS.slice(2, 3) })

  function install() {
    const studio = {
      getStageReadiness: vi.fn().mockResolvedValue(READINESS),
      openDocument: vi.fn().mockResolvedValue(DOC),
      getDocumentChanges: vi.fn().mockResolvedValue([]),
    }
    // @ts-expect-error - test double, not the full StudioApi surface
    window.studio = studio
    return studio
  }

  afterEach(() => {
    cleanup()
    // @ts-expect-error - cleaning up the test double
    delete window.studio
  })

  it('clicking an outline entry marks exactly that card, without the "sent here" line; a finding focus keeps it', async () => {
    install()
    const { container, rerender } = render(
      <StageReadinessProvider projectPath="/p" stageId="1">
        <DocumentView projectPath="/p" relPath={REL} actor="Matt K" onBack={vi.fn()} onShowHistory={vi.fn()} />
      </StageReadinessProvider>,
    )
    await screen.findByRole('heading', { name: 'requirements.md' })
    const nav = await screen.findByRole('navigation', { name: 'Document outline' })
    expect(container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0)

    fireEvent.click(within(nav).getByRole('button', { name: /Scope/ }))
    await waitFor(() => expect(container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1))
    expect(container.querySelector('[data-highlighted="true"]')!.getAttribute('data-section-key')).toBe('scope')
    expect(screen.queryByText(/You were sent here/)).toBeNull()
    expect(within(nav).getByRole('button', { name: /Scope/ }).getAttribute('aria-current')).toBe('true')

    // Arriving from a readiness item still says so, and still marks one card.
    rerender(
      <StageReadinessProvider projectPath="/p" stageId="1">
        <DocumentView projectPath="/p" relPath={REL} actor="Matt K" focus={{ section: 'Scope', field: 'Out of scope' }} onBack={vi.fn()} onShowHistory={vi.fn()} />
      </StageReadinessProvider>,
    )
    await screen.findByText('You were sent here to fill in Out of scope.')
    expect(container.querySelectorAll('[data-highlighted="true"]')).toHaveLength(1)
  })

  it('the rail is a nav, never an aside, and the heading stays the file name', async () => {
    install()
    const { container } = render(
      <StageReadinessProvider projectPath="/p" stageId="1">
        <DocumentView projectPath="/p" relPath={REL} actor="Matt K" onBack={vi.fn()} onShowHistory={vi.fn()} />
      </StageReadinessProvider>,
    )
    await screen.findByRole('navigation', { name: 'Document outline' })
    expect(container.querySelectorAll('aside')).toHaveLength(0)
    const heading = screen.getByRole('heading', { level: 2, name: 'requirements.md' })
    expect(heading.hasAttribute('data-page-heading')).toBe(true)
    expect(screen.getByText('Phase 1: Requirements')).toBeTruthy() // the eyebrow names the stage
  })
})
