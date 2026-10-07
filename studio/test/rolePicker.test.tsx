// @vitest-environment jsdom
/** The slate's slot pickers (togo-command-center.md §3.2, §5): roster filtered by role, the
 * no-self-check rule shown LIVE as a note (the plugin refuses; the picker never does), the Security
 * signer always disabled with its reason, and the capability reason without `assign-roles`. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newerPlugin, SECURITY_SIGNER } from '../shared/reasons'
import { COMPACT_SELECT_CLASS, PLACEHOLDER, RolePicker, SELF_CHECK_NOTE } from '../src/components/planning/RolePicker'

const PEOPLE = [
  { handle: '@sam-k', name: 'Sam K', roles: ['owner', 'developer'] },
  { handle: '@lee-w', name: 'Lee W', roles: ['developer', 'checker'] },
  { handle: '@priya-n', name: 'Priya N', roles: ['checker', 'security'] },
]

afterEach(cleanup)

describe('RolePicker', () => {
  /** v13 fixer round: on a slate row the select is a FIXED 11 rem (`w-44`), never its natural
   * width — "Sam Kowalski (@sam-k)" grew to ≈ 190 px and took the name's track. Off the slate the
   * select keeps the kit's natural width. */
  it('compact: the select is a fixed w-44 with the label visually hidden; otherwise natural width', () => {
    render(<RolePicker role="developer" spec="0001" value="" people={PEOPLE} compact onChange={vi.fn()} />)
    const compact = screen.getByLabelText('Builder for 0001') as HTMLSelectElement
    expect(compact.className).toContain('w-44')
    expect(compact.className).toContain(COMPACT_SELECT_CLASS)
    expect(document.querySelector('label[for]')?.className).toContain('sr-only')
    cleanup()
    render(<RolePicker role="developer" spec="0001" value="" people={PEOPLE} onChange={vi.fn()} />)
    expect((screen.getByLabelText('Builder for 0001') as HTMLSelectElement).className).not.toContain('w-44')
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
