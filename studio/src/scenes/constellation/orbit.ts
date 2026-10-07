// A hand-rolled orbit (studio-observatory.md §5.2 "Camera / controls"): spherical coordinates
// around a target with damping, clamped so the slab can never be viewed edge-on or from inside.
// No drei, no three import — this is a pure model the scene drives from `useDemandLoop`'s
// `onTick` (damping runs until the velocity drops below `SETTLE_EPSILON`, then the loop stops
// and the scene renders zero frames) and the figure drives from its keydown handler.
//
// Default pose = `PerspectiveCamera fov 40, position (0, 2.6, 11)` looking at the origin — until
// the scene fits the bodies (`fit.ts`) and calls `setHome`, after which HOME is the fitted pose:
// the orbit keeps whatever the person did afterwards, and `goHome` (double-click) eases back.

/** Never from the top (a slab seen from above is a line of dots), never edge-on. */
export const POLAR_MIN = 0.55
export const POLAR_MAX = 1.25
export const RADIUS_MIN = 2
export const RADIUS_MAX = 80
export const DAMPING = 0.12
export const SETTLE_EPSILON = 1e-4

/** Radians per CSS pixel of drag; per key press (Shift+arrow). */
export const DRAG_RATE = 0.006
export const KEY_STEP = 0.12
/** Zoom factor per key press (+ / −) and per 100 wheel pixels. */
export const KEY_ZOOM = 1.15
export const WHEEL_ZOOM_PER_100 = 1.1

export type Vec3 = [number, number, number]

/** The subset of a three camera the orbit writes; a plain object satisfies it in tests. */
export interface OrbitCamera {
  position: { set(x: number, y: number, z: number): unknown }
  lookAt(x: number, y: number, z: number): void
}

const DEFAULT_POSITION: Vec3 = [0, 2.6, 11]

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function sphericalFrom(position: Vec3, target: Vec3): { radius: number; polar: number; azimuth: number } {
  const dx = position[0] - target[0]
  const dy = position[1] - target[1]
  const dz = position[2] - target[2]
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) || RADIUS_MIN
  return { radius, polar: Math.acos(clamp(dy / radius, -1, 1)), azimuth: Math.atan2(dx, dz) }
}

export class OrbitState {
  radius: number
  polar: number
  azimuth: number
  target: Vec3 = [0, 0, 0]
  /** Pending (undamped) deltas; `update` bleeds them into the pose. */
  private vAzimuth = 0
  private vPolar = 0
  private vRadius = 0
  private targetTo: Vec3 | null = null
  private home: { target: Vec3; radius: number } | null = null
  /** True once the person has rotated, zoomed or dragged since the last `setHome` / `goHome`. */
  touched = false
  private readonly wakeListeners = new Set<() => void>()

  constructor(position: Vec3 = DEFAULT_POSITION, target: Vec3 = [0, 0, 0]) {
    const s = sphericalFrom(position, target)
    this.radius = clamp(s.radius, RADIUS_MIN, RADIUS_MAX)
    this.polar = clamp(s.polar, POLAR_MIN, POLAR_MAX)
    this.azimuth = s.azimuth
    this.target = [...target]
  }

  /** The scene subscribes so a key press from the DOM side can restart its demand loop. */
  onWake(listener: () => void): () => void {
    this.wakeListeners.add(listener)
    return () => { this.wakeListeners.delete(listener) }
  }

  private wake(): void {
    for (const l of this.wakeListeners) l()
  }

  rotate(dAzimuth: number, dPolar: number): void {
    this.vAzimuth += dAzimuth
    this.vPolar += dPolar
    this.touched = true
    this.wake()
  }

  /** `factor > 1` moves the camera away. */
  zoom(factor: number): void {
    const next = clamp(this.radius * factor, RADIUS_MIN, RADIUS_MAX)
    this.vRadius += next - this.radius
    this.touched = true
    this.wake()
  }

  /** The fitted pose. `apply` jumps there at once (first fit, a resize before anyone orbited);
   * otherwise only the home is updated and `goHome` is what returns to it. */
  setHome(target: Vec3, radius: number, apply: boolean): void {
    this.home = { target: [...target], radius: clamp(radius, RADIUS_MIN, RADIUS_MAX) }
    if (!apply) return
    this.target = [...this.home.target]
    this.targetTo = null
    this.radius = this.home.radius
    this.vRadius = 0
    this.touched = false
    this.wake()
  }

  /** Ease back to the fitted pose (target and distance; the angle the person chose is kept). */
  goHome(): void {
    if (!this.home) return
    this.targetTo = [...this.home.target]
    this.vRadius += this.home.radius - this.radius
    this.touched = false
    this.wake()
  }

  dragBy(dxPx: number, dyPx: number): void {
    this.rotate(-dxPx * DRAG_RATE, -dyPx * DRAG_RATE)
  }

  wheel(deltaY: number): void {
    this.zoom(Math.pow(WHEEL_ZOOM_PER_100, deltaY / 100))
  }

  recentre(target: Vec3): void {
    this.targetTo = [...target]
    this.touched = true
    this.wake()
  }

  /** Shift+arrows orbit, `+` / `−` zoom. Returns true when the key was consumed. */
  handleKey(key: string, shift: boolean): boolean {
    if (key === '+' || key === '=') { this.zoom(1 / KEY_ZOOM); return true }
    if (key === '-' || key === '_') { this.zoom(KEY_ZOOM); return true }
    if (!shift) return false
    switch (key) {
      case 'ArrowLeft': this.rotate(KEY_STEP, 0); return true
      case 'ArrowRight': this.rotate(-KEY_STEP, 0); return true
      case 'ArrowUp': this.rotate(0, -KEY_STEP); return true
      case 'ArrowDown': this.rotate(0, KEY_STEP); return true
      default: return false
    }
  }

  /** True while anything is still in motion. */
  get unsettled(): boolean {
    return (
      Math.abs(this.vAzimuth) > SETTLE_EPSILON ||
      Math.abs(this.vPolar) > SETTLE_EPSILON ||
      Math.abs(this.vRadius) > SETTLE_EPSILON ||
      this.targetTo !== null
    )
  }

  /** Bleed the pending deltas into the pose at `DAMPING` per tick (normalised to 60 Hz).
   * Returns true while unsettled, so a demand loop knows to keep ticking. */
  update(deltaSeconds = 1 / 60): boolean {
    const k = 1 - Math.pow(1 - DAMPING, deltaSeconds * 60)
    const da = this.vAzimuth * k
    const dp = this.vPolar * k
    const dr = this.vRadius * k
    this.azimuth += da
    this.polar = clamp(this.polar + dp, POLAR_MIN, POLAR_MAX)
    this.radius = clamp(this.radius + dr, RADIUS_MIN, RADIUS_MAX)
    this.vAzimuth -= da
    this.vPolar -= dp
    this.vRadius -= dr
    if (this.targetTo) {
      const t = this.targetTo
      let done = true
      for (let i = 0; i < 3; i++) {
        const d = (t[i] - this.target[i]) * k
        this.target[i] += d
        if (Math.abs(t[i] - this.target[i]) > SETTLE_EPSILON) done = false
      }
      if (done) { this.target = [...t]; this.targetTo = null }
    }
    if (!this.unsettled) { this.vAzimuth = 0; this.vPolar = 0; this.vRadius = 0 }
    return this.unsettled
  }

  position(): Vec3 {
    const sinP = Math.sin(this.polar)
    return [
      this.target[0] + this.radius * sinP * Math.sin(this.azimuth),
      this.target[1] + this.radius * Math.cos(this.polar),
      this.target[2] + this.radius * sinP * Math.cos(this.azimuth),
    ]
  }

  applyTo(camera: OrbitCamera): void {
    const [x, y, z] = this.position()
    camera.position.set(x, y, z)
    camera.lookAt(this.target[0], this.target[1], this.target[2])
  }
}

export const ORBIT_KEYSHORTCUTS = 'Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown + -'
