// The one lighting rig every scene shares (studio-observatory.md §5.0 `lights.tsx`; round 2 I2
// "lighting rig"): a three-point rig. A hemisphere light coloured from the surface tokens so the
// scene sits on the page's own palette; a WARM KEY from (4, 6, 5) that gives a sphere its lit
// face; a COOL RIM from (−5, 3, −4) behind and to the side — `accent-300` in dark, `ink-4` in
// light — that separates a body from the ground without a second hue per body. No shadows
// anywhere — they cost a render pass and carry no meaning. Dark lowers every intensity so bodies
// glow rather than glare. The Spine's materials are unlit shaders and never read these.
import { useThemeAttr, useThemeColors } from './useThemeColors'

const TOKENS = ['surface-0', 'surface-3', 'accent-300', 'ink-4'] as const

/** The rig's numbers, exported so a test can pin the positions and the rim's token per theme. */
export const KEY_POSITION: readonly [number, number, number] = [4, 6, 5]
export const RIM_POSITION: readonly [number, number, number] = [-5, 3, -4]
export const RIM_LIGHT = { light: { token: 'ink-4', intensity: 0.15 }, dark: { token: 'accent-300', intensity: 0.25 } } as const
export const KEY_INTENSITY = { light: 0.55, dark: 0.5 } as const
export const HEMI_INTENSITY = { light: 0.9, dark: 0.6 } as const

export function SceneLights() {
  const colors = useThemeColors(TOKENS)
  const theme = useThemeAttr()
  const dark = theme === 'dark'
  const sky = dark ? colors['surface-3'] : colors['surface-0']
  const ground = dark ? colors['surface-0'] : colors['surface-3']
  const rim = RIM_LIGHT[theme]
  return (
    <>
      <hemisphereLight args={[sky, ground, HEMI_INTENSITY[theme]]} />
      <directionalLight position={[...KEY_POSITION]} intensity={KEY_INTENSITY[theme]} />
      <directionalLight position={[...RIM_POSITION]} color={colors[rim.token]} intensity={rim.intensity} />
    </>
  )
}
