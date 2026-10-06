// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, Notice, NoData, Eyebrow, EmptyState } from '../../src/ui'

describe('Notice', () => {
  it('warn classes contain the word amber and the role is status', () => {
    render(<Notice tone="warn" data-testid="plugin-behind">Plugin is behind</Notice>)
    const el = screen.getByTestId('plugin-behind')
    expect(el.className).toContain('amber')
    expect(el.getAttribute('role')).toBe('status')
  })

  it('error defaults to role="alert"; role="none" removes the role', () => {
    render(<Notice tone="error" title="Could not reach the plugin">detail</Notice>)
    expect(screen.getByRole('alert').textContent).toContain('Could not reach the plugin')
    render(<Notice tone="error" role="none" data-testid="quiet">x</Notice>)
    expect(screen.getByTestId('quiet').hasAttribute('role')).toBe(false)
  })

  it('renders actions beside the text', () => {
    render(<Notice tone="info" actions={<button type="button">Retry</button>}>body</Notice>)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})

describe('NoData', () => {
  it('renders the literal words "no data" plus the producing sentence and no digits', () => {
    render(<NoData what="Merge a spec to start the accepted-as-is line." data-testid="nd" />)
    const el = screen.getByTestId('nd')
    expect(el.textContent).toContain('no data')
    expect(el.textContent).toContain('Merge a spec to start the accepted-as-is line.')
    expect(el.textContent).not.toMatch(/\d/)
  })
})

describe('Card', () => {
  it('passes data-flip-id through and honours `as`', () => {
    render(<Card as="section" data-flip-id="card-1" data-testid="c">body</Card>)
    const el = screen.getByTestId('c')
    expect(el.tagName).toBe('SECTION')
    expect(el.getAttribute('data-flip-id')).toBe('card-1')
  })

  it('renders header and footer slots around the body', () => {
    render(<Card header="Head" footer="Foot">Body</Card>)
    expect(screen.getByText('Head')).toBeTruthy()
    expect(screen.getByText('Foot')).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
  })
})

describe('Eyebrow + EmptyState', () => {
  it('Eyebrow is a heading when asked', () => {
    render(<Eyebrow as="h3">Section</Eyebrow>)
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Section')
  })

  it('EmptyState renders the sentence verbatim with an optional action', () => {
    render(<EmptyState title="Nothing is currently in progress." body="Open the Board to start." action={<button type="button">Open the Board</button>} />)
    expect(screen.getByText('Nothing is currently in progress.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open the Board' })).toBeTruthy()
  })
})
