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
    for (const v of ['Board', 'How it is going', 'Closing']) expect(away).not.toContain(`>${v}<`)
  })

  it('opens Build Loop’s screens beneath it once you are on one of them', () => {
    for (const area of ['build', 'explain', 'closing'] as const) {
      const html = render({ area })
      for (const v of ['Board', 'How it is going', 'Closing', 'Documents']) expect(html, `${area}: ${v}`).toContain(`>${v}<`)
    }
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
})
