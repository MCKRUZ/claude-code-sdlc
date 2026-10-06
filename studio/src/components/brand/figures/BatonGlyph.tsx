// The baton (togo-command-center-visual.md §4, §7): the hand-off marker that sits on the
// Building→Checking lane edge and is the one thing allowed to POP (≤ 24 px, `back.out(1.4)`) —
// after the plugin returned 0 AND the refreshed read arrived, never before. A lit body with two
// quiet grip bands; `aria-hidden`, because the open hand-off's text ("0006 → Sam · 2 business
// days") beside it is the content. `data-baton` is the hook `batonPass` (#30) moves.
import { BATON_SHAPES, BATON_VIEWBOX } from './ccFigureGeometry'
import { renderShape } from './figureShapes'
import { cn } from '../../../ui/cn'

export interface BatonGlyphProps {
  /** Rendered size in px; 24 is the lane-edge size, 16 fits inside a chip. Never above 24. */
  size?: 16 | 18 | 20 | 24
  className?: string
}

export const BATON_MAX_PX = 24

export function BatonGlyph({ size = 24, className }: BatonGlyphProps) {
  const { width, height } = BATON_VIEWBOX
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-baton=""
      className={cn('shrink-0', className)}
    >
      {BATON_SHAPES.map(renderShape)}
    </svg>
  )
}
