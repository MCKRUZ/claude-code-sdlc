// The command center's five empty-state figures (togo-command-center-visual.md §6), in the
// product's own vocabulary — lane wells, the sprint-title bar, the "you" ring, a sealed ledger
// page, the decision clock, the next-up slot. Flat, two-tone from the accent ramp, no `<text>`,
// no digit, `aria-hidden`: the plugin's sentence beside the figure is the content. Literal
// geometry (`ccFigureGeometry.ts`) so a re-render is byte-identical.
//
// Standalone or in the workflow: the figure takes no data — a screen chooses the name from the
// plugin's own empty signal (`has_data:false`, an empty `needsYou[]`, `tracked:0`, `exists:false`,
// an empty `candidates`) and never from a count it derived.
import { CC_EMPTY_FIGURES, CC_FIGURE_VIEWBOX, type CcEmptyFigureName } from './ccFigureGeometry'
import { renderShape } from './figureShapes'
import { cn } from '../../../ui/cn'

export interface CcEmptyFigureProps {
  figure: CcEmptyFigureName
  className?: string
}

export function CcEmptyFigure({ figure, className }: CcEmptyFigureProps) {
  const { width, height } = CC_FIGURE_VIEWBOX
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      data-cc-figure={figure}
      className={cn('shrink-0', className)}
    >
      {CC_EMPTY_FIGURES[figure].map(renderShape)}
    </svg>
  )
}
