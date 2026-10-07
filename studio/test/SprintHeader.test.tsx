// @vitest-environment jsdom
/** The header keeps the old board's test ids and says only what `sprint.py status --json` said:
 * "n of cap" / "cap not set" / "no data", mix chips with the plugin's warnings in amber, the
 * day bar or its sentence; with no sprint the plugin's own `note` and one "New sprint" that is
 * disabled only for an honest reason. */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CAP_NOT_SET, NO_ACTOR, NO_DATA, newerPlugin } from '../shared/reasons'
import { newSprintReason, SprintHeader, wipText } from '../src/components/SprintHeader'
import { CC, NO_SPRINT, SPRINT } from './sprintHomeFixture'

describe('wipText', () => {
  it('"n of cap", "n in flight · cap not set", or "no data" — never a 0 the plugin did not report', () => {
    expect(wipText({ inFlight: 2, cap: 4 })).toBe('2 of 4')
    expect(wipText({ inFlight: 0, cap: null })).toContain(CAP_NOT_SET)
    expect(wipText({ inFlight: null, cap: 4 })).toBe(NO_DATA)
  })
})

describe('SprintHeader with a sprint', () => {
  it('draws id — goal in the sprint title, the state chip, target, WIP, mix chips and the bar', () => {
    render(<SprintHeader view={SPRINT} actor={CC.actor} capabilities={CC.capabilities} onNewSprint={vi.fn()} />)
    const header = screen.getByTestId('sprint-header')
    expect(header.querySelector('h2')?.className).toContain('text-sprint-title')
    expect(header.textContent).toContain('S08')
    expect(header.textContent).toContain('Adjusters file without a phone call')
    expect(screen.getByTestId('sprint-state').textContent).toBe('ready')
    expect(screen.getByTestId('sprint-target').textContent).toBe('4 specs')
    expect(screen.getByTestId('sprint-wip').textContent).toBe('2 of 4')
    expect(screen.getAllByTestId('sprint-mix').map((c) => c.textContent)).toEqual(['HIGH 1/1', 'MEDIUM 2/2', 'LOW 2/1'])
    expect(screen.getByTestId('sprint-mix-warnings').textContent).toContain('LOW: 2 slated of 1 targeted')
    expect(screen.getByTestId('sprint-mix-warnings').className).toContain('status-warn')
    // Owner's v12 item 1: the gap is a warn-tone CHIP on the facts line (a measured gap, never an
    // error tone), each sentence whole; the day bar spans the header, not a 36rem column.
    const warningChips = screen.getByTestId('sprint-mix-warnings').querySelectorAll('[data-mix-warning]')
    expect(warningChips).toHaveLength(1)
    expect(warningChips[0].className).toContain('status-warn')
    expect(warningChips[0].className).not.toContain('status-error')
    expect(warningChips[0].textContent).toBe('LOW: 2 slated of 1 targeted')
    expect(header.hasAttribute('data-cockpit-header')).toBe(true)
    expect(header.className).toContain('space-y-2')
    expect(screen.getByTestId('business-day-bar').className).toContain('w-full')
    expect(screen.getByTestId('business-day-bar').className).not.toContain('max-w-xl')
    expect(screen.getByTestId('business-day-bar').getAttribute('data-bar')).toBe('drawn')
    expect(screen.queryByText('New sprint')).toBeNull()
  })

  it('every fact names its source', () => {
    render(<SprintHeader view={SPRINT} actor={CC.actor} capabilities={CC.capabilities} onNewSprint={vi.fn()} />)
    expect(screen.getByTestId('sprint-wip').getAttribute('data-source')).toContain('sprint.py status --json')
    expect(screen.getByTestId('sprint-header').querySelector('h2')?.getAttribute('title')).toBe('sprint.py status --json')
  })

  it('a cap the plugin did not state reads "cap not set"; unreadable dates read the sentence', () => {
    const view = { ...SPRINT, wip: { inFlight: 1, cap: null }, sprint: { ...SPRINT.sprint!, days: { total: null, elapsed: null, remaining: null } } }
    render(<SprintHeader view={view} actor={CC.actor} capabilities={CC.capabilities} onNewSprint={vi.fn()} />)
    expect(screen.getByTestId('sprint-wip').textContent).toContain('cap not set')
    expect(screen.getByTestId('business-day-bar').getAttribute('data-bar')).toBe('none')
  })
})

describe('SprintHeader with no sprint', () => {
  it('shows the plugin\'s note, the no-sprint figure and ONE primary New sprint that opens the dialog', () => {
    const onNew = vi.fn()
    render(<SprintHeader view={NO_SPRINT} actor={CC.actor} capabilities={CC.capabilities} onNewSprint={onNew} />)
    expect(screen.getByTestId('sprint-empty').textContent).toBe(NO_SPRINT.note)
    expect(document.querySelector('[data-cc-figure="no-sprint"]')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'New sprint' })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.hasAttribute('data-write')).toBe(true)
    fireEvent.click(button)
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('is disabled with NO_ACTOR when nobody is signed in, and with the capability line on an older plugin', () => {
    expect(newSprintReason(null, ['sprint-status', 'sprint-write'])).toBe(NO_ACTOR)
    expect(newSprintReason(CC.actor, ['sprint-status'])).toBe(newerPlugin('sprint-write'))
    expect(newSprintReason(CC.actor, CC.capabilities)).toBeNull()
    render(<SprintHeader view={NO_SPRINT} actor={null} capabilities={['sprint-status', 'sprint-write']} onNewSprint={vi.fn()} />)
    const button = screen.getByRole('button', { name: /New sprint/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.querySelector('[data-disabled-reason]')?.textContent).toBe(NO_ACTOR)
  })
})
