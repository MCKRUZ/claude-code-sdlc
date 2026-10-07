// The nine stations (studio-observatory.md §5.1 "Geometry" / "Materials"): a torus ring, a core
// disc and an additive glow sprite each; the Build station is a torus knot because Build is a
// loop. The ring's STATE is a shape (`RingMaterial`: filled / hollow / breathing / dashed) chosen
// by `station.kind` — which came from `nodeKind()` and is never re-derived here. Radius is the
// same for every station: no fact in the data is a size.
//
// Animation values live in `anim` (plain objects GSAP can tween, owned by SpineScene) and are
// applied in `useFrame`, which under `frameloop="demand"` only runs when something invalidated.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, CircleGeometry, Color, Group, SpriteMaterial, TorusGeometry, TorusKnotGeometry } from 'three'
import type { Sprite, Vector3 } from 'three'
import { getGlowTexture } from '../core/glowTexture'
import { RingMaterial } from '../core/materials/RingMaterial'
import type { Station } from '../core/types'
import type { NodeKind } from '../../../shared/nav'
import { KNOT_RADIUS, KNOT_TUBE, RING_RADIUS, RING_TUBE } from './spineModel'

/** One number per station, tweened by the scene and read here each demand frame. */
export interface StationAnim {
  /** Pop-in scale, 0 → 1 on first open. */
  scales: { v: number }[]
  /** Halo (glow sprite) opacity. */
  halos: { v: number }[]
  /** The current station's breathing, 0…1, fed to `uPulse`. */
  pulse: { v: number }
}

export function makeStationAnim(n: number, popped: boolean): StationAnim {
  return {
    scales: Array.from({ length: n }, () => ({ v: popped ? 1 : 0 })),
    halos: Array.from({ length: n }, () => ({ v: 0 })),
    pulse: { v: 1 },
  }
}

/** Resting halo opacity by state; `current` is a lamp at .55 so a still frame shows where "now"
 * is without flaring, hover lifts every kind. */
export const HALO_REST: Record<NodeKind, number> = { current: 0.55, signed: 0.2, completed: 0.12, later: 0.06 }
export const HALO_HOVER: Record<NodeKind, number> = { current: 0.8, signed: 0.5, completed: 0.42, later: 0.34 }
/** Halo sprite size by state: the current station's glow is the largest thing on the rail but
 * reads as a lamp, not a blob; the others carry a small glow that grows under hover. */
export const HALO_SIZE_BY_KIND: Record<NodeKind, number> = { current: 1.8, signed: 1.1, completed: 1.0, later: 0.9 }

export interface StationColors {
  signed: Color
  current: Color
  later: Color
}

export interface SpineStationsProps {
  stations: Station[]
  points: Vector3[]
  colors: StationColors
  anim: StationAnim
}

/** Stations are the subject, the rail the ruler: the ring is wider than the rail is thick. The
 * radii live in `spineModel` so the plate layout measures the same disc the mesh draws. */
export const HALO_SIZE = 1.1
const scratchScale = { v: 1 }

function colorFor(kind: NodeKind, colors: StationColors): Color {
  if (kind === 'current') return colors.current
  if (kind === 'later') return colors.later
  // `completed` reuses the signed hue on purpose: the cue is the hollow core, not a colour.
  return colors.signed
}

export function SpineStations({ stations, points, colors, anim }: SpineStationsProps) {
  const invalidate = useThree((s) => s.invalidate)

  const geometry = useMemo(
    () => ({
      ring: new TorusGeometry(RING_RADIUS, RING_TUBE, 12, 48),
      core: new CircleGeometry(0.19, 32),
      knot: new TorusKnotGeometry(KNOT_RADIUS, KNOT_TUBE, 64, 8, 2, 3),
    }),
    [],
  )
  useEffect(
    () => () => {
      geometry.ring.dispose()
      geometry.core.dispose()
      geometry.knot.dispose()
    },
    [geometry],
  )

  // One ring + core + sprite material per station; rebuilt when kinds or colours change.
  const kindsKey = stations.map((s) => s.kind).join(',')
  const materials = useMemo(
    () =>
      stations.map((s) => {
        const color = colorFor(s.kind, colors)
        return {
          ring: new RingMaterial(s.kind, color, false),
          core: new RingMaterial(s.kind, color, true),
          halo: new SpriteMaterial({
            map: getGlowTexture(),
            color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: AdditiveBlending,
          }),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kindsKey, colors, stations.length],
  )
  useEffect(() => {
    invalidate()
    return () => {
      for (const m of materials) {
        m.ring.dispose()
        m.core.dispose()
        m.halo.dispose() // the glow texture is shared and never disposed
      }
    }
  }, [materials, invalidate])

  const groups = useMemo(() => stations.map(() => new Group()), [stations])

  useFrame(() => {
    for (let i = 0; i < stations.length; i++) {
      const g = groups[i]
      if (!g) continue
      const s = anim.scales[i]?.v ?? 1
      g.scale.setScalar(Math.max(0.0001, s))
      const m = materials[i]
      if (!m) continue
      const v = anim.halos[i]?.v ?? 0
      const isCurrent = stations[i].isCurrent
      // The current station's halo breathes WITH its core (same pulse value), so the lamp and the
      // disc are one gesture rather than two rhythms. Other kinds hold their tweened opacity.
      m.halo.opacity = isCurrent ? v * (0.8 + 0.2 * anim.pulse.v) : v
      // The glow also swells with its opacity, so a hover is a visible change on the station
      // itself and not only on its plate.
      scratchScale.v = HALO_SIZE_BY_KIND[stations[i].kind] * (0.85 + 0.45 * v)
      if (isCurrent) scratchScale.v *= 0.95 + 0.05 * anim.pulse.v
      const sprite = g.children.find((c) => (c as Sprite).isSprite)
      if (sprite) sprite.scale.set(scratchScale.v, scratchScale.v, 1)
      if (isCurrent) m.core.setPulse(anim.pulse.v)
    }
  })

  return (
    <>
      {stations.map((station, i) => {
        const p = points[i]
        const m = materials[i]
        if (!p || !m) return null
        return (
          <primitive key={station.id} object={groups[i]} position={[p.x, p.y, p.z]}>
            {station.isBuild ? (
              <mesh geometry={geometry.knot} material={m.ring} />
            ) : (
              <mesh geometry={geometry.ring} material={m.ring} />
            )}
            <mesh geometry={geometry.core} material={m.core} />
            <sprite material={m.halo} scale={[HALO_SIZE, HALO_SIZE, 1]} />
          </primitive>
        )
      })}
    </>
  )
}
