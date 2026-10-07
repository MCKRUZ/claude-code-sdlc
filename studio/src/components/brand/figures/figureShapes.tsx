// Draws `FigureShape`s from `ccFigureGeometry.ts` as React SVG. Two tones, both token classes
// from the one accent ramp, so the figure flips with the theme and no hex lives here: quiet =
// `accent-200` (#a7e6e7 light / #0f4a50 dark), lit = `accent-500` (#1a99a3 / #22a3ad). A hollow
// shape strokes in its tone and keeps `fill-none`. Nothing else may paint a figure.
import type { JSX } from 'react'
import type { FigureShape, FigureTone } from './ccFigureGeometry'

export const FIGURE_FILL: Record<FigureTone, string> = {
  quiet: 'fill-accent-200',
  lit: 'fill-accent-500',
}

export const FIGURE_STROKE: Record<FigureTone, string> = {
  quiet: 'fill-none stroke-accent-200',
  lit: 'fill-none stroke-accent-500',
}

/** One shape → one element. `key` is positional: the geometry is literal and never reorders. */
export function renderShape(shape: FigureShape, index: number): JSX.Element {
  switch (shape.kind) {
    case 'rect':
      return <rect key={index} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} className={FIGURE_FILL[shape.tone]} />
    case 'circle':
      if (shape.stroke) {
        return (
          <circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            strokeWidth={shape.stroke}
            strokeDasharray={shape.dash}
            className={FIGURE_STROKE[shape.tone]}
          />
        )
      }
      return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} className={FIGURE_FILL[shape.tone]} />
    case 'path':
      if (shape.stroke) {
        return <path key={index} d={shape.d} strokeWidth={shape.stroke} strokeLinecap="round" className={FIGURE_STROKE[shape.tone]} />
      }
      return <path key={index} d={shape.d} className={FIGURE_FILL[shape.tone]} />
  }
}
