// Lane-header glyphs (togo-command-center-visual.md §4, §6): the Spine's station vocabulary
// applied to the loop. Ready = a dashed ring (can be picked up), Building = a half-filled disc
// (in progress), Checking = a ring carrying the seam (under verdict), Merged = a filled disc.
// `currentColor` only — the cue is SHAPE, never colour, so no lane gets a hue of its own (§8.5).
// `aria-hidden`: the eyebrow label beside it names the lane.
import { LANE_GLYPH_VIEWBOX, LANE_GLYPHS, type LaneGlyphName } from './ccFigureGeometry'
import { cn } from '../../../ui/cn'

export interface LaneGlyphProps {
  lane: LaneGlyphName
  /** 18 in a lane header (§5 sizes); 16 beside inline text. */
  size?: 16 | 18
  className?: string
}

export function LaneGlyph({ lane, size = 18, className }: LaneGlyphProps) {
  const { width, height } = LANE_GLYPH_VIEWBOX
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-lane-glyph={lane}
      className={cn('shrink-0', className)}
    >
      {LANE_GLYPHS[lane].map((part, index) =>
        part.fill ? (
          <path key={index} d={part.d} fill="currentColor" />
        ) : (
          <path
            key={index}
            d={part.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={part.stroke}
            strokeDasharray={part.dash}
            strokeLinecap="round"
          />
        ),
      )}
    </svg>
  )
}
