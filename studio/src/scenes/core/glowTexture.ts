// The only texture in the app (studio-observatory.md §5.0 `glowTexture`): a 64×64 radial
// falloff generated in memory. Additive sprites carrying it give a halo that reads as bloom
// without a post-processing pass — and because it is a `DataTexture`, nothing is fetched and the
// CSP's `img-src` is never involved. Generated once; every scene shares the instance.
import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three'

export const GLOW_SIZE = 64

let texture: DataTexture | null = null

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Alpha at normalised radius `r` (0 centre, 1 edge): `smoothstep(1, 0, r)^2.2`. Exported so a
 * test can pin the falloff without reading texels. */
export function glowAlpha(r: number): number {
  return Math.pow(smoothstep(1, 0, r), 2.2)
}

export function getGlowTexture(): DataTexture {
  if (texture) return texture
  const size = GLOW_SIZE
  const data = new Uint8Array(size * size * 4)
  const half = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const r = Math.sqrt(dx * dx + dy * dy)
      const i = (y * size + x) * 4
      // White everywhere; the sprite's colour comes from its material, only alpha is shaped.
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(glowAlpha(r) * 255)
    }
  }
  texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
