// The Ambient field's numbers, kept free of three.js so a node test can check them
// (studio-observatory.md §5.3; round 2 B3 "gathered two-layer field"). Everything here is
// decoration: two slabs of points, a fade curve, a settle curve and a parallax clamp. No plugin
// data enters this module — there is no field for it to live in.
//
// Two layers (B3): FAR dust — many, small, `ink-4` at 30 % in light — and NEAR motes — few,
// larger. Both are gathered: x follows a Gaussian centred on the hero third (where the mark and
// the h1 sit), σ ≈ 0.35 of the slab width, so the field is densest behind the title and thins
// toward the recent list. About 8 % of the far dust is `accent-400` in light (in dark the whole
// field is already accent). Sizes settle 1.06× → 1× over the fade. Everything is seeded, so the
// field is identical on every open.
import type { FamiliarityTier } from '../../motion/contract'

/** Width × height × depth of the slab the points fill, in scene units, centred on the origin. */
export const SLAB: readonly [number, number, number] = [16, 9, 4]

/** Camera for the slab: §5.3 "fov 35 at z 10". */
export const CAMERA_FOV = 35
export const CAMERA_Z = 10

export interface FieldLayerSpec {
  readonly name: 'far' | 'near'
  readonly count: number
  readonly sizeMin: number
  readonly sizeMax: number
  readonly seed: number
}

export const FAR_LAYER: FieldLayerSpec = { name: 'far', count: 900, sizeMin: 0.6, sizeMax: 1.1, seed: 7 }
export const NEAR_LAYER: FieldLayerSpec = { name: 'near', count: 120, sizeMin: 1.4, sizeMax: 1.8, seed: 23 }
export const FIELD_LAYERS: readonly FieldLayerSpec[] = [FAR_LAYER, NEAR_LAYER]

/** Points in the whole field, both layers. */
export const FIELD_COUNT = FAR_LAYER.count + NEAR_LAYER.count

/** The hero third: x from the slab's left edge to one third across, and the Gaussian that
 * gathers the field there — centred on that third, σ as a fraction of the slab width. */
export const HERO_SIGMA = 0.35
export const HERO_CENTRE_X = -SLAB[0] / 3

/** Share of the far dust that wears `accent-400` in light. Exact, not a coin per point. */
export const ACCENT_SHARE = 0.08

/** Fade-in length in seconds: 900 ms on the first opens, slow enough that the field arrives
 * rather than pops; from the fourth open (`quiet`, `settled`) a plain 320 ms fade (M3). */
export const FADE_SECONDS = 0.9
export const FADE_SECONDS_QUIET = 0.32
export function fadeSecondsFor(tier: FamiliarityTier): number {
  return tier === 'full' ? FADE_SECONDS : FADE_SECONDS_QUIET
}

/** Sizes settle from this factor to 1 over the fade — first opens only. */
export const SETTLE_FROM = 1.06

/** Pointer parallax ceiling as a fraction of the slab's half-extent (§5.3 "≤ 2 %"). */
export const PARALLAX_MAX = 0.02

/** Demand-loop ceiling while visible: 20 fps is plenty for a drift this slow. */
export const FIELD_FPS = 20

/** Colour and alpha per theme and layer. Quiet on purpose — atmosphere behind a title, not
 * snow in front of it. Dark is additive accent for every layer (the existing look). */
export const APPEARANCE = {
  light: {
    far: { token: 'ink-4', opacity: 0.3, additive: false },
    farAccent: { token: 'accent-400', opacity: 0.3, additive: false },
    near: { token: 'ink-4', opacity: 0.22, additive: false },
  },
  dark: {
    far: { token: 'accent-400', opacity: 0.16, additive: true },
    farAccent: { token: 'accent-400', opacity: 0.22, additive: true },
    near: { token: 'accent-400', opacity: 0.12, additive: true },
  },
} as const

export type FieldDrawName = 'far' | 'farAccent' | 'near'

export interface FieldDraw {
  readonly name: FieldDrawName
  readonly positions: Float32Array
  readonly sizes: Float32Array
}

/** mulberry32 — a small seeded generator so the slab is the same on every open and a test can
 * assert its bounds without a snapshot of 3 000 floats. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Per-point size factors in [min, max], squared so most points are small and a few are
 * larger soft discs. Deterministic for a seed. */
export function layerSizes(count: number, min: number, max: number, seed: number): Float32Array {
  const out = new Float32Array(count)
  const rand = seededRandom(seed)
  for (let i = 0; i < count; i++) out[i] = min + (max - min) * rand() ** 2
  return out
}

/** `count` points spread UNIFORMLY through the slab — the ungathered baseline, kept for the
 * octant test and as the near layer's depth/height distribution. */
export function slabPositions(count: number = FIELD_COUNT, seed = 7, slab = SLAB): Float32Array {
  const out = new Float32Array(count * 3)
  const rand = seededRandom(seed)
  const [w, h, d] = slab
  for (let i = 0; i < count; i++) {
    out[i * 3] = (rand() - 0.5) * w
    out[i * 3 + 1] = (rand() - 0.5) * h
    out[i * 3 + 2] = (rand() - 0.5) * d
  }
  return out
}

/** `count` points gathered on the hero third: x ~ N(HERO_CENTRE_X, HERO_SIGMA·w), redrawn
 * until inside the slab; y and z uniform. Deterministic for a seed. */
export function gatheredPositions(count: number, seed: number, slab = SLAB): Float32Array {
  const out = new Float32Array(count * 3)
  const rand = seededRandom(seed)
  const [w, h, d] = slab
  const sigma = HERO_SIGMA * w
  const half = w / 2
  for (let i = 0; i < count; i++) {
    let x = Number.NaN
    while (!(x >= -half && x <= half)) {
      // Box–Muller; the second normal is discarded so the stream stays one draw per attempt.
      const u = Math.max(rand(), Number.EPSILON)
      const v = rand()
      x = HERO_CENTRE_X + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    }
    out[i * 3] = x
    out[i * 3 + 1] = (rand() - 0.5) * h
    out[i * 3 + 2] = (rand() - 0.5) * d
  }
  return out
}

/** Exactly `round(count · share)` indices, chosen by a seeded partial shuffle. */
export function accentIndices(count: number, share: number, seed: number): Set<number> {
  const take = Math.round(count * share)
  const pool = Array.from({ length: count }, (_, i) => i)
  const rand = seededRandom(seed)
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (count - i))
    const t = pool[i]!
    pool[i] = pool[j]!
    pool[j] = t
  }
  return new Set(pool.slice(0, take))
}

function pick(positions: Float32Array, sizes: Float32Array, keep: (i: number) => boolean): { positions: Float32Array; sizes: Float32Array } {
  const idx: number[] = []
  for (let i = 0; i < sizes.length; i++) if (keep(i)) idx.push(i)
  const p = new Float32Array(idx.length * 3)
  const s = new Float32Array(idx.length)
  idx.forEach((i, k) => {
    p[k * 3] = positions[i * 3]!
    p[k * 3 + 1] = positions[i * 3 + 1]!
    p[k * 3 + 2] = positions[i * 3 + 2]!
    s[k] = sizes[i]!
  })
  return { positions: p, sizes: s }
}

/** The whole field as three draws: far dust in ink, the accent share of the far dust, and the
 * near motes. Same arrays for the same seed, every open. */
export function buildField(seed = 0, slab = SLAB): readonly FieldDraw[] {
  const farPos = gatheredPositions(FAR_LAYER.count, FAR_LAYER.seed + seed, slab)
  const farSize = layerSizes(FAR_LAYER.count, FAR_LAYER.sizeMin, FAR_LAYER.sizeMax, FAR_LAYER.seed + 101 + seed)
  const accent = accentIndices(FAR_LAYER.count, ACCENT_SHARE, FAR_LAYER.seed + 202 + seed)
  const nearPos = gatheredPositions(NEAR_LAYER.count, NEAR_LAYER.seed + seed, slab)
  const nearSize = layerSizes(NEAR_LAYER.count, NEAR_LAYER.sizeMin, NEAR_LAYER.sizeMax, NEAR_LAYER.seed + 101 + seed)
  return [
    { name: 'far', ...pick(farPos, farSize, (i) => !accent.has(i)) },
    { name: 'farAccent', ...pick(farPos, farSize, (i) => accent.has(i)) },
    { name: 'near', positions: nearPos, sizes: nearSize },
  ]
}

/** Points per horizontal third of the slab — [hero, middle, far] — for a test or a caption. */
export function thirds(positions: Float32Array, slab = SLAB): [number, number, number] {
  const w = slab[0]
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < positions.length; i += 3) {
    const t = Math.min(2, Math.max(0, Math.floor(((positions[i]! + w / 2) / w) * 3)))
    out[t]++
  }
  return out
}

/** 0 → 1 over `seconds`, eased (smoothstep) so the field does not pop. Clamped. */
export function fadeProgress(elapsedSeconds: number, seconds: number = FADE_SECONDS): number {
  if (elapsedSeconds <= 0) return 0
  const t = Math.min(1, elapsedSeconds / seconds)
  return t * t * (3 - 2 * t)
}

/** Point-size factor for a fade progress: 1.06 → 1 on first opens, a constant 1 otherwise. */
export function settleScale(fade: number, tier: FamiliarityTier = 'full'): number {
  if (tier !== 'full') return 1
  const f = Math.min(1, Math.max(0, fade))
  return SETTLE_FROM + (1 - SETTLE_FROM) * f
}

/** Camera offset for a pointer at normalised (-1…1) coordinates, clamped to ≤ 2 % of the slab's
 * half-extent on each axis. A pointer outside the window (NaN / undefined) reads as centred. */
export function parallaxOffset(nx: number, ny: number, slab = SLAB): { x: number; y: number } {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0)
  return {
    x: clamp(nx) * PARALLAX_MAX * (slab[0] / 2),
    y: clamp(ny) * PARALLAX_MAX * (slab[1] / 2),
  }
}

/** Pointer client coordinates → normalised (-1…1) against the viewport. */
export function normalisePointer(clientX: number, clientY: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return { nx: 0, ny: 0 }
  return { nx: (clientX / width) * 2 - 1, ny: (clientY / height) * 2 - 1 }
}
