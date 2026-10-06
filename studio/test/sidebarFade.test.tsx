// @vitest-environment jsdom
/** The sidebar's stage list under the pinned footer (observatory v9, every project shot): the
 * list clipped mid-row with nothing to say more was below. The promise: a bottom fade that is
 * present ONLY while the list can scroll further, read from the nav's own scroll metrics and never
 * assumed — and nothing else about the shell moves: still one `<aside>` first, one `aria-current`,
 * no `<input>`, the same nav the a11y spec finds by name. `sidebar.test.ts` keeps the static
 * markup; this is the live half. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectStatus, SyncState } from '../shared/types'
import { Sidebar } from '../src/components/Sidebar'

const mk = (id: string, state: 'current' | 'signed_off' | 'later', signed: string | null = null) => ({
  id, name: id, display: `Phase ${id}`, status: state, stage_state: state, artifact_count: 0,
  entered_at: null, completed_at: null, signed_off_by: signed,
})

const STATUS: ProjectStatus = {
  project_name: 'acme-claims', profile_id: 'microsoft-enterprise',
  current_phase: { id: '0', display: 'Phase 0: Discovery' },
  stages: [
    mk('0', 'current'), mk('1', 'later'), mk('2', 'later'), mk('3', 'later'),
    mk('build', 'later'), mk('7', 'later'), mk('8', 'later'), mk('9', 'later'), mk('close', 'later'),
  ],
}

const IDLE: SyncState = { kind: 'idle', lastPulledAt: null }

function mount() {
  return render(
    <Sidebar
      status={STATUS} area="closing" viewedStageId={undefined} currentDocs={null} syncState={IDLE}
      consoleOpen={false} onToggleConsole={() => {}} onNavigate={() => {}}
    />,
  )
}

const declare = (el: Element, name: string, value: number) => Object.defineProperty(el, name, { value, configurable: true })

afterEach(cleanup)

describe('Sidebar: the stage list says when there is more below', () => {
  it('carries no fade while nothing overflows, grows one when the list can scroll further, and drops it at the end', async () => {
    mount()
    const nav = screen.getByRole('navigation', { name: 'Project' })
    // The fade is a mask on the nav itself, switched by the data attribute: no element is added
    // (the a11y spec counts asides and inputs; the static sidebar test reads the markup shape).
    expect(nav.className).toContain('overflow-y-auto')
    expect(nav.className).toContain('data-[more-below]:[mask-image:linear-gradient(to_bottom,black_calc(100%_-_20px),transparent)]')
    // jsdom lays nothing out, so nothing overflows: no fade — it is read, never assumed.
    expect(nav.hasAttribute('data-more-below')).toBe(false)

    // A list taller than its box (declared, since jsdom cannot lay one out) grows the fade.
    declare(nav, 'scrollHeight', 900)
    declare(nav, 'clientHeight', 400)
    fireEvent.scroll(nav)
    await waitFor(() => expect(nav.hasAttribute('data-more-below')).toBe(true))

    // Scrolled to the end: the fade goes, because there is nothing more to hint at.
    declare(nav, 'scrollTop', 500)
    fireEvent.scroll(nav)
    await waitFor(() => expect(nav.hasAttribute('data-more-below')).toBe(false))

    // Back up a little: it returns.
    declare(nav, 'scrollTop', 120)
    fireEvent.scroll(nav)
    await waitFor(() => expect(nav.hasAttribute('data-more-below')).toBe(true))
  })

  it('changes nothing else about the shell: one aside, one aria-current, no input, Build Loop\'s screens still beneath it', () => {
    const { container } = mount()
    const asides = container.querySelectorAll('aside')
    expect(asides).toHaveLength(1)
    expect(asides[0].className).toContain('bg-slate-50')
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(container.querySelectorAll('input')).toHaveLength(0)
    for (const label of ['Board', 'Sprint', 'How it is going', 'Closing', 'Documents']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Closing' }).getAttribute('aria-current')).toBe('page')
  })
})
