// The Ambient field's numbers, kept free of three.js so a node test can check them
// (studio-observatory.md §5.3). Everything here is decoration: a slab of points, a fade curve and
// a parallax clamp. No plugin data enters this module — there is no field for it to live in.

/** Points in the field — fewer and larger than a starfield, so it reads as soft discs. One draw
 * call; the vertex shader moves them. */
export const FIELD_COUNT = 420

/** Width × height × depth of the slab the points fill, in scene units, centred on the origin. */
export const SLAB: readonly [number, number, number] = [16, 9, 4]

/** Camera for the slab: §5.3 "fov 35 at z 10". */
export const CAMERA_FOV = 35
export const CAMERA_Z = 10

/** Fade-in length in seconds: 900 ms, slow enough that the field arrives rather than pops. */
export const FADE_SECONDS = 0.9

/** Pointer parallax ceiling as a fraction of the slab's half-extent (§5.3 "≤ 2 %"). */
export const PARALLAX_MAX = 0.02

/** Demand-loop ceiling while visible: 20 fps is plenty for a drift this slow. */
export const FIELD_FPS = 20

/** Colour and alpha per theme: ink-4 at 30 % in light, accent-400 at 16 % additive in dark.
 * Quiet on purpose — atmosphere behind a title, not snow in front of it. */
export const APPEARANCE = {
  light: { token: 'ink-4', opacity: 0.3, additive: false },
  dark: { token: 'accent-400', opacity: 0.16, additive: true },
} as const

/** Per-point size factors in [SIZE_MIN, SIZE_MAX], seeded so the field is the same every open. */
export const SIZE_MIN = 0.9
export const SIZE_MAX = 2.6
export function slabSizes(count: number = FIELD_COUNT, seed = 11): Float32Array {
  const out = new Float32Array(count)
  const rand = seededRandom(seed)
  for (let i = 0; i < count; i++) {
    // Squared so most points are small and a few are large soft discs.
    const t = rand() ** 2
    out[i] = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * t
  }
  return out
}

/** mulberry32 — a small seeded generator so the slab is the same on every open and a test can
 * assert its bounds without a snapshot of 3 600 floats. */
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

/** `count` points spread uniformly through the slab, as a flat xyz array ready for a
 * `BufferAttribute`. Deterministic for a given seed. */
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

/** 0 → 1 over `FADE_SECONDS`, eased (smoothstep) so the field does not pop. Clamped. */
export function fadeProgress(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0
  const t = Math.min(1, elapsedSeconds / FADE_SECONDS)
  return t * t * (3 - 2 * t)
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
