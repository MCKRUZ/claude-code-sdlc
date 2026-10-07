// @vitest-environment jsdom
/** The Spine's DOM view, as a person without a GPU meets it (studio-observatory.md §5.1
 * "DOM-equivalent"): nine real buttons under four group headers, a `Badge now` on the current
 * row, "no name recorded" where the plugin recorded none, and a click that hands the stage id
 * back. Then the whole entry module through SceneShell in jsdom: no WebGL → the table renders
 * alone inside a figure whose caption is the honesty line, and no scene chunk is requested. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectStage } from '../../shared/types'
import { resetCanvasRegistry } from '../../src/scenes/core/canvasRegistry'
import { buildSpineData, NO_NAME_RECORDED, SPINE_CAPTION, SPINE_LEGEND } from '../../src/scenes/spine/spineModel'
import { SPINE_RETICLE_LEGEND } from '../../src/scenes/spine/spineReticle'
import { SpineTable, VIEWING_LABEL } from '../../src/scenes/spine/SpineTable'
import LifecycleSpine from '../../src/scenes/spine/LifecycleSpine'

const seam = vi.hoisted(() => ({ loadCanvasHost: vi.fn(() => Promise.resolve({ default: () => null })) }))
vi.mock('../../src/scenes/core/lazyCanvas', () => ({ loadCanvasHost: seam.loadCanvasHost }))

const IDS = ['0', '1', '2', '3', 'build', '7', '8', '9', 'close']

function stage(id: string, over: Partial<ProjectStage> = {}): ProjectStage {
  return {
    id, name: `phase-${id}`, display: `Phase ${id}`, status: 'pending', stage_state: 'later',
    artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null, ...over,
  }
}

/** The text of every element an `aria-describedby` points at. */
function describedText(el: Element): string {
  return (el.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
}

function data() {
  const stages = IDS.map((id, i) => {
    if (i < 3) return stage(id, { stage_state: 'signed_off', signed_off_by: i === 1 ? null : 'Priya N', entered_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-05T10:00:00Z', artifact_count: 2 })
    if (i === 3) return stage(id, { stage_state: 'current', entered_at: '2026-09-06T08:00:00Z', artifact_count: 1 })
    return stage(id)
  })
  return buildSpineData({ stages, currentPhaseId: '3' })
}

// jsdom lays nothing out, so a host measures 0 px and SceneShell would (honestly) call it narrow
// and append the widen-the-window reason to the caption. This test is about the no-WebGL
// fallback, not a narrow host, so the host is stubbed wide — the same stub sceneShell.test uses.
const realRect = HTMLElement.prototype.getBoundingClientRect
beforeEach(() => {
  seam.loadCanvasHost.mockClear()
  resetCanvasRegistry()
  localStorage.clear()
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 200, top: 0, left: 0, right: 800, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
})
afterEach(() => {
  cleanup()
  HTMLElement.prototype.getBoundingClientRect = realRect
})

describe('SpineTable', () => {
  it('lists nine stage buttons under the four group headers, in plugin order', () => {
    render(<SpineTable data={data()} onActivate={() => {}} />)
    const list = screen.getByRole('list', { name: 'Lifecycle' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons).toHaveLength(9)
    expect(buttons.map((b) => b.closest('li')?.getAttribute('data-stage-id'))).toEqual(IDS)
    const headers = Array.from(list.querySelectorAll('[data-spine-group-header]')).map((el) => el.textContent)
    expect(headers).toEqual(['Foundation', 'Build', 'Ship', 'Close'])
    expect(within(list).getByRole('list', { name: 'Foundation stages' })).toBeTruthy()
  })

  it('reads state, signer, dates and artifacts per row, with "no name recorded" for a null signer', () => {
    render(<SpineTable data={data()} onActivate={() => {}} />)
    const row0 = screen.getByRole('button', { name: /Phase 0/ })
    expect(row0?.textContent ?? "").toContain('Signed off')
    expect(row0?.textContent ?? "").toContain('Priya N')
    expect(row0?.textContent ?? "").toContain('2026-09-01')
    expect(row0?.textContent ?? "").toContain('2026-09-05')
    expect(row0?.textContent ?? "").toContain('2 artifacts')
    const row1 = screen.getByRole('button', { name: /Phase 1/ })
    expect(row1?.textContent ?? "").toContain('Completed')
    expect(row1?.textContent ?? "").toContain(NO_NAME_RECORDED)
    expect(row1.closest('li')?.getAttribute('data-stage-kind')).toBe('completed')
    const later = screen.getByRole('button', { name: /Phase 7/ })
    expect(later?.textContent ?? "").toContain('Later')
    expect(later?.textContent ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('marks the current row with Badge now and never with aria-current', () => {
    render(<SpineTable data={data()} onActivate={() => {}} />)
    const current = screen.getByRole('button', { name: /Phase 3/ })
    const badge = current.querySelector('[data-badge-kind="now"]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent ?? "").toContain('Now')
    expect(document.querySelectorAll('[data-badge-kind="now"]')).toHaveLength(1)
    expect(document.querySelector('[aria-current]')).toBeNull()
  })

  it('lists the Build views under the Build row and hands the stage id to onActivate on click', () => {
    const onActivate = vi.fn()
    render(<SpineTable data={data()} onActivate={onActivate} />)
    const build = screen.getByRole('button', { name: /Phase build/ })
    // Re-recorded (plugin 1.8.0): Issues joined the Build views after the Board (/sdlc-report-issue).
    expect(build.closest('li')?.textContent ?? "").toContain('Home · Planning · Board · Issues · How it is going · Closing · Documents')
    fireEvent.click(build)
    fireEvent.click(screen.getByRole('button', { name: /Phase 9/ }))
    expect(onActivate.mock.calls).toEqual([['build'], ['9']])
  })

  /** Round 2 (I3): the VIEWED stage is a `data-viewing` row with a "Viewing" badge of the kit's
   * `current` kind — never `aria-current` (the sidebar's one is the page's), never `kind="now"`
   * (the plugin's "now" stays the Now badge). Null (Closing) marks nothing. */
  it('marks the viewed stage with data-viewing and a Viewing badge: zero aria-current, one data-viewing, the Now badge untouched', () => {
    render(<SpineTable data={{ ...data(), viewedStageId: '1' }} onActivate={() => {}} />)
    const viewing = document.querySelectorAll('[data-viewing]')
    expect(viewing).toHaveLength(1)
    expect(viewing[0].getAttribute('data-stage-id')).toBe('1')
    const badge = viewing[0].querySelector('[data-badge-kind="current"]')
    expect(badge?.textContent).toContain(VIEWING_LABEL)
    expect(document.querySelectorAll('[data-badge-kind="now"]')).toHaveLength(1)
    expect(document.querySelector('[data-badge-kind="now"]')?.closest('li')?.getAttribute('data-stage-id')).toBe('3')
    expect(document.querySelector('[aria-current]')).toBeNull()
    cleanup()
    render(<SpineTable data={{ ...data(), viewedStageId: null }} onActivate={() => {}} />)
    expect(document.querySelectorAll('[data-viewing]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-badge-kind="current"]')).toHaveLength(0)
  })

  it('carries the long legend as its own caption (S3 moved it off the figcaption)', () => {
    render(<SpineTable data={data()} onActivate={() => {}} />)
    expect(screen.getByText(SPINE_LEGEND).getAttribute('data-spine-table-caption')).toBe('')
  })

  it('shares hover with the plates: entering a row reports its id, leaving reports null', () => {
    const onHover = vi.fn()
    render(<SpineTable data={data()} onActivate={() => {}} hoverId="2" onHover={onHover} />)
    expect(screen.getByRole('button', { name: /Phase 2/ }).closest('li')?.hasAttribute('data-hovered')).toBe(true)
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Phase 0/ }))
    fireEvent.mouseLeave(screen.getByRole('button', { name: /Phase 0/ }))
    expect(onHover.mock.calls).toEqual([['0'], [null]])
  })
})

describe('LifecycleSpine in jsdom (no WebGL)', () => {
  it('renders the table alone inside the figure with the honesty caption and never requests the scene chunk', () => {
    const onActivate = vi.fn()
    render(<LifecycleSpine id="spine" data={data()} hoverId={null} onHover={() => {}} onActivate={onActivate} live={false} />)
    const figure = screen.getByRole('figure', { name: 'Lifecycle' })
    expect(figure.getAttribute('data-surface')).toBe('table')
    expect(within(figure).getAllByRole('button').filter((b) => b.closest('[data-spine-table]'))).toHaveLength(9)
    // S3: the figcaption is the condensed line (still "carry no meaning"); the long sentence is
    // the table's caption. No stage is being viewed here, so no reticle sentence.
    const caption = figure.querySelector('figcaption')!
    expect(caption.textContent).toBe(SPINE_CAPTION)
    expect(SPINE_CAPTION).toContain('carry no meaning')
    expect(caption.textContent).not.toContain(SPINE_RETICLE_LEGEND)
    expect(within(figure).getByText(SPINE_LEGEND).tagName).toBe('P')
    // Phase 1 is `signed_off` with no name: the summary counts it as completed, never as signed.
    expect(describedText(figure)).toMatch(/Phase 3 \(4 of 9\) current; 2 signed off, 1 completed without a name; next: Phase build/)
    expect(figure.querySelector('canvas')).toBeNull()
    expect(seam.loadCanvasHost).not.toHaveBeenCalled()
    fireEvent.click(within(figure).getByRole('button', { name: /Phase 2/ }))
    expect(onActivate).toHaveBeenCalledWith('2')
  })

  it('adds the reticle sentence to the figcaption only while a stage is being viewed', () => {
    render(<LifecycleSpine id="spine" data={{ ...data(), viewedStageId: '2' }} hoverId={null} onHover={() => {}} onActivate={() => {}} live={false} />)
    const figure = screen.getByRole('figure', { name: 'Lifecycle' })
    expect(figure.querySelector('figcaption')?.textContent).toBe(`${SPINE_CAPTION} ${SPINE_RETICLE_LEGEND}`)
    expect(figure.querySelectorAll('[data-viewing]')).toHaveLength(1)
    expect(figure.querySelector('[aria-current]')).toBeNull()
  })
})
