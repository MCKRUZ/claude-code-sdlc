// The static twins under `public/brand/cc/*.svg`, serialised from the SAME geometry the React
// figures draw (`ccFigureGeometry.ts`), in the light-theme hex (`CC_STATIC_HEX`) because a file
// cannot read a token. Pure strings, no React, so a node test can regenerate every file and
// compare it byte for byte with what ships — the files are never hand-edited. A scratch script
// writes them; `test/ccBrandAssets.test.ts` proves they are current.
import {
  BATON_SHAPES, BATON_VIEWBOX, CC_EMPTY_FIGURES, CC_FIGURE_VIEWBOX, CC_STATIC_HEX, LANE_GLYPH_VIEWBOX, LANE_GLYPHS,
  PERSON_RING_GAP_PX, PERSON_RING_PX, PERSON_RING_WIDTH_PX,
  type CcEmptyFigureName, type FigureShape, type LaneGlyphName,
} from './ccFigureGeometry'

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"'

function shapeToSvg(shape: FigureShape): string {
  const hex = CC_STATIC_HEX[shape.tone]
  switch (shape.kind) {
    case 'rect':
      return `  <rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx}" fill="${hex}"/>`
    case 'circle':
      if (shape.stroke) {
        const dash = shape.dash ? ` stroke-dasharray="${shape.dash}"` : ''
        return `  <circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="none" stroke="${hex}" stroke-width="${shape.stroke}"${dash}/>`
      }
      return `  <circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${hex}"/>`
    case 'path':
      if (shape.stroke) return `  <path d="${shape.d}" fill="none" stroke="${hex}" stroke-width="${shape.stroke}" stroke-linecap="round"/>`
      return `  <path d="${shape.d}" fill="${hex}"/>`
  }
}

function document(viewBox: { width: number; height: number }, comment: string, body: string[]): string {
  return [
    `<svg ${XMLNS} viewBox="0 0 ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}" aria-hidden="true">`,
    `  <!-- ${comment} Generated from studio/src/components/brand/figures/ccFigureGeometry.ts; do not hand-edit. -->`,
    ...body,
    '</svg>',
    '',
  ].join('\n')
}

export function emptyFigureSvg(name: CcEmptyFigureName): string {
  return document(CC_FIGURE_VIEWBOX, `Tōgō command center — empty state "${name}". Two tones from the accent ramp.`, CC_EMPTY_FIGURES[name].map(shapeToSvg))
}

export function batonSvg(): string {
  return document(BATON_VIEWBOX, 'Tōgō command center — the baton.', BATON_SHAPES.map(shapeToSvg))
}

export function laneGlyphSvg(lane: LaneGlyphName): string {
  const body = LANE_GLYPHS[lane].map((part) => {
    if (part.fill) return `  <path d="${part.d}" fill="${CC_STATIC_HEX.glyph}"/>`
    const dash = part.dash ? ` stroke-dasharray="${part.dash}"` : ''
    return `  <path d="${part.d}" fill="none" stroke="${CC_STATIC_HEX.glyph}" stroke-width="${part.stroke}"${dash} stroke-linecap="round"/>`
  })
  return document(LANE_GLYPH_VIEWBOX, `Tōgō command center — lane glyph "${lane}" (currentColor in the app).`, body)
}

/** The ring style at 20 px, light values: `surface-2` disc, a `surface-1` gap, the `you-ring`. */
export function roomRingSvg(): string {
  const r = PERSON_RING_PX / 2
  const size = PERSON_RING_PX + 2 * (PERSON_RING_GAP_PX + PERSON_RING_WIDTH_PX)
  const c = size / 2
  return document(
    { width: size, height: size },
    'Tōgō command center — the "In the room" ring: initials disc, 2 px gap, 2 px you-ring.',
    [
      `  <circle cx="${c}" cy="${c}" r="${r + PERSON_RING_GAP_PX + PERSON_RING_WIDTH_PX / 2}" fill="none" stroke="${CC_STATIC_HEX.glyph}" stroke-width="${PERSON_RING_WIDTH_PX}"/>`,
      `  <circle cx="${c}" cy="${c}" r="${r + PERSON_RING_GAP_PX}" fill="#FFFFFF"/>`,
      `  <circle cx="${c}" cy="${c}" r="${r}" fill="#F1F5F9"/>`,
    ],
  )
}

/** The steering-mode lockup: the one Depth gradient (brand §2 construction, light stops) at
 * 48 px beside the wordmark and the eyebrow. Text is allowed here — it is a lockup, not a figure. */
export function steeringLockupSvg(): string {
  return [
    `<svg ${XMLNS} viewBox="0 0 320 64" width="320" height="64" role="img" aria-label="Tōgō — Steering">`,
    '  <!-- Tōgō command center — steering-mode title lockup, Depth. One user-space gradient, bar top-left (17, 9) → disc bottom-right (47, 56), light pair #6FD1D4 → #0A3F47; the app draws it inline so the stops follow the theme. Generated from studio/src/components/brand/figures/ccStaticSvg.ts; do not hand-edit. -->',
    '  <defs>',
    '    <linearGradient id="depth" gradientUnits="userSpaceOnUse" x1="17" y1="9" x2="47" y2="56">',
    '      <stop offset="0" stop-color="#6FD1D4"/>',
    '      <stop offset="1" stop-color="#0A3F47"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <g transform="translate(0 8) scale(0.75)">',
    '    <rect x="17" y="9" width="30" height="7" rx="3.5" fill="url(#depth)"/>',
    '    <circle cx="32" cy="38.5" r="17.5" fill="url(#depth)"/>',
    '  </g>',
    '  <text x="64" y="36" font-family="Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif" font-weight="650" font-size="22" letter-spacing="-0.33" fill="#0B1120">Tōgō</text>',
    '  <text x="64" y="52" font-family="Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif" font-weight="600" font-size="11" letter-spacing="0.88" fill="#5D6C84">STEERING</text>',
    '</svg>',
    '',
  ].join('\n')
}

/** File name → content, the whole folder. */
export function ccStaticAssets(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of Object.keys(CC_EMPTY_FIGURES) as CcEmptyFigureName[]) out[`empty-${name}.svg`] = emptyFigureSvg(name)
  out['baton.svg'] = batonSvg()
  for (const lane of Object.keys(LANE_GLYPHS) as LaneGlyphName[]) out[`lane-${lane}.svg`] = laneGlyphSvg(lane)
  out['room-ring.svg'] = roomRingSvg()
  out['steering-lockup-depth.svg'] = steeringLockupSvg()
  return out
}
