/** The sidebar as a person meets it: one navigation, grouped, honest about sign-off, with Build
 * Loop's own screens opening beneath it and the project-wide things in the footer. */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProjectStatus, SyncState } from '../shared/types'
import { Sidebar } from '../src/components/Sidebar'

const mk = (id: string, state: 'current' | 'signed_off' | 'later', signed: string | null = null) => ({
  id, name: id, display: `Phase ${id}`, status: state, stage_state: state, artifact_count: 0,
  entered_at: null, completed_at: null, signed_off_by: signed,
})

const STATUS: ProjectStatus = {
  project_name: 'acme-claims', profile_id: 'microsoft-enterprise',
  current_phase: { id: '3', display: 'Phase 3: Foundation' },
  stages: [
    mk('0', 'signed_off'), mk('1', 'signed_off'), mk('2', 'signed_off', 'Priya N.'), mk('3', 'current'),
    mk('build', 'later'), mk('7', 'later'), mk('8', 'later'), mk('9', 'later'), mk('close', 'later'),
  ],
}

const IDLE: SyncState = { kind: 'idle', lastPulledAt: null }

function render(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return renderToStaticMarkup(createElement(Sidebar, {
    status: STATUS, area: 'documents', viewedStageId: undefined, currentDocs: null, syncState: IDLE,
    consoleOpen: false, onToggleConsole: () => {}, onNavigate: () => {}, ...over,
  }))
}

describe('Sidebar', () => {
  it('names the project and its profile', () => {
    const html = render()
    expect(html).toContain('acme-claims')
    expect(html).toContain('microsoft-enterprise')
  })

  it('groups the journey under Foundation, Build, Ship and Close', () => {
    const html = render()
    for (const label of ['Foundation', 'Build', 'Ship', 'Close']) expect(html).toContain(`>${label}<`)
  })

  it('shows progress through the stages', () => {
    expect(render()).toContain('3 of 9')
  })

  it('marks exactly one entry as the page being viewed', () => {
    const html = render({ viewedStageId: '2' })
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('tells a named sign-off apart from a completion with no name, in words and in shape', () => {
    const html = render()
    expect(html).toContain('Signed off · Priya N.')
    expect(html).toContain('Completed · no name recorded')
    expect(html).toContain('data-node="signed"')
    expect(html).toContain('data-node="completed"')
  })

  it('shows document progress on the current stage when it is known', () => {
    expect(render({ currentDocs: { complete: 3, total: 5 } })).toContain('3 of 5 documents complete')
  })

  it('keeps Build Loop’s own screens hidden until Build Loop is where you are', () => {
    const away = render()
    for (const v of ['Board', 'Sprint', 'How it is going', 'Closing']) expect(away).not.toContain(`>${v}<`)
  })

  it('opens Build Loop’s screens beneath it once you are on one of them', () => {
    for (const area of ['build', 'sprint', 'explain', 'closing'] as const) {
      const html = render({ area })
      for (const v of ['Board', 'Sprint', 'How it is going', 'Closing', 'Documents']) expect(html, `${area}: ${v}`).toContain(`>${v}<`)
    }
  })

  it('lights the Sprint entry, and only it, on the sprint screen', () => {
    const html = render({ area: 'sprint' })
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="page"[^>]*>[^<]*<span>Sprint<\/span>/)
  })

  it('puts Settings and Console in the footer, and never lights a stage on Settings', () => {
    const html = render({ area: 'settings', viewedStageId: '2' })
    expect(html).toContain('>Settings<')
    expect(html).toContain('>Console<')
    // Only Settings is lit.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('carries the sync state, so it is on every screen', () => {
    expect(render({ syncState: { kind: 'clashes', count: 4 } })).toContain('4 sections need your input')
    expect(render({ syncState: { kind: 'error', message: 'offline' } })).toContain('Sync error')
  })

  it('has no row of top tabs at all', () => {
    expect(render()).not.toContain('role="tab"')
  })

  // --- Observatory (§7 Sidebar row) additions -------------------------------------------------

  it('announces stage progress as a progressbar that says the same thing the text does', () => {
    const html = render()
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuetext="3 of 9 stages done"')
    // The bar is still the thin rail it was.
    expect(html).toMatch(/role="progressbar"[^>]*class="[^"]*\bh-1\.5\b/)
  })

  it('offers Search and Appearance in the footer as buttons, never as an input or a tab', () => {
    const html = render()
    expect(html).toContain('>Search<')
    expect(html).toContain('>Appearance<')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('role="tab"')
    // Neither is a page, so the count-of-one on aria-current still holds with them present.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('marks the Now chip as the element that Flips between rows', () => {
    expect(render()).toContain('data-flip-id="now"')
  })

  it('bounds its own height below `sm` so `nav`\'s overflow-y-auto has something to scroll against, and lifts that bound again at `sm:`+ (PR #76 review finding #1)', () => {
    // Below `sm`, Frame.tsx stacks Sidebar/main/ChatPanel in a COLUMN (spec 0018) — this
    // aside's cross axis there is width, not height, so without a cap of its own `nav`'s
    // `min-h-0 flex-1 overflow-y-auto` has no bounded ancestor to size against: the full stage
    // list would render at full content height instead of scrolling, pushing everything below
    // it off-screen. `renderToStaticMarkup` cannot measure real pixels (no layout engine), but
    // it CAN prove the specific class-level defect is gone: a height cap present below `sm`,
    // explicitly lifted again at `sm:`+ so the original row-stretch behaviour is unchanged.
    const asideMatch = render().match(/<aside class="([^"]+)"/)
    expect(asideMatch).not.toBeNull()
    const asideClass = asideMatch![1]
    expect(asideClass).toMatch(/\bmax-h-\[[^\]]+\]/)
    expect(asideClass).toMatch(/\bsm:max-h-none\b/)
  })
})
