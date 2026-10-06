// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type React from 'react'
import { DataTable, DefinitionList, ProgressBar, StatTile, Skeleton, Chip, Badge, StatusDot } from '../../src/ui'

type Row = { id: string; title: string }
const ROWS: Row[] = [
  { id: '0001', title: 'Duplicate claim 409' },
  { id: '0002', title: 'Retry budget' },
]

describe('DataTable', () => {
  it('is a real table: scope="col" headers, rowProps reach the <tr>, details rows are kept', () => {
    render(
      <DataTable<Row>
        label="Slate"
        columns={[
          { id: 'id', header: 'Id', cell: (r) => r.id, mono: true },
          { id: 'title', header: 'Title', cell: (r) => r.title },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
        // `data-*` keys are not in HTMLAttributes as an object type (TS admits them only in JSX
        // literals), so a caller casts — a contract note for `rowProps`, not a kit defect.
        rowProps={(r) => ({ 'data-testid': 'sprint-slate-row', 'data-spec': r.id }) as React.HTMLAttributes<HTMLTableRowElement>}
        renderDetails={(r) => <details open><summary>DoR {r.id}</summary></details>}
      />,
    )
    const table = screen.getByRole('table', { name: 'Slate' })
    expect(Array.from(table.querySelectorAll('th')).every((th) => th.getAttribute('scope') === 'col')).toBe(true)
    const rows = screen.getAllByTestId('sprint-slate-row')
    expect(rows.map((r) => r.getAttribute('data-spec'))).toEqual(['0001', '0002'])
    expect(table.querySelectorAll('details[open]').length).toBe(2)
  })

  it('renders the caller sentence, never a count, when empty', () => {
    render(<DataTable<Row> columns={[{ id: 'id', header: 'Id', cell: (r) => r.id }]} rows={[]} rowKey={(r) => r.id} empty="No specs are slated yet." />)
    expect(screen.getByText('No specs are slated yet.')).toBeTruthy()
  })
})

describe('DefinitionList', () => {
  it('uses dl/dt/dd', () => {
    render(<DefinitionList items={[{ term: 'Risk', detail: 'HIGH' }]} columns={2} />)
    expect(screen.getByText('Risk').tagName).toBe('DT')
    expect(screen.getByText('HIGH').tagName).toBe('DD')
  })
})

describe('ProgressBar + StatTile', () => {
  it('ProgressBar reads "3 of 9 stages done" and null is a hairline with no fill and no value', () => {
    const { rerender } = render(<ProgressBar value={3} max={9} label="stages done" />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuetext')).toBe('3 of 9 stages done')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.querySelector('span')).toBeTruthy()
    rerender(<ProgressBar value={null} max={9} label="stages done" />)
    expect(bar.hasAttribute('aria-valuenow')).toBe(false)
    expect(bar.getAttribute('aria-valuetext')).toContain('no data')
    expect(bar.querySelector('span')).toBeNull()
  })

  it('StatTile shows NoData for null (never a 0) and the number plus unit otherwise', () => {
    const { rerender } = render(<StatTile id="accepted" label="Accepted as-is" value={null} hint="Share of PRs merged without rework." noDataWhat="Merge a spec to start this line." />)
    const tile = screen.getByText('Accepted as-is').parentElement!
    expect(tile.textContent).toContain('no data')
    expect(tile.textContent).toContain('Merge a spec to start this line.')
    expect(tile.textContent).not.toMatch(/\b0\b/)
    rerender(<StatTile id="accepted" label="Accepted as-is" value={72} unit="%" previous={60} hint="Share." />)
    expect(screen.getByText('72').getAttribute('data-previous')).toBe('60')
    expect(screen.getByText('%')).toBeTruthy()
  })
})

describe('Skeleton, Chip, Badge, StatusDot', () => {
  it('Skeleton is aria-hidden beside the kept status text', () => {
    render(
      <div aria-busy="true">
        <p role="status">Reading the sprint…</p>
        <Skeleton.Rows rows={3} data-testid="sk" />
      </div>,
    )
    expect(screen.getByRole('status').textContent).toBe('Reading the sprint…')
    const sk = screen.getByTestId('sk')
    expect(sk.getAttribute('aria-hidden')).toBe('true')
    expect(sk.children.length).toBe(3)
  })

  it('Chip as="button" keeps rounded-full and renders a dot beside the text; Badge always renders text', () => {
    render(<Chip as="button" tone="ok" dot>ready</Chip>)
    const chip = screen.getByRole('button', { name: 'ready' })
    expect(chip.className).toContain('rounded-full')
    expect(chip.querySelector('[aria-hidden]')).toBeTruthy()
    render(<Badge kind="locked">Locked</Badge>)
    expect(screen.getByText('Locked').textContent).toBe('Locked')
  })

  it('StatusDot is aria-hidden and carries its status', () => {
    render(<StatusDot status="running" pulse data-testid="dot" />)
    const dot = screen.getByTestId('dot')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(dot.getAttribute('data-status')).toBe('running')
  })
})
