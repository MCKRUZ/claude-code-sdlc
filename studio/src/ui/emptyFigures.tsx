// B6 — empty-state figures in the product's own vocabulary. Six inline SVGs, each ≤ 120×72, drawn
// in `line-2` hairlines with at most ONE `accent-400` dot; `aria-hidden` (the sentence beside the
// figure is the content), no `<text>`, no digit, and literal path data so a re-render is
// byte-identical. The vocabulary is the instrument's: a rail of stations, bodies on a tether, a
// page of rows, two speech hairlines, a prompt caret, two pages in register. The Scorecard gets
// none — a figure beside a measure would read as a chart of nothing.
import type { JSX } from 'react'
import type { EmptyStateFigure } from './contract'
import { cn } from './cn'

export const EMPTY_FIGURE_NAMES: readonly EmptyStateFigure[] = [
  'rail', 'constellation', 'page', 'conversation', 'prompt', 'aligned',
]

export interface EmptyFigureProps {
  figure: EmptyStateFigure
  className?: string
}

const HAIRLINE = 'fill-none stroke-line-2'
const DOT = 'fill-accent-400 stroke-none'

/** Shared stroke attributes: a hairline that stays 1 px at the figure's natural size. */
const stroke = { strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const FIGURES: Record<EmptyStateFigure, JSX.Element> = {
  // A rail with four hollow, dashed stations — nothing is current, so no dot.
  rail: (
    <g className={HAIRLINE} {...stroke}>
      <path d="M8 36 H112" />
      <circle cx="24" cy="36" r="6" strokeDasharray="2.5 2.5" />
      <circle cx="48" cy="36" r="6" strokeDasharray="2.5 2.5" />
      <circle cx="72" cy="36" r="6" strokeDasharray="2.5 2.5" />
      <circle cx="96" cy="36" r="6" strokeDasharray="2.5 2.5" />
    </g>
  ),
  // Three hollow bodies and one dashed tether between the first two.
  constellation: (
    <g className={HAIRLINE} {...stroke}>
      <circle cx="30" cy="44" r="9" />
      <circle cx="68" cy="22" r="7" />
      <circle cx="94" cy="50" r="5" />
      <path d="M37 38 L62 26" strokeDasharray="3 3" />
    </g>
  ),
  // A page of rows: the sheet, a heading rule, five body rows.
  page: (
    <g className={HAIRLINE} {...stroke}>
      <rect x="34" y="6" width="52" height="60" rx="3" />
      <path d="M42 18 H66" />
      <path d="M42 28 H78" />
      <path d="M42 36 H78" />
      <path d="M42 44 H74" />
      <path d="M42 52 H70" />
    </g>
  ),
  // Two speech hairlines, one from each side.
  conversation: (
    <g className={HAIRLINE} {...stroke}>
      <path d="M14 16 H66 a4 4 0 0 1 4 4 V30 a4 4 0 0 1 -4 4 H26 L18 40 V34 H14 a4 4 0 0 1 -4 -4 V20 a4 4 0 0 1 4 -4 Z" />
      <path d="M54 38 H106 a4 4 0 0 1 4 4 V52 a4 4 0 0 1 -4 4 H106 V62 L98 56 H54 a4 4 0 0 1 -4 -4 V42 a4 4 0 0 1 4 -4 Z" />
    </g>
  ),
  // A prompt caret and the one accent dot the figures allow, as its cursor.
  prompt: (
    <g>
      <g className={HAIRLINE} {...stroke}>
        <rect x="10" y="20" width="100" height="32" rx="6" />
        <path d="M24 30 L32 36 L24 42" />
      </g>
      <circle cx="42" cy="36" r="2" className={DOT} />
    </g>
  ),
  // Two pages in register: the back sheet offset by the same measure on both axes.
  aligned: (
    <g className={HAIRLINE} {...stroke}>
      <rect x="40" y="6" width="46" height="54" rx="3" strokeDasharray="3 3" />
      <rect x="34" y="12" width="46" height="54" rx="3" />
      <path d="M42 24 H64" />
      <path d="M42 34 H72" />
      <path d="M42 44 H72" />
      <path d="M42 54 H66" />
    </g>
  ),
}

export function EmptyFigure({ figure, className }: EmptyFigureProps) {
  return (
    <svg
      viewBox="0 0 120 72"
      width={120}
      height={72}
      aria-hidden="true"
      focusable="false"
      data-empty-figure={figure}
      className={cn('shrink-0', className)}
    >
      {FIGURES[figure]}
    </svg>
  )
}
