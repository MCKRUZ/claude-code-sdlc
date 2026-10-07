// @vitest-environment jsdom
/** The slate's slot pickers (togo-command-center.md §3.2, §5): roster filtered by role, the
 * no-self-check rule shown LIVE as a note (the plugin refuses; the picker never does), the Security
 * signer always disabled with its reason, and the capability reason without `assign-roles`. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newerPlugin, SECURITY_SIGNER } from '../shared/reasons'
import { COMPACT_SELECT_CLASS, COMPACT_SLOT_CLASS, PLACEHOLDER, RolePicker, SELF_CHECK_NOTE } from '../src/components/planning/RolePicker'

const PEOPLE = [
  { handle: '@sam-k', name: 'Sam K', roles: ['owner', 'developer'] },
  { handle: '@lee-w', name: 'Lee W', roles: ['developer', 'checker'] },
  { handle: '@priya-n', name: 'Priya N', roles: ['checker', 'security'] },
]

afterEach(cleanup)

describe('RolePicker', () => {
  /** v13 fixer round: on a slate row the select never takes its natural width — "Sam Kowalski
   * (@sam-k)" grew to ≈ 190 px and took the name's track. v14: a FIXED 11 rem then cut that value
   * with no cue ("Sam Kowalski (@sam-k"), so the compact select fills a `flex-1` slot over a 0
   * basis (two share a line as `minmax(0,1fr)` each), never under 10 rem, ellipsises, and
   * carries the full value in its title; the slate pins the slot's inline width through
   * `className`. Off the slate the select keeps the kit's natural width. */
  it('compact: the slot is flex-1 over a 0 basis, the select fills it ≥ 10 rem and ellipsises with the full value in its title; otherwise natural width', () => {
    render(<RolePicker role="developer" spec="0001" value="@sam-k" people={PEOPLE} compact className="slot-extra" onChange={vi.fn()} />)
    const compact = screen.getByLabelText('Builder for 0001') as HTMLSelectElement
    expect(compact.className).toContain(COMPACT_SELECT_CLASS)
    expect(COMPACT_SELECT_CLASS).toContain('w-full')
    expect(COMPACT_SELECT_CLASS).toContain('min-w-[10rem]')
    expect(COMPACT_SELECT_CLASS).toContain('truncate')
    expect(compact.className).not.toContain('w-44')
    expect(compact.getAttribute('title')).toBe('Sam K (@sam-k)')
    const slot = compact.closest('[data-slot]') as HTMLElement
    expect(slot.className).toContain(COMPACT_SLOT_CLASS)
    expect(COMPACT_SLOT_CLASS).toContain('flex-1')
    expect(COMPACT_SLOT_CLASS).toContain('basis-0')
    expect(COMPACT_SLOT_CLASS).toContain('min-w-0')
    expect(slot.className).toContain('slot-extra')
    expect(document.querySelector('label[for]')?.className).toContain('sr-only')
    cleanup()
    // Nobody chosen: the title is the invitation the select shows, whole.
    render(<RolePicker role="developer" spec="0001" value="" people={PEOPLE} compact onChange={vi.fn()} />)
    expect((screen.getByLabelText('Builder for 0001') as HTMLSelectElement).getAttribute('title')).toBe(PLACEHOLDER.developer)
    cleanup()
    render(<RolePicker role="developer" spec="0001" value="" people={PEOPLE} onChange={vi.fn()} />)
    const natural = screen.getByLabelText('Builder for 0001') as HTMLSelectElement
    expect(natural.className).not.toContain('truncate')
    expect(natural.className).not.toContain('w-full')
    expect(natural.closest('[data-slot]')?.className).not.toContain('flex-1')
  })

  it('lists only the roster people holding the role, the invitation first (never "nobody" as a value), and yields the handle', () => {
    const onChange = vi.fn()
    render(<RolePicker role="checker" spec="0003" value="" people={PEOPLE} onChange={onChange} />)
    const select = screen.getByLabelText('Checker for 0003') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', '@lee-w', '@priya-n'])
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([PLACEHOLDER.checker, 'Lee W (@lee-w)', 'Priya N (@priya-n)'])
    expect(PLACEHOLDER.checker).toBe('choose a checker')
    expect(PLACEHOLDER.developer).toBe('choose a builder')
    expect(select.hasAttribute('data-write')).toBe(true)
    fireEvent.change(select, { target: { value: '@priya-n' } })
    expect(onChange).toHaveBeenCalledWith('@priya-n')
  })

  it('a checker who is the builder gets the live note — the control stays enabled for the plugin to refuse', () => {
    render(<RolePicker role="checker" spec="0003" value="@lee-w" developer="@Lee-W" people={PEOPLE} onChange={vi.fn()} />)
    expect(screen.getByText(SELF_CHECK_NOTE)).toBeTruthy()
    expect((screen.getByLabelText('Checker for 0003') as HTMLSelectElement).disabled).toBe(false)
  })

  it('a handle on the row that the roster filter does not list stays selectable as itself — never a blank', () => {
    render(<RolePicker role="developer" spec="0003" value="@gone" people={PEOPLE} onChange={vi.fn()} />)
    const select = screen.getByLabelText('Builder for 0003') as HTMLSelectElement
    expect(select.value).toBe('@gone')
    expect(screen.queryByText(SELF_CHECK_NOTE)).toBeNull()
  })

  it('the Security signer slot is always disabled with the §2.7 reason', () => {
    render(<RolePicker role="security" spec="0003" value="" people={PEOPLE} onChange={vi.fn()} />)
    const select = screen.getByLabelText('Security signer for 0003') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.getAttribute('title')).toBe(SECURITY_SIGNER)
    // The reason is VISIBLE under the slot, not only in the tooltip, and the empty option says
    // there is no field rather than naming "nobody".
    const reasons = screen.getAllByText(SECURITY_SIGNER)
    expect(reasons.some((el) => el.hasAttribute('data-slot-reason') && !el.className.includes('sr-only'))).toBe(true)
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([PLACEHOLDER.security])
  })

  it('compact hides the visible label but keeps the accessible name', () => {
    render(<RolePicker role="developer" spec="0003" value="" people={PEOPLE} compact onChange={vi.fn()} />)
    expect(screen.getByLabelText('Builder for 0003')).toBeTruthy()
    expect(screen.getByText('Builder').className).toContain('sr-only')
  })

  it('without assign-roles the picker is disabled and names the capability', () => {
    render(<RolePicker role="developer" spec="0003" value="" people={PEOPLE} canAssign={false} onChange={vi.fn()} />)
    const select = screen.getByLabelText('Builder for 0003') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.getAttribute('title')).toBe(newerPlugin('assign-roles'))
  })
})
