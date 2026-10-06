// The command center's figure set (togo-command-center-visual.md §6). Geometry once, drawn by
// React here and serialised to `public/brand/cc/*.svg` by `ccStaticSvg.ts`.
export {
  CC_EMPTY_FIGURE_NAMES, CC_FIGURE_VIEWBOX, CC_EMPTY_FIGURES, BATON_SHAPES, BATON_VIEWBOX, LANE_GLYPH_NAMES, LANE_GLYPHS,
  LANE_GLYPH_VIEWBOX, PERSON_RING_PX, PERSON_RING_GAP_PX, PERSON_RING_WIDTH_PX, CC_STATIC_HEX,
} from './ccFigureGeometry'
export type { CcEmptyFigureName, LaneGlyphName, FigureShape, FigureTone, GlyphPart } from './ccFigureGeometry'
export { FIGURE_FILL, FIGURE_STROKE, renderShape } from './figureShapes'
export { CcEmptyFigure, type CcEmptyFigureProps } from './CcEmptyFigure'
export { BatonGlyph, BATON_MAX_PX, type BatonGlyphProps } from './BatonGlyph'
export { LaneGlyph, type LaneGlyphProps } from './LaneGlyph'
export { SteeringLockup, STEERING_LOCKUP_LABEL, STEERING_MARK_PX, type SteeringLockupProps } from './SteeringLockup'
export { PersonRing, ringInitials, YOU_RING_SHADOW, LIT_RING_SHADOW, type PersonRingProps } from './PersonRing'
export { ccStaticAssets, emptyFigureSvg, batonSvg, laneGlyphSvg, roomRingSvg, steeringLockupSvg } from './ccStaticSvg'
