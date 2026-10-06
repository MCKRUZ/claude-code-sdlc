// The Lifecycle Spine's R3F tree (studio-observatory.md §5.1). Mounted inside `CanvasHost` by
// `LifecycleSpine`; never imported by a screen. Rail (CatmullRom tube with `RailMaterial`),
// stations (`SpineStations`), the partial doc arc, group ticks, the ground grid, the plates and
// the lights — plus the first-open draw, the current station's three breaths, hover emphasis
// and the sign-off ceremony's `"spine"` beat. Every tween writes refs / uniforms and calls
// `invalidate()`; no React state changes per frame.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { MeshBasicMaterial } from 'three'
import { MOTION_EASES } from '../../motion/contract'
import { useStudioGSAP } from '../../motion/useStudioGSAP'
import { useSpineHover } from '../../stores/spineStore'
import { SceneLights } from '../core/lights'
import { RailMaterial } from '../core/materials/RailMaterial'
import { Plates } from '../core/Plates'
import type { SceneSlotProps } from '../core/types'
import { useDemandLoop, useMotionEnabled } from '../core/useDemandLoop'
import { useThemeAttr, useThemeColors } from '../core/useThemeColors'
import { GroundMaterial } from './GroundMaterial'
import { onSpineCeremony } from './spineCeremony'
import { buildArcGeometry, buildGroundGeometry, buildRail, buildTickGeometry, GROUND_Y, groupTicks, stationVectors, toArc } from './spineGeometry'
import { layoutSpineBands } from './spineBands'
import { docArcTheta, groupCaptions, LATER_RING_TOKEN, railProgress, stationU } from './spineModel'
import { useCaptionItems, useParallaxPointer, usePlateItems, useSpineCamera } from './spineSceneHooks'
import { HALO_HOVER, HALO_REST, makeStationAnim, SpineStations } from './SpineStations'

const TOKENS = ['stage-signed-fill', 'stage-current-fill', 'stage-later-fill', 'line-2', 'ink-3', 'ink-4'] as const
/** The ground grid: a hairline in light; in dark `line-2` on `surface-0` vanished, so it uses the
 * brighter `ink-4` and more alpha. Still a depth cue, never a scale. */
const GROUND = { light: { token: 'line-2', opacity: 0.28 }, dark: { token: 'ink-4', opacity: 0.48 } } as const
export const RAIL_DRAW_S = 0.7
export const PULSE_CYCLES = 3

export function SpineScene({ data, hoverId, live }: SceneSlotProps<'spine'>) {
  const invalidate = useThree((s) => s.invalidate)
  const enabled = useMotionEnabled()
  const colors = useThemeColors(TOKENS)
  const theme = useThemeAttr()
  const stations = data.stations
  const n = stations.length

  // --- geometry & materials (disposed on change / unmount) ------------------------------------
  const points = useMemo(() => stationVectors(n), [n])
  const rail = useMemo(() => buildRail(points), [points])
  useEffect(() => () => rail.geometry.dispose(), [rail])

  const railMaterial = useMemo(() => new RailMaterial(colors['line-2'], colors['stage-signed-fill']), []) // eslint-disable-line react-hooks/exhaustive-deps
  const groundMaterial = useMemo(() => new GroundMaterial(colors['line-2']), []) // eslint-disable-line react-hooks/exhaustive-deps
  const tickMaterial = useMemo(() => new MeshBasicMaterial({ color: colors['line-2'], transparent: true, opacity: 0.5 }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const arcMaterial = useMemo(() => new MeshBasicMaterial({ color: colors['stage-current-fill'] }), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    railMaterial.setColors(colors['line-2'], colors['stage-signed-fill'])
    const ground = GROUND[theme]
    groundMaterial.setColor(colors[ground.token])
    groundMaterial.uniforms.uOpacity.value = ground.opacity
    tickMaterial.color.copy(colors[ground.token])
    arcMaterial.color.copy(colors['stage-current-fill'])
    invalidate()
  }, [colors, theme, railMaterial, groundMaterial, tickMaterial, arcMaterial, invalidate])
  useEffect(
    () => () => {
      railMaterial.dispose()
      groundMaterial.dispose()
      tickMaterial.dispose()
      arcMaterial.dispose()
    },
    [railMaterial, groundMaterial, tickMaterial, arcMaterial],
  )
  const groundGeometry = useMemo(() => buildGroundGeometry(), [])
  const tickGeometry = useMemo(() => buildTickGeometry(), [])
  useEffect(() => () => { groundGeometry.dispose(); tickGeometry.dispose() }, [groundGeometry, tickGeometry])

  // `later` steps up the ink ramp in dark (`LATER_RING_TOKEN`): the dashed ring must be seen to
  // be read as "not started", and the stage grey vanished there. Still a grey, never lit.
  const stationColors = useMemo(
    () => ({ signed: colors['stage-signed-fill'], current: colors['stage-current-fill'], later: colors[LATER_RING_TOKEN[theme]] }),
    [colors, theme],
  )
  const ticks = useMemo(() => groupTicks(groupCaptions(data), points), [data, points])
  const current = stations.find((s) => s.isCurrent) ?? null
  const arcTheta = docArcTheta(data)
  const arcGeometry = useMemo(() => (arcTheta === null ? null : buildArcGeometry(arcTheta)), [arcTheta])
  useEffect(() => () => arcGeometry?.dispose(), [arcGeometry])

  // --- animation state (plain objects GSAP tweens; applied in useFrame by the children) -------
  const popped = useRef(false)
  const anim = useMemo(() => makeStationAnim(n, popped.current), [n])
  const parallax = useMemo(() => ({ yaw: 0, pitch: 0 }), [])
  useSpineCamera(parallax, n)
  const pointerInside = useParallaxPointer(parallax)
  useDemandLoop(live || pointerInside)

  // Rail uniforms from the ordered stage_state list. Between uLit and uCurrent the shader is a
  // flat line; a signed-count increase after mount is animated as the ceremony beat.
  const progress = railProgress(data)
  const litArc = toArc(rail, progress.uLit)
  const currentArc = toArc(rail, progress.uCurrent)
  const shownLit = useRef<number | null>(null)

  /** Advance the lit rail to station `index` and bloom its halo — the `"spine"` ceremony beat. */
  const advance = useCallback(
    (index: number) => {
      const target = toArc(rail, stationU(index, n))
      const halo = anim.halos[index]
      const rest = HALO_REST[stations[index]?.kind ?? 'signed']
      if (!enabled) {
        railMaterial.uniforms.uLit.value = Math.max(railMaterial.uniforms.uLit.value, target)
        invalidate()
        return
      }
      const tl = gsap.timeline({ onUpdate: invalidate })
      tl.to(railMaterial.uniforms.uLit, { value: target, duration: 0.45, ease: MOTION_EASES['dur-4'] }, 0)
      if (halo) tl.to(halo, { v: 1, duration: 0.25, ease: 'power2.out' }, 0.2).to(halo, { v: rest, duration: 0.5, ease: 'power2.inOut' }, 0.45)
    },
    [rail, n, anim, stations, enabled, railMaterial, invalidate],
  )

  useEffect(() => {
    railMaterial.uniforms.uCurrent.value = currentArc
    const prev = shownLit.current
    if (prev !== null && litArc > prev && popped.current) {
      let last = -1
      for (const s of stations) if (s.stage_state === 'signed_off') last = s.index
      if (last >= 0) advance(last)
    } else {
      railMaterial.uniforms.uLit.value = litArc
    }
    shownLit.current = litArc
    invalidate()
  }, [litArc, currentArc, stations, advance, railMaterial, invalidate])

  useEffect(() => onSpineCeremony((stageId) => {
    let index = stageId === null ? -1 : stations.findIndex((s) => s.id === stageId)
    if (index < 0) for (const s of stations) if (s.stage_state === 'signed_off') index = s.index
    if (index >= 0) advance(index)
  }), [stations, advance])

  // First open: the rail draws itself (uDraw 0 → 1, 700 ms), then the stations pop in order. With
  // motion off the stub applies the end states at once.
  //
  // The run must be redoable. `useGSAP` reverts its context when the effect is torn down — a real
  // unmount, or StrictMode's simulated one in dev — and that revert puts `uDraw` and every
  // station scale back to 0. `popped` is only true while the draw it describes is still in place,
  // so the callback RETURNS a cleanup (gsap runs it on revert) that clears the flag: the re-run
  // after a StrictMode double-invoke draws again instead of returning early on a flag that
  // outlived the uniforms it stood for, which left the dev graph blank — no rail, no stations —
  // for the life of the mount. A station-count change (`n`) does not revert (useGSAP defers the
  // cleanup to unmount when dependencies are given), so the drawn rail is not replayed then.
  useStudioGSAP(
    (g) => {
      anim.halos.forEach((h, i) => { h.v = HALO_REST[stations[i]?.kind ?? 'later'] })
      if (popped.current) return
      railMaterial.uniforms.uDraw.value = 0
      const tl = g.timeline({ onUpdate: invalidate, onComplete: () => { popped.current = true; invalidate() } })
      tl.to(railMaterial.uniforms.uDraw, { value: 1, duration: RAIL_DRAW_S, ease: 'power2.out' })
      tl.to(anim.scales, { v: 1, duration: 0.32, ease: MOTION_EASES.pop, stagger: 0.05 }, '-=0.1')
      popped.current = true
      return () => { popped.current = false }
    },
    { dependencies: [n] },
  )

  // Hover (plate or sidebar row via spineStore) → halo lift, 160 ms.
  const storeHover = useSpineHover()
  const hovered = hoverId ?? storeHover

  // The current station breathes three times (uPulse 1 → .35 → 1, 2.4 s period), then rests —
  // unless someone is looking: while the pointer is in the band or a station is hovered the
  // breath is held (mirror of `attachPulse`'s `hold`), and it restarts its 3 cycles when the
  // pointer enters the band. The tween runs `repeat: -1` and stops itself at the END of a yoyo
  // (an even half-cycle) so the core is never left mid-breath; the cap is 3 cycles, not a loop.
  const holdRef = useRef(false)
  holdRef.current = pointerInside || storeHover !== null
  const pulseRef = useRef<gsap.core.Tween | null>(null)
  // Keyed on the current station's ID, not the object: a data refresh that keeps the same "now"
  // must not restart the breath.
  const currentId = current?.id ?? null
  const startPulse = useCallback(() => {
    pulseRef.current?.kill()
    pulseRef.current = null
    anim.pulse.v = 1
    if (!enabled || currentId === null) { invalidate(); return }
    let halfCycles = 0
    pulseRef.current = gsap.to(anim.pulse, {
      v: 0.35, duration: 1.2, ease: MOTION_EASES.ambient, yoyo: true, repeat: -1,
      onUpdate: invalidate,
      onRepeat: () => {
        halfCycles += 1
        if (halfCycles % 2 === 0 && halfCycles / 2 >= PULSE_CYCLES && !holdRef.current) {
          pulseRef.current?.kill()
          pulseRef.current = null
          anim.pulse.v = 1
          invalidate()
        }
      },
    })
  }, [anim, enabled, currentId, invalidate])
  useEffect(() => {
    startPulse()
    return () => { pulseRef.current?.kill(); pulseRef.current = null; anim.pulse.v = 1 }
  }, [startPulse, anim])
  useEffect(() => {
    // Entering the band restarts the three breaths (a resting station wakes when looked at).
    if (pointerInside && pulseRef.current === null) startPulse()
  }, [pointerInside, startPulse])
  useEffect(() => {
    const tweens = stations.map((s, i) => {
      const halo = anim.halos[i]
      const target = (hovered === s.id ? HALO_HOVER : HALO_REST)[s.kind]
      if (!halo) return null
      if (!enabled) { halo.v = target; return null }
      return gsap.to(halo, { v: target, duration: 0.16, ease: 'power2.out', overwrite: true, onUpdate: invalidate })
    })
    invalidate()
    return () => { for (const t of tweens) t?.kill() }
  }, [hovered, stations, anim, enabled, invalidate])

  const plates = usePlateItems(data, points)
  const captions = useCaptionItems(data, points)

  return (
    <>
      <SceneLights />
      <mesh geometry={rail.geometry} material={railMaterial} />
      <SpineStations stations={stations} points={points} colors={stationColors} anim={anim} />
      {current && arcGeometry ? (
        <mesh geometry={arcGeometry} material={arcMaterial} position={points[current.index]} rotation={[0, 0, Math.PI / 2]} />
      ) : null}
      {ticks.map((t) => (
        <mesh key={t.label} geometry={tickGeometry} material={tickMaterial} position={[t.x, GROUND_Y + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ))}
      <mesh geometry={groundGeometry} material={groundMaterial} position={[0, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <Plates items={plates} captions={captions} layout={layoutSpineBands} />
    </>
  )
}

export default SpineScene
