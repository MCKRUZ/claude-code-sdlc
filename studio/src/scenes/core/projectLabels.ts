// Where on the page does a point in the scene land? (studio-observatory.md §5.0 `Plates` +
// `projectLabels`.)
//
// The plates are real DOM buttons beside the canvas, so a screen reader, the keyboard and the
// pointer all meet the same element — but their positions come from the camera inside the
// Canvas. This store is the bridge: the in-canvas half (`Plates`) owns the anchors and, on each
// demand frame, projects every anchor, lays the plates out so none overlap (`plateLayout.ts`),
// and writes `transform` / `opacity` STRAIGHT onto the `<li>` the DOM half registered — plus the
// leader line of any plate that had to step aside from its body. No React state is touched per
// frame; React only re-renders when the LIST of plates changes (ids, titles), which is a data
// change, not a camera move.
//
// Type-only imports of three keep this module out of the main bundle's runtime graph.
import type { Camera, Vector3 } from 'three'
import { leaderStart, stackPlatesStable } from './plateLayout'
import type { ExpandedPlate, PlacedPlateBox, PlateInput, PlateSide } from './plateLayout'

/** What a scene's own layout may read beyond the plates: where the caption row ends (host px),
 * so a row of plates can stay strictly below the group labels. */
export interface PlateFrame {
  captionBottom: number
}

/** A scene-specific placement, replacing the default greedy stack (`stackPlatesStable`) for one
 * `Plates` instance. Same contract: `plates` carry collapsed boxes, `expanded` is the one hovered
 * plate's measured size, and the result is one box per input. */
export type PlateLayout = (
  plates: readonly PlateInput[], width: number, height: number, expanded: ExpandedPlate | undefined, frame: PlateFrame,
) => PlacedPlateBox[]

export interface PlateItem {
  id: string
  /** The noun before the id in the accessible name: "Spec", "Stage". Never omitted, so a plate's
   * name is never a bare id and `getByRole('button', {name: '0002', exact: true})` cannot match. */
  kind: string
  title: string
  /** A small mono lead-in shown before the title (the spec id). Visual only; the accessible name
   * already carries the id through `kind` + `id`. */
  meta?: string
  /** Where the plate is pinned, in world units — the BODY's centre. Mutated in place by the
   * owning scene. */
  anchor: Vector3
  /** The body's drawn radius in world units. When set, the plate sits just outside the body's
   * projected silhouette on `side`; when absent it is centred on the anchor (legacy). */
  anchorRadius?: number
  side?: PlateSide
  /** Extra lines shown when the plate is expanded (hover / focus). Verbatim plugin facts. */
  lines?: string[]
  /** A small leading badge, e.g. the build-order number. */
  badge?: string
  /** Ghosts and dimmed bodies render at reduced emphasis; a hint for the CSS, not a fact. */
  muted?: boolean
  /** A short label drawn first in the title row ("Next up"): the plugin's own answer, shown as
   * words on the body rather than only as a glow. */
  ribbon?: string
  /** Round 2 (S3): a short title worn while COLLAPSED (the Spine's "Requirements" for "Phase 1:
   * Requirements"), in `text-2xs`; the full `title` returns on hover. The accessible name is
   * always `title`. Absent → `title` is shown collapsed too (the current station, the specs). */
  shortTitle?: string
  /** Round 2 (I4): a second line always shown under the title (the Closing ledger's "signed off
   * · <name> · <date>"). Verbatim plugin facts through the model's words, never a judgement. */
  subtitle?: string
}

/** Round 2 (I5): while one plate is expanded its siblings fade to this opacity, over this long. */
export const SIBLING_DIM_OPACITY = 0.55
export const SIBLING_DIM_S = 0.16

/** A decorative DOM caption pinned to a world point's x (the Spine's group names). Its y is a
 * constant row at the band's top so captions never collide with plates. Not a control. */
export interface CaptionItem {
  id: string
  label: string
  anchor: Vector3
}

/** Captions form a fixed header row: this many CSS px from the host's top edge. */
export const CAPTION_TOP_PX = 8

export interface Projected {
  x: number
  y: number
  /** False when the anchor is behind the camera. */
  visible: boolean
  /** 0 (nearest) … 1 (farthest) within the frame, for the depth → opacity / scale map. */
  depth: number
}

/** Project one world point to CSS px within a `width × height` host. `out` is reused. */
export function projectPoint(anchor: Vector3, camera: Camera, width: number, height: number, out: Projected, scratch: Vector3): Projected {
  scratch.copy(anchor).project(camera)
  out.visible = scratch.z < 1
  out.x = (scratch.x * 0.5 + 0.5) * width
  out.y = (-scratch.y * 0.5 + 0.5) * height
  // NDC z runs −1…1 inside the frustum; clamp so a point just behind the near plane is 0.
  out.depth = Math.min(1, Math.max(0, scratch.z * 0.5 + 0.5))
  return out
}

/** Depth → the §5.0 emphasis ramp: opacity .55…1 and scale .9…1, nearest strongest. */
export function depthStyle(depth: number): { opacity: number; scale: number } {
  const near = 1 - depth
  return { opacity: 0.55 + 0.45 * near, scale: 0.9 + 0.1 * near }
}

type Listener = () => void

export class PlateStore {
  private items: PlateItem[] = []
  private captions: CaptionItem[] = []
  private readonly elements = new Map<string, HTMLElement>()
  private readonly leaders = new Map<string, SVGLineElement>()
  private readonly captionEls = new Map<string, HTMLElement>()
  private readonly listeners = new Set<Listener>()
  private readonly inputs: PlateInput[] = []
  /** Each plate's last COLLAPSED box. The stack is laid out on these, so a plate that expands on
   * hover changes nothing but its own rectangle (observatory v4 critique, sprint-graph-hover). */
  private readonly collapsed = new Map<string, { w: number; h: number }>()
  /** 0 … 1: how far the siblings of the expanded plate have faded toward `SIBLING_DIM_OPACITY`.
   * The in-canvas half tweens it (160 ms) and the next projection applies it; 0 when nothing is
   * expanded, so the resting opacity is the depth ramp alone. */
  siblingDim = 0

  getSnapshot = (): PlateItem[] => this.items
  getCaptions = (): CaptionItem[] => this.captions

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) listener()
  }

  /** Replace the plate list. Called from an effect when the data changes, never per frame. */
  setItems(items: PlateItem[]): void {
    this.items = items
    this.collapsed.clear()
    this.notify()
  }

  setCaptions(captions: CaptionItem[]): void {
    this.captions = captions
    this.notify()
  }

  /** The DOM half registers each `<li>` here (null on unmount). */
  register(id: string, el: HTMLElement | null): void {
    if (el) this.elements.set(id, el)
    else this.elements.delete(id)
  }

  registerLeader(id: string, el: SVGLineElement | null): void {
    if (el) this.leaders.set(id, el)
    else this.leaders.delete(id)
  }

  registerCaption(id: string, el: HTMLElement | null): void {
    if (el) this.captionEls.set(id, el)
    else this.captionEls.delete(id)
  }

  /** The in-canvas half calls this each demand frame. `up` is the camera's world up vector (a
   * scratch the caller owns), used to measure a body's projected radius. */
  project(camera: Camera, width: number, height: number, out: Projected, scratch: Vector3, up?: Vector3, layout?: PlateLayout): void {
    this.inputs.length = 0
    let expanded: ExpandedPlate | undefined
    // Where the caption row ends, for a layout that keeps its plates below the group labels.
    let captionBottom = CAPTION_TOP_PX
    for (const caption of this.captions) {
      const el = this.captionEls.get(caption.id)
      if (el) captionBottom = Math.max(captionBottom, CAPTION_TOP_PX + el.offsetHeight)
    }
    const styles = new Map<string, { opacity: number; scale: number; cx: number; cy: number; r: number }>()
    for (const item of this.items) {
      const el = this.elements.get(item.id)
      if (!el) continue
      projectPoint(item.anchor, camera, width, height, out, scratch)
      if (!out.visible) {
        el.style.visibility = 'hidden'
        const leader = this.leaders.get(item.id)
        if (leader) leader.style.visibility = 'hidden'
        continue
      }
      const { opacity, scale } = depthStyle(out.depth)
      const cx = out.x, cy = out.y, depth = out.depth
      let r = 0
      if (item.anchorRadius !== undefined && up) {
        // The silhouette radius in px: project a point one radius "up" from the centre.
        scratch.copy(up).multiplyScalar(item.anchorRadius).add(item.anchor)
        const edge = { x: 0, y: 0, visible: false, depth: 0 }
        projectPoint(scratch, camera, width, height, edge, scratch)
        r = Math.hypot(edge.x - cx, edge.y - cy)
      }
      styles.set(item.id, { opacity, scale, cx, cy, r })
      if (item.anchorRadius === undefined) {
        el.style.visibility = ''
        el.style.opacity = opacity.toFixed(3)
        el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
        el.style.zIndex = String(1000 - Math.round(depth * 999))
        continue
      }
      // The stack is laid out on COLLAPSED boxes. An expanded plate measures larger, so its box
      // is the one remembered from its last collapsed frame (its own measurement only until it
      // has had one), and the expanded size goes to the layout separately.
      const measured = { w: el.offsetWidth * scale, h: el.offsetHeight * scale }
      const isExpanded = el.dataset.expanded !== undefined
      if (!isExpanded) this.collapsed.set(item.id, measured)
      else expanded = { id: item.id, ...measured }
      const box = (isExpanded ? this.collapsed.get(item.id) : undefined) ?? measured
      this.inputs.push({ id: item.id, x: cx, y: cy, r, w: box.w, h: box.h, side: item.side ?? 'below', depth })
    }
    if (this.inputs.length) {
      const place: PlateLayout = layout ?? stackPlatesStable
      for (const placed of place(this.inputs, width, height, expanded, { captionBottom })) {
        const el = this.elements.get(placed.id)
        const s = styles.get(placed.id)
        const input = this.inputs.find((i) => i.id === placed.id)
        if (!el || !s || !input) continue
        el.style.visibility = ''
        // Siblings of the expanded plate step back (I5); the expanded plate itself never dims.
        const sibling = expanded !== undefined && expanded.id !== placed.id
        const dim = sibling ? 1 - (1 - SIBLING_DIM_OPACITY) * Math.max(0, Math.min(1, this.siblingDim)) : 1
        // The expanded plate is a card being READ, so it is drawn solid. The depth ramp (.55 at the
        // far end) is for a label resting on its body; a hover card at .55 let the edges and the
        // neighbouring plate show through its own text (observatory v9 sprint-graph-hover).
        const isExpandedPlate = expanded !== undefined && expanded.id === placed.id
        el.style.opacity = isExpandedPlate ? '1' : (s.opacity * dim).toFixed(3)
        el.style.transformOrigin = 'top left'
        el.style.transform = `translate3d(${placed.left.toFixed(1)}px, ${placed.top.toFixed(1)}px, 0) scale(${s.scale.toFixed(3)})`
        // Nearer plates stack above farther ones when they overlap; an expanded plate wins.
        el.style.zIndex = String(1000 - Math.round(input.depth * 999) + (el.dataset.expanded !== undefined ? 2000 : 0))
        const leader = this.leaders.get(placed.id)
        if (!leader) continue
        if (!placed.displaced) { leader.style.visibility = 'hidden'; continue }
        const from = leaderStart(placed, placed.w, placed.h)
        const toY = placed.side === 'below' ? s.cy + s.r : s.cy - s.r
        leader.style.visibility = ''
        leader.setAttribute('x1', from.x.toFixed(1)); leader.setAttribute('y1', from.y.toFixed(1))
        leader.setAttribute('x2', s.cx.toFixed(1)); leader.setAttribute('y2', toY.toFixed(1))
      }
    }
    for (const caption of this.captions) {
      const el = this.captionEls.get(caption.id)
      if (!el) continue
      // Only x comes from the scene; the row is pinned at CAPTION_TOP_PX so the captions are a
      // header of the instrument, never pushed into a plate. Clamp so a caption near an edge
      // stays whole inside the host.
      projectPoint(caption.anchor, camera, width, height, out, scratch)
      el.style.visibility = out.visible ? '' : 'hidden'
      if (!out.visible) continue
      const half = el.offsetWidth / 2
      const x = Math.max(half, Math.min(width - half, out.x))
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${CAPTION_TOP_PX}px, 0) translate(-50%, 0)`
    }
  }
}
