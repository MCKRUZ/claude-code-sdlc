// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field, Input, Select, Textarea } from '../../src/ui'

describe('Field + Input / Textarea / Select', () => {
  it('associates label, hint and error through ids and marks the control invalid', () => {
    render(
      <Field label="Project name" hint="Letters and dashes." error="Already exists">
        <Input defaultValue="x" />
      </Field>,
    )
    const input = screen.getByLabelText('Project name') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const described = input.getAttribute('aria-describedby')!.split(' ')
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(['Already exists', 'Letters and dashes.'])
    expect(screen.getByRole('alert').textContent).toBe('Already exists')
  })

  it('a caller id wins (the project-name input keeps id="new-project-name") and no outline-none is emitted', () => {
    render(
      <Field label="Name" id="new-project-name">
        <Input placeholder="Search" />
      </Field>,
    )
    const input = screen.getByLabelText('Name')
    expect(input.id).toBe('new-project-name')
    expect(input.className).not.toContain('outline-none')
  })

  it('a disabled input renders its reason; Textarea does too', () => {
    render(
      <>
        <Input aria-label="path" disabled disabledReason="read-only project" />
        <Textarea aria-label="notes" disabled disabledReason="locked" />
      </>,
    )
    expect(screen.getByLabelText('path').getAttribute('title')).toBe('read-only project')
    expect(screen.getByLabelText('notes').getAttribute('title')).toBe('locked')
    expect(screen.getByText('read-only project').className).toContain('sr-only')
  })

  it('Select yields the value and renders a roster as "Name (@handle)"', () => {
    const onChange = vi.fn()
    render(
      <Field label="Developer">
        <Select value="@sam-k" onChange={onChange} roster={[{ handle: '@sam-k', name: 'Sam K' }, { handle: '@priya-n', name: 'Priya N' }]} />
      </Field>,
    )
    const select = screen.getByLabelText('Developer') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Sam K (@sam-k)', 'Priya N (@priya-n)'])
    fireEvent.change(select, { target: { value: '@priya-n' } })
    expect(onChange).toHaveBeenCalledWith('@priya-n')
  })
})
