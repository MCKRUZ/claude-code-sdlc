// Mark A "Macron" — the Tōgō mark, inline (CSP: no remote assets, `img-src` never consulted).
// Geometry is copied from docs/brand/togo/mark-a-macron.svg on its 64-unit grid: a 30×7 bar
// (the macron) over a disc of radius 17.5. Both shapes are `currentColor` so a wrapper's
// `text-accent-600` colours it in either theme — the brand keeps accent-600 the same value in
// dark (brand §5), which is why the mark never needs a theme-aware variant.
//
// Minimums (brand): 24 px in-app (`h-6 w-6`), 40 px for a hero (`h-10 w-10`); 16 px only as the
// OS tile. Clear space is one bar height — 7/64 of the rendered size — on every side.
import type { SVGProps } from 'react'

/** The exact shapes, exported so a test or a scene caption can assert the geometry without
 * rendering React. Do not round these: the lockup's optical balance depends on them. */
export const MARK_GEOMETRY = {
  viewBox: '0 0 64 64',
  bar: { x: 17, y: 9, width: 30, height: 7, rx: 3.5 },
  disc: { cx: 32, cy: 38.5, r: 17.5 },
} as const

export interface TogoMarkProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'> {
  /** `draw` renders the disc as a strokable outline (`pathLength=100`, dash offset 100 = hidden)
   * with `fill-opacity="0"`, and tags both shapes with `data-mark-bar` / `data-mark-disc` so a
   * choreography can draw the mark in once. The resting mark is the default and has no hooks:
   * motion is evidence, and a static mark has nothing to prove. */
  draw?: boolean
}

/** The mark is always `aria-hidden`: the product's name is text beside it (a wordmark, an h1,
 * a visually-hidden prefix), never the picture. */
export function TogoMark({ draw = false, className, ...rest }: TogoMarkProps) {
  const { bar, disc } = MARK_GEOMETRY
  return (
    <svg viewBox={MARK_GEOMETRY.viewBox} aria-hidden="true" focusable="false" className={className} {...rest}>
      <rect
        {...(draw ? { 'data-mark-bar': '' } : {})}
        x={bar.x}
        y={bar.y}
        width={bar.width}
        height={bar.height}
        rx={bar.rx}
        fill="currentColor"
        // The bar grows from its own centre, so the macron widens over the disc rather than
        // sliding in from the left.
        style={draw ? { transformOrigin: '32px 12.5px' } : undefined}
      />
      {draw ? (
        <circle
          data-mark-disc=""
          cx={disc.cx}
          cy={disc.cy}
          r={disc.r}
          fill="currentColor"
          fillOpacity="0"
          stroke="currentColor"
          strokeWidth="2.5"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset="100"
        />
      ) : (
        <circle cx={disc.cx} cy={disc.cy} r={disc.r} fill="currentColor" />
      )}
    </svg>
  )
}
