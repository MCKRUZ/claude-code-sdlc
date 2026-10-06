// The one lighting rig every scene shares (studio-observatory.md §5.0 `lights.tsx`): a hemisphere
// light coloured from the surface tokens so the scene sits on the page's own palette, plus a
// single directional key. No shadows anywhere — they cost a render pass and carry no meaning.
// Dark swaps the sky / ground colours and lowers the intensity so bodies glow rather than glare.
import { useThemeAttr, useThemeColors } from './useThemeColors'

const TOKENS = ['surface-0', 'surface-3'] as const

export function SceneLights() {
  const colors = useThemeColors(TOKENS)
  const dark = useThemeAttr() === 'dark'
  const sky = dark ? colors['surface-3'] : colors['surface-0']
  const ground = dark ? colors['surface-0'] : colors['surface-3']
  return (
    <>
      <hemisphereLight args={[sky, ground, dark ? 0.6 : 0.9]} />
      <directionalLight position={[4, 6, 5]} intensity={dark ? 0.5 : 0.55} />
    </>
  )
}
