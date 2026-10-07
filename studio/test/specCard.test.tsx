// @vitest-environment jsdom
/** The spec card (togo-command-center.md §3.3): one `getSpecCard` read + `openDocument`; DoR groups
 * verbatim; scope and `**Why this tier:**` from the document; the ladder, ledger, channel and foot
 * composed; the pinned tier wording (raise free, lower refused in the plugin's words, the authoriser
 * field only after that refusal); Back / Esc return to the opener; no `<input>` at rest. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardRow, DocumentSection, SourcedBlock, SpecCard as SpecCardRead } from '../shared/types'
import { NO_CHANNEL_BOUND, NO_PR_YET, TIER_RULE, VAGUE_LINE_REWRITE, newerPlugin } from '../shared/reasons'
import { SECTION_ABSENT, SECTION_EMPTY, SpecCard } from '../src/components/SpecCard/SpecCard'
import { harnessContext, headingsOnly, scopeSections, stripEmptyListMarkers, stripHtmlComments, whyTierNotes } from '../src/components/SpecCard/specDocument'

const ROW: BoardRow = {
  spec: '0008', name: 'claim-export', path: 'specs/0008-claim-export.md', title: 'Claim export', status: 'draft',
  risk: 'MEDIUM', team: 'platform', channel: '', owner: '@sam-k', developer: '', checker: '@priya-n', branch: '',
  sprint: 'S07', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null,
}
const block = <T,>(data: T | null, source: string, error: string | null = null): SourcedBlock<T> => ({ source, fetchedAt: 'now', ok: data !== null, data, error })
const CARD: SpecCardRead = {
  spec: '0008', path: ROW.path,
  readiness: block({
    ok: true, spec: '0008', risk: 'MEDIUM', status: 'draft', ready: false,
    blocking: [{ check: 'scope-out', passed: false, severity: 'MUST', message: '## Scope Out: missing' }],
    advisory: [{ check: 'vague-line', passed: false, severity: 'SHOULD', message: 'Acceptance check may fail the vague-line test (vague word \'fast\')' }],
    passed: [{ check: 'risk-tier', passed: true, severity: 'MUST', message: 'risk tier is valid' }],
    ladder: { tier: 'MEDIUM', touchesGatedPath: null, rungs: ['CI (lint, unit) — blocks', 'grader — runs, advises', 'correctness — blocks on a defect', 'non-author approval — required (standard review)'] },
  }, 'spec_readiness.py --spec --json'),
  ladder: block({ tier: 'MEDIUM', touchesGatedPath: null, rungs: ['CI (lint, unit) — blocks', 'grader — runs, advises', 'correctness — blocks on a defect', 'non-author approval — required (standard review)'] }, 'spec_readiness.py --spec --json ladder'),
  status: block({ spec: '0008', branch: 'spec/0008-claim-export', code_host_available: true, pull_request: null }, 'spec_status.py --spec --json'),
  findings: block({ tracked: 0, openDebt: 0, fixedClaimMismatches: 0, findings: [], recurrence: {}, attribution: { method: 'scope-paths', attributed: 0, unattributed: 0 } }, 'record_findings.py report --json --spec'),
  channel: null,
  handoffCheck: block({ ok: false, refusal: { kind: 'not_ready', message: 'Spec 0008 is not ready: ## Scope Out: missing' } }, 'handoff.py --check --json'),
}
const SECTIONS: DocumentSection[] = [
  { kind: 'section', key: 'Scope', heading: 'Scope', start: 0, end: 10, text: '## Scope\nIn: the export endpoint.\n', fields: {} },
  { kind: 'section', key: 'Scope Out', heading: 'Scope Out', start: 10, end: 20, text: '## Scope Out\nBilling.\n', fields: {} },
  { kind: 'section', key: 'Context', heading: 'Context', start: 20, end: 40, text: '## Context\n**Why this tier:** lowered to MEDIUM by Matt K — read path only.\n', fields: { harness: { label: 'harness_context', value: 'rate-limited export worker', start: 0, end: 0, type: 'text', required: false, anchor: '', empty: false } } },
]

function install(over: Record<string, unknown> = {}) {
  const studio = {
    getSpecCard: vi.fn().mockResolvedValue(CARD),
    openDocument: vi.fn().mockResolvedValue({ ok: true, path: ROW.path, shaped: true, warnings: [], sections: SECTIONS }),
    setSpecRisk: vi.fn().mockResolvedValue({ ok: true }),
    confirmTier: vi.fn().mockResolvedValue({ ok: true, changed: true, message: 'confirmed by @sam-k' }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}
afterEach(() => { cleanup(); delete (window as { studio?: unknown }).studio })

async function renderCard(props: Partial<Parameters<typeof SpecCard>[0]> = {}) {
  const onBack = vi.fn(); const onHandOff = vi.fn()
  render(<main><button type="button" data-testid="opener">row</button><SpecCard projectPath="/p" row={ROW} actor={{ name: '@sam-k', source: 'roster' }} roster={[{ handle: '@sam-k', name: 'Sam K' }, { handle: '@priya-n', name: 'Priya N', roles: ['checker'] }]} onBack={onBack} onHandOff={onHandOff} {...props} /></main>)
  await screen.findByTestId('spec-ladder')
  return { onBack, onHandOff }
}

describe('SpecCard', () => {
  it('reads once, keeps the pinned heading and back link, shows the DoR groups verbatim and the document\'s scope and why-notes; no <input> at rest', async () => {
    const studio = await (async () => { const s = install(); await renderCard(); return s })()
    expect(studio.getSpecCard).toHaveBeenCalledWith('/p', ROW.path, undefined)
    expect(screen.getByRole('heading', { name: '0008 — Claim export' }).hasAttribute('data-page-heading')).toBe(true)
    expect(document.querySelector('[data-flip-id="spec:0008"]')).toBeTruthy()
    expect(within(screen.getByTestId('spec-intent')).getByText(/## Scope Out: missing/)).toBeTruthy()
    expect(screen.getByText(/vague-line test/)).toBeTruthy()
    const rewrite = screen.getByRole('button', { name: /Claude proposes a rewrite/ }) as HTMLButtonElement
    expect(rewrite.disabled).toBe(true)
    expect(rewrite.getAttribute('title')).toBe(VAGUE_LINE_REWRITE)
    expect(within(document.querySelector('[data-doc="In"]') as HTMLElement).getByText('In: the export endpoint.')).toBeTruthy()
    expect(within(document.querySelector('[data-doc="Out"]') as HTMLElement).getByText('Billing.')).toBeTruthy()
    expect(within(document.querySelector('[data-doc="harness_context"]') as HTMLElement).getByText('rate-limited export worker')).toBeTruthy()
    expect(screen.getByTestId('why-this-tier').textContent).toContain('lowered to MEDIUM by Matt K')
    expect(screen.getByText(TIER_RULE)).toBeTruthy()
    expect(screen.getByTestId('no-pr').textContent).toBe(NO_PR_YET)
    expect(screen.getByTestId('channel-none').textContent).toBe(NO_CHANNEL_BOUND)
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(document.querySelector('[data-rung="correctness"]')?.getAttribute('data-rung-state')).toBe('none')
    // An empty ledger shows no "0 attributed" beside its sentence (visual §8 #6).
    expect(screen.queryByText(/0 attributed · 0 unattributed/)).toBeNull()
    expect(screen.getByText('no findings recorded — the ledger is empty')).toBeTruthy()
  })

  it('the DoR groups wear the eyebrow voice with the count as the only toned chip — warn while blocking, never green for passing', async () => {
    install(); await renderCard()
    const needed = screen.getByRole('region', { name: 'Still needed' })
    const summary = needed.querySelector('summary')!
    expect(summary.className).not.toMatch(/text-status-(warn|ok)-ink/)
    expect(summary.querySelector('[data-group-count]')?.className).toContain('status-warn')
    const passing = screen.getByRole('region', { name: 'Passing' })
    expect(passing.querySelector('summary')?.className).not.toMatch(/text-status-(warn|ok)-ink/)
    expect(passing.querySelector('[data-group-count]')?.className).not.toContain('status-ok')
  })

  it('the facts rail and the neighbourhood ride in the right column under one disclosure, so the Board\'s view of a spec is this card', async () => {
    install(); await renderCard({ capabilities: ['sprint-status', 'sprint-write'], onVerb: vi.fn() })
    const disclosure = screen.getByTestId('spec-facts-disclosure') as HTMLDetailsElement
    expect(disclosure.tagName).toBe('DETAILS')
    expect(disclosure.open).toBe(false)
    expect(within(disclosure).getByRole('region', { name: 'Spec facts' })).toBeTruthy()
    expect(within(disclosure).getByText('Neighbourhood')).toBeTruthy()
    expect(within(disclosure).getByText('Path').parentElement?.textContent).toContain(ROW.path)
    // The reserved sprint verbs stay live through the host's dialog, inside the card.
    expect((within(disclosure).getByRole('button', { name: 'Verdict' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Owns it/)).toBeTruthy()
    expect(document.querySelectorAll('input')).toHaveLength(0)
  })

  it('the risk tier control is marked as a write; a document whose why-marker has no words shows no "Why this tier" eyebrow', async () => {
    install({ openDocument: vi.fn().mockResolvedValue({ ok: true, path: ROW.path, shaped: true, warnings: [], sections: [{ ...SECTIONS[2], text: '## Context\n**Why this tier:**\n' }] }) })
    await renderCard()
    expect(screen.getByRole('group', { name: 'Risk tier' }).hasAttribute('data-write')).toBe(true)
    expect(screen.queryByTestId('why-this-tier')).toBeNull()
    expect(whyTierNotes([{ ...SECTIONS[2], text: '## Context\n**Why this tier:**   \n' }])).toEqual([])
  })

  it('the Hand off foot is disabled with handoff.py\'s own sentence', async () => {
    install(); await renderCard()
    const handOff = screen.getByRole('button', { name: /^Hand off/ }) as HTMLButtonElement
    expect(handOff.disabled).toBe(true)
    expect(handOff.getAttribute('title')).toBe('Spec 0008 is not ready: ## Scope Out: missing')
  })

  it('raising is free (HIGH pressed, no name field); lowering is refused in the plugin\'s words and the name field appears only then', async () => {
    const studio = install({ setSpecRisk: vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, refusal: { kind: 'lowering_needs_authorisation', message: 'Lowering a tier needs a name.' } }).mockResolvedValueOnce({ ok: true }) })
    await renderCard()
    fireEvent.click(screen.getByRole('button', { name: /^HIGH$/ }))
    await waitFor(() => expect(studio.setSpecRisk).toHaveBeenCalledWith('/p', ROW.path, 'HIGH', undefined))
    expect(screen.queryByLabelText(/Who authorised lowering this tier/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^LOW$/ }))
    const field = await screen.findByLabelText(/Who authorised lowering this tier/)
    expect(screen.getByText('Lowering a tier needs a name.')).toBeTruthy()
    fireEvent.change(field, { target: { value: 'Matt K' } })
    fireEvent.click(screen.getByRole('button', { name: /^LOW$/ }))
    await waitFor(() => expect(studio.setSpecRisk).toHaveBeenLastCalledWith('/p', ROW.path, 'LOW', 'Matt K'))
    await waitFor(() => expect(screen.queryByLabelText(/Who authorised lowering this tier/)).toBeNull())
    // The pressed tier is the plugin's `risk` as re-read (the fixture stays MEDIUM): inverse tone, pinned class.
    expect(screen.getByRole('button', { name: /^MEDIUM$/ }).className).toContain('bg-slate-900')
  })

  it('Confirm tier runs confirmTier and re-reads; without confirm-tier it is disabled with the capability', async () => {
    const studio = install(); await renderCard()
    fireEvent.click(screen.getByRole('button', { name: /^Confirm tier/ }))
    await waitFor(() => expect(studio.confirmTier).toHaveBeenCalledWith('/p', ROW.path))
    expect((await screen.findByTestId('tier-message')).textContent).toBe('confirmed by @sam-k')
    await waitFor(() => expect(studio.getSpecCard).toHaveBeenCalledTimes(2))
    cleanup()
    install({ getSpecCard: vi.fn().mockResolvedValue({ ...CARD, ladder: block(null, 'spec_readiness.py --spec --json ladder', 'no ladder key'), readiness: block({ ...CARD.readiness.data!, ladder: undefined }, CARD.readiness.source) }) })
    await renderCard({ capabilities: ['sprint-status'] })
    const confirm = screen.getByRole('button', { name: /^Confirm tier/ }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(confirm.getAttribute('title')).toBe(newerPlugin('confirm-tier'))
    expect(screen.getByTestId('ladder-empty').textContent).toBe(newerPlugin('readiness-all'))
  })

  it('Back and Esc both return to the opener; a dialog\'s Escape is left alone', async () => {
    install()
    const { onBack } = await renderCard()
    fireEvent.click(screen.getByRole('button', { name: '← Back to the board' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(2)
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.appendChild(dialog)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('the lazy chunk resolves; the document helpers are pure lookups by heading', async () => {
    const mod = await import('../src/components/SpecCard/SpecCard')
    expect(mod.default).toBe(mod.SpecCard)
    expect(scopeSections(SECTIONS)).toEqual({ scopeIn: 'In: the export endpoint.', scopeOut: 'Billing.' })
    expect(harnessContext(SECTIONS)).toBe('rate-limited export worker')
    expect(whyTierNotes(SECTIONS)).toEqual(['lowered to MEDIUM by Matt K — read path only.'])
    expect(scopeSections([])).toEqual({ scopeIn: null, scopeOut: null })
    expect(harnessContext([])).toBeNull()
  })

  /** v13 fixer round: the template's guidance comment is not the spec's scope. "In" showed
   * `<!-- What the change must not touch is as load-bearing as what it must do. -->` as content;
   * now a comment is stripped and an empty section reads "no data — the section is empty", which
   * is a different fact from "not in the document". */
  it('an HTML comment in a section is not its text; an empty section says "no data", an absent one "not in the document"', async () => {
    const sections: DocumentSection[] = [
      { kind: 'section', key: 'Scope', heading: 'Scope', start: 0, end: 10, text: '## Scope\n<!-- What the change must not touch is as load-bearing as what it must do. -->\n', fields: {} },
      { kind: 'section', key: 'Scope Out', heading: 'Scope Out', start: 10, end: 20, text: '## Scope Out\n<!-- a note -->Billing.<!-- another\nnote -->\n', fields: {} },
    ]
    expect(stripHtmlComments('a <!-- b --> c')).toBe('a  c')
    expect(scopeSections(sections)).toEqual({ scopeIn: '', scopeOut: 'Billing.' })
    install({ openDocument: vi.fn().mockResolvedValue({ ok: true, path: ROW.path, shaped: true, warnings: [], sections }) })
    await renderCard()
    const inDoc = document.querySelector('[data-doc="In"]') as HTMLElement
    expect(inDoc.textContent).not.toContain('<!--')
    expect(inDoc.textContent).not.toContain('load-bearing')
    expect(inDoc.querySelector('[data-doc-empty]')?.getAttribute('data-doc-empty')).toBe('empty')
    expect(within(inDoc).getByText(SECTION_EMPTY)).toBeTruthy()
    expect(inDoc.querySelector('[data-doc-empty]')?.className).toContain('text-ink-3')
    expect(within(document.querySelector('[data-doc="Out"]') as HTMLElement).getByText('Billing.')).toBeTruthy()
    const harness = document.querySelector('[data-doc="harness_context"]') as HTMLElement
    expect(harness.querySelector('[data-doc-empty]')?.getAttribute('data-doc-empty')).toBe('absent')
    expect(within(harness).getByText(SECTION_ABSENT)).toBeTruthy()
  })

  /** v14 (spec-card@1680): the Scope card drew "### In scope" and a lone "-" as literal text. The
   * body is the document's own markdown, TYPESET through `MarkdownView` (a sub-heading and a list
   * as such; raw HTML dropped, so a template placeholder comment can never surface), and the
   * template's scaffolding — an empty bullet, a sub-heading over nothing — is not content: it
   * reads as "no data — the section is empty", the fact the DoR already names. */
  it('the scope body is typeset markdown — a sub-heading and a list, never the marks; a placeholder comment stays hidden; an empty bullet under a bare sub-heading is "no data"', async () => {
    const sections: DocumentSection[] = [
      { kind: 'section', key: 'Scope', heading: 'Scope', start: 0, end: 10, text: '## Scope\n### In scope\n- the export endpoint\n- its retry policy\n<!-- what -->\n', fields: {} },
      { kind: 'section', key: 'Scope Out', heading: 'Scope Out', start: 10, end: 20, text: '## Scope Out\n### Out of scope\n- \n<!-- what -->\n', fields: {} },
    ]
    expect(stripEmptyListMarkers('- \n- kept\n*\n1.\n')).toBe('- kept\n')
    expect(headingsOnly('### In scope\n\n#### Also')).toBe(true)
    expect(headingsOnly('### In scope\n- x')).toBe(false)
    expect(headingsOnly('')).toBe(false)
    expect(scopeSections(sections)).toEqual({ scopeIn: '### In scope\n- the export endpoint\n- its retry policy', scopeOut: '' })
    install({ openDocument: vi.fn().mockResolvedValue({ ok: true, path: ROW.path, shaped: true, warnings: [], sections }) })
    await renderCard()
    const inDoc = document.querySelector('[data-doc="In"]') as HTMLElement
    const body = inDoc.querySelector('[data-doc-body]') as HTMLElement
    expect(body).not.toBeNull()
    expect(body.querySelector('pre')).toBeNull()
    expect(body.querySelector('h1, h2, h3, h4, h5, h6')?.textContent).toBe('In scope')
    expect(Array.from(body.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['the export endpoint', 'its retry policy'])
    expect(body.textContent).not.toContain('###')
    expect(body.textContent).not.toContain('<!--')
    expect(body.textContent).not.toContain('what')
    const outDoc = document.querySelector('[data-doc="Out"]') as HTMLElement
    expect(outDoc.querySelector('[data-doc-body]')).toBeNull()
    expect(outDoc.querySelector('li')).toBeNull()
    expect(outDoc.textContent).not.toContain('###')
    expect(outDoc.textContent).not.toContain('what')
    expect(outDoc.querySelector('[data-doc-empty]')?.getAttribute('data-doc-empty')).toBe('empty')
    expect(within(outDoc).getByText(SECTION_EMPTY)).toBeTruthy()
  })

  /** v12 critique #3: the body's padding-bottom equals the sticky foot's height (64 px), so its
   * last line clears the foot; the foot is the card's last child, after the body. */
  it('the body clears the sticky foot by the foot\'s own height, and the foot comes last', async () => {
    install(); await renderCard()
    const body = screen.getByTestId('spec-body')
    expect(body.className).toContain('pb-16')
    expect(body.className).not.toContain('pb-20')
    const foot = screen.getByTestId('handoff-foot')
    expect(foot.className).toContain('h-16')
    expect(body.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(foot.parentElement).toBe(screen.getByTestId('spec-card'))
  })
})
