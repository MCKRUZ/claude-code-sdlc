// #17 DataTable: `<table>` semantics for the sprint slate, History versions and Settings lists.
// The sticky `<thead>` lives inside the table's own scroll box (not `<main>`), every header
// carries `scope="col"`, and `rowProps` is how the pinned `data-testid="sprint-slate-row"` and
// `data-spec` reach a `<tr>`. `renderDetails` adds a second row under each data row so the DoR
// `<details>` the sprint spec counts (`details[open]`) keeps its place in the table. No zebra:
// hairlines already separate rows, and stripes + hairlines + chips would be three systems.
// Headers are eyebrow-case so they read as column labels, not content.
import { forwardRef, type ForwardedRef } from 'react'
import type { DataTableProps } from './contract'
import { cn } from './cn'
import { EYEBROW_CLASS } from './Eyebrow'

function DataTableInner<Row>(
  { columns, rows, rowKey, rowProps, renderDetails, stickyHeader = true, dense = false, empty, label, className, ...rest }: DataTableProps<Row>,
  ref: ForwardedRef<HTMLTableElement>,
) {
  const cellPad = dense ? 'px-2.5 py-1.5' : 'px-3 py-2'
  return (
    <div className="overflow-auto rounded-xl border border-line-1 bg-surface-1">
      <table ref={ref} aria-label={label} className={cn('w-full border-collapse text-left text-xs text-ink-1', className)} {...rest}>
        <thead className={cn('bg-surface-1', EYEBROW_CLASS, stickyHeader && 'sticky top-0 z-10')}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn('border-b border-line-1 font-semibold whitespace-nowrap', cellPad, col.align === 'end' && 'text-right')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty !== undefined ? (
            <tr>
              <td colSpan={columns.length} className={cn('text-ink-3', cellPad)}>
                {empty}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const key = rowKey(row)
            const extra = rowProps?.(row) ?? {}
            const details = renderDetails?.(row)
            return [
              <tr
                key={key}
                // M8: a row that acts on click is pressable (attribute only; classes untouched).
                data-pressable={extra.onClick ? '' : undefined}
                {...extra}
                className={cn('border-b border-line-1 transition-colors duration-[120ms] last:border-b-0 hover:bg-surface-2', extra.className)}
              >
                {columns.map((col) => (
                  <td key={col.id} className={cn('align-baseline', cellPad, col.align === 'end' && 'text-right tabular-nums', col.mono && 'font-mono tabular-nums')}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>,
              details ? (
                <tr key={`${key}-details`} data-details-for={key} className="border-b border-line-1 last:border-b-0">
                  <td colSpan={columns.length} className={cn('bg-surface-2/40', cellPad)}>
                    {details}
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

export const DataTable = forwardRef(DataTableInner) as <Row>(
  props: DataTableProps<Row> & { ref?: ForwardedRef<HTMLTableElement> },
) => ReturnType<typeof DataTableInner>
