// @vitest-environment jsdom
/** The lifecycle strip (togo-command-center.md §1, §7 P4 acceptance) — the recorded replacement
 * for `sidebar.test.ts` / `sidebarFade.test.tsx` (§8 pin change 1): the component no longer
 * exists; the strip holds `nav[aria-label=Project]` inside the shell's first `<aside>`, so every
 * a11y count is unchanged. Promises here: nine SVG stations in registry order, the lit rail = the
 * signed-off count (a progressbar saying "3 of 9 stages done"), no `<canvas>`, no `aria-current`
 * on any SVG element, the Build station's name starting "Build Loop" and reading the sprint the
 * plugin reported (ordinal only with `sprint-list`), the views beneath it on click (`aria-expanded`),
 * exactly one `aria-current="page"`, the viewed station carrying `data-viewing`, no `<input>`. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandCenter, ProjectStatus, SourcedBlock } from '../shared/types'
import { LifecycleStrip, buildStationLabel, ordinalWord, stripFactsFrom, NO_SPRINT_FACTS } from '../src/components/LifecycleStrip'
import { stripProgressText } from '../src/scenes/spine/SpineStrip'
import { sprintHomeUnavailableReason } from '../shared/nav'

const mk = (id: string, state: 'current' | 'signed_off' | 'later', signed: string | null = null) => ({
  id, name: id, display: id === 'build' ? 'Build Loop' : `Phase ${id}`, status: state, stage_state: state, artifact_count: 0,
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

function block<T = never>(data: T | null, source = 'x --json'): SourcedBlock<T> {
  return { source, fetchedAt: '2026-10-06T10:00:00Z', ok: data !== null, data, error: null }
}

/** A command-center document with only what the strip reads filled in. */
function cc(over: { capabilities?: string[]; active?: string | null; ordinal?: number | null; statusSprint?: string | null } = {}): CommandCenter {
  const active = over.active === undefined ? 'S08' : over.active
  const sprints = active ? [{ id: active, state: 'ready', goal: 'g', start: '2026-09-28', end: '2026-10-09', ordinal: over.ordinal ?? 8 }] : []
  return {
    projectPath: '/p', fetchedAt: 'now', actor: null,
    capabilities: over.capabilities ?? ['sprint-status', 'sprint-list'],
    sprint: block({ sprint: over.statusSprint === undefined ? null : over.statusSprint ? { id: over.statusSprint } : null, hasData: true } as never, 'sprint.py status --json'),
    sprints: block({ sprints, active, count: sprints.length }, 'sprint.py list --json'),
    board: block<never>(null), decisions: block<never>(null), findings: block<never>(null), scorecard: block<never>(null), roster: block<never>(null), log: block<never>(null),
    needsYou: [], needsYouReason: null, sinceYesterday: [], since: 1,
  }
}

function mount(over: Partial<Parameters<typeof LifecycleStrip>[0]> = {}) {
  const onNavigate = vi.fn()
  const utils = render(<LifecycleStrip status={STATUS} projectPath="/p" area="documents" viewedStageId={undefined} onNavigate={onNavigate} {...over} />)
  return { ...utils, onNavigate, nav: screen.getByRole('navigation', { name: 'Project' }) }
}

afterEach(cleanup)

describe('LifecycleStrip: nine SVG stations on a lit rail', () => {
  it('draws every stage in registry order as a button with an SVG ring, no canvas, no aria-current inside any svg', () => {
    const { nav } = mount()
    const stations = nav.querySelectorAll('ol > li[data-stage-id]')
    expect(Array.from(stations).map((li) => li.getAttribute('data-stage-id'))).toEqual(['0', '1', '2', '3', 'build', '7', '8', '9', 'close'])
    expect(nav.querySelectorAll('[data-station-ring]')).toHaveLength(9)
    expect(nav.querySelectorAll('canvas')).toHaveLength(0)
    expect(nav.querySelectorAll('svg [aria-current]')).toHaveLength(0)
    expect(nav.querySelectorAll('input')).toHaveLength(0)
  })

  it('lit rail = the signed-off count, as a progressbar saying the sidebar\'s sentence', () => {
    const { nav } = mount()
    const bar = within(nav).getByRole('progressbar', { name: 'stages done' })
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.getAttribute('aria-valuemax')).toBe('9')
    expect(bar.getAttribute('aria-valuetext')).toBe(stripProgressText(3, 9))
    // The last signed station is index 2 of 9 → 2/8 of the rail.
    expect(nav.querySelector('[data-strip-rail]')?.getAttribute('x2')).toBe('25%')
    expect(nav.querySelector('[data-strip-rail]')?.getAttribute('pathLength')).toBe('100')
  })

  it('tells a named sign-off from a completion with no name in shape and in words', () => {
    const { nav } = mount()
    expect(nav.querySelectorAll('[data-node="signed"]')).toHaveLength(1)
    expect(nav.querySelectorAll('[data-node="completed"]')).toHaveLength(2)
    expect(nav.querySelectorAll('[data-node="current"]')).toHaveLength(1)
    // The name is the display alone; the sentence (`stageMeta`) rides on `aria-description`, so the
    // Build station's name is exactly what the plan writes (§1) and the e2e matches `/^Build Loop$/`.
    // (jsdom's accessibility layer does not compute `aria-description` yet, so the attribute is read.)
    expect(within(nav).getByRole('button', { name: 'Phase 2' }).getAttribute('aria-description')).toMatch(/^Signed off · Priya N\./)
    expect(within(nav).getByRole('button', { name: 'Phase 1' }).getAttribute('aria-description')).toMatch(/^Completed · no name recorded/)
  })
})

describe('LifecycleStrip: the Build station names the sprint the plugin reported', () => {
  it('"Build Loop · S08 · 8th sprint" from the list, "Build Loop · S08" without sprint-list, "Build Loop" with no sprint', () => {
    expect(buildStationLabel('Build Loop', { sprintId: 'S08', ordinal: 8 })).toBe('Build Loop · S08 · 8th sprint')
    expect(buildStationLabel('Build Loop', { sprintId: 'S08', ordinal: null })).toBe('Build Loop · S08')
    expect(buildStationLabel('Build Loop', { sprintId: null, ordinal: 8 })).toBe('Build Loop')
    expect(stripFactsFrom(cc())).toEqual({ sprintId: 'S08', ordinal: 8, capabilities: ['sprint-status', 'sprint-list'] })
    expect(stripFactsFrom(cc({ capabilities: ['sprint-status'] })).ordinal).toBeNull()
    expect(stripFactsFrom(cc({ active: null, statusSprint: 'S07', capabilities: ['sprint-status'] })).sprintId).toBe('S07')
    expect(stripFactsFrom(null)).toEqual(NO_SPRINT_FACTS)
  })

  it('the accessible name starts "Build Loop" in every case (the e2e helpers match /^Build Loop/)', () => {
    const { nav, unmount } = mount({ sprint: stripFactsFrom(cc()) })
    expect(within(nav).getByRole('button', { name: 'Build Loop · S08 · 8th sprint' })).toBeTruthy()
    unmount()
    const bare = mount({ sprint: stripFactsFrom(cc({ capabilities: ['sprint-status'] })) })
    expect(within(bare.nav).getByRole('button', { name: 'Build Loop · S08' })).toBeTruthy()
    bare.unmount()
    const none = mount()
    expect(within(none.nav).getByRole('button', { name: 'Build Loop' })).toBeTruthy()
  })

  it('carries the sprint-home-unavailable reason only when the plugin is known to lack sprint-status', () => {
    const { nav, unmount } = mount({ sprint: stripFactsFrom(cc({ capabilities: [] })) })
    expect(nav.textContent).toContain(sprintHomeUnavailableReason([]))
    unmount()
    const unknown = mount()
    expect(unknown.nav.textContent).not.toContain('arrives with a newer plugin')
  })

  it('ordinal wording follows English, including 11th–13th', () => {
    expect(['1', '2', '3', '4', '11', '12', '13', '21', '22', '23', '101'].map((n) => ordinalWord(Number(n)))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st'])
  })
})

describe('LifecycleStrip: expansion and the one lit entry', () => {
  it('keeps Build Loop\'s views closed until Build is where you are; click navigates to the Board', () => {
    const { nav, onNavigate } = mount()
    const build = within(nav).getByRole('button', { name: /^Build Loop/ })
    expect(build.getAttribute('aria-expanded')).toBe('false')
    for (const v of ['Board', 'Home', 'Planning', 'How it is going', 'Closing']) expect(within(nav).queryByRole('button', { name: v })).toBeNull()
    fireEvent.click(build)
    expect(onNavigate).toHaveBeenCalledWith({ area: 'build' })
  })

  it('on a Build view the six views open beneath and exactly one entry — the view — is current', () => {
    for (const [area, lit] of [['build', 'Board'], ['sprint', 'Home'], ['planning', 'Planning'], ['explain', 'How it is going'], ['closing', 'Closing']] as const) {
      const { nav, onNavigate, unmount } = mount({ area })
      expect(within(nav).getByRole('button', { name: /^Build Loop/ }).getAttribute('aria-expanded')).toBe('true')
      for (const v of ['Home', 'Planning', 'Board', 'How it is going', 'Closing', 'Documents']) expect(within(nav).getByRole('button', { name: v })).toBeTruthy()
      const current = nav.querySelectorAll('[aria-current="page"]')
      expect(current, area).toHaveLength(1)
      expect(current[0].textContent).toBe(lit)
      fireEvent.click(within(nav).getByRole('button', { name: 'Documents' }))
      expect(onNavigate).toHaveBeenLastCalledWith({ area: 'documents', stageId: 'build' })
      unmount()
    }
  })

  it('the viewed stage carries data-viewing and is the one current entry; Settings lights nothing', () => {
    const { nav, unmount } = mount({ viewedStageId: '2' })
    const viewing = nav.querySelectorAll('[data-viewing]')
    expect(viewing).toHaveLength(1)
    expect(viewing[0].closest('li')?.getAttribute('data-stage-id')).toBe('2')
    expect(viewing[0].querySelector('[data-viewing-ring]')).not.toBeNull()
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(nav.querySelector('[aria-current="page"]')?.getAttribute('aria-label')).toBe('Phase 2')
    unmount()
    const settings = mount({ area: 'settings', viewedStageId: '2' })
    expect(settings.nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
  })

  it('a station click goes where that stage goes; hovering tells the spine store', async () => {
    const { nav, onNavigate } = mount()
    fireEvent.click(within(nav).getByRole('button', { name: 'Phase 7' }))
    expect(onNavigate).toHaveBeenCalledWith({ area: 'documents', stageId: '7' })
    const { spineStore } = await import('../src/stores/spineStore')
    fireEvent.mouseEnter(within(nav).getByRole('button', { name: 'Phase 9' }))
    expect(spineStore.hover).toBe('9')
    fireEvent.mouseLeave(within(nav).getByRole('button', { name: 'Phase 9' }))
    expect(spineStore.hover).toBeNull()
  })
})
