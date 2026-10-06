/** The Spine's two plate bands (observatory v4 critique, stage-light / stage-dark): the plates
 * are the rail's tick labels, in an upper row strictly below the group captions and a lower row
 * below every station disc, alternating by station, each clear of its disc by `BAND_CLEARANCE`
 * and of its neighbours by `NEIGHBOUR_GAP`; a collision is a sideways nudge, never a pile. Proven
 * on the REAL camera and projection (`spinePose` → `PerspectiveCamera` → `projectPoint`) at every
 * band height the hosts use and every width the graph is allowed, with the plate widths the
 * production shots measure — not on a hand-picked set of boxes. */

import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { PlateInput } from '../../src/scenes/core/plateLayout'
import { CAPTION_TOP_PX, projectPoint } from '../../src/scenes/core/projectLabels'
import { CAMERA_FOV, ELEVATION, spinePose } from '../../src/scenes/spine/spineCamera'
import { captionAnchor, stationVectors } from '../../src/scenes/spine/spineGeometry'
import { discRadius, groupCaptions } from '../../src/scenes/spine/spineModel'
import type { SceneDataSpine, Station } from '../../src/scenes/core/types'
import { BAND_CLEARANCE, LABEL_GAP, layoutSpineBands, NEIGHBOUR_GAP, spreadRow, SQUEEZE_MAX } from '../../src/scenes/spine/spineBands'

const IDS = ['0', '1', '2', '3', 'build', '7', '8', '9', 'close']
/** Collapsed plate widths as the v4 stage shots measure them (px), and the one-line height. */
const WIDTHS = [148, 132, 98, 122, 72, 140, 128, 118, 150]
const PLATE_H = 24
/** The caption row: `CAPTION_TOP_PX` plus an 11 px label at the body's 1.5 line height. */
const CAPTION_BOTTOM = CAPTION_TOP_PX + 17
const HEIGHTS = [120, 168, 200]
const WIDTHS_PX = [640, 724, 900, 1100, 1400]

interface Disc { id: string; cx: number; cy: number; r: number }

/** The scene's camera for a `width × height` band, exactly as `useSpineCamera` places it. */
function cameraFor(n: number, width: number, height: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 60)
  const pose = spinePose(n, width, height)
  const target = new Vector3(...pose.target)
  camera.position.copy(target).add(new Vector3(0, Math.sin(ELEVATION) * pose.distance, Math.cos(ELEVATION) * pose.distance))
  camera.lookAt(target)
  camera.updateMatrixWorld(true)
  return camera
}

/** Project the nine stations the way the plate store does: centre, and the disc's radius as the
 * distance to a point one radius along the camera's up. */
function project(width: number, height: number): { discs: Disc[]; inputs: PlateInput[] } {
  const n = IDS.length
  const camera = cameraFor(n, width, height)
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const points = stationVectors(n)
  const out = { x: 0, y: 0, visible: false, depth: 0 }
  const scratch = new Vector3()
  const discs: Disc[] = []
  const inputs: PlateInput[] = []
  points.forEach((p, i) => {
    projectPoint(p, camera, width, height, out, scratch)
    expect(out.visible).toBe(true)
    const cx = out.x, cy = out.y, depth = out.depth
    const edge = { x: 0, y: 0, visible: false, depth: 0 }
    projectPoint(scratch.copy(up).multiplyScalar(discRadius(IDS[i] === 'build')).add(p), camera, width, height, edge, scratch)
    const r = Math.hypot(edge.x - cx, edge.y - cy)
    discs.push({ id: IDS[i], cx, cy, r })
    inputs.push({ id: IDS[i], x: cx, y: cy, r, w: WIDTHS[i], h: PLATE_H, side: i % 2 === 0 ? 'below' : 'above', depth })
  })
  return { discs, inputs }
}

interface Rect { left: number; top: number; w: number; h: number }
const right = (r: Rect) => r.left + r.w
const bottom = (r: Rect) => r.top + r.h

/** Distance from a disc's edge to the nearest point of a rect (negative when they intersect). */
function discToRect(d: Disc, r: Rect): number {
  const nx = Math.max(r.left, Math.min(right(r), d.cx))
  const ny = Math.max(r.top, Math.min(bottom(r), d.cy))
  return Math.hypot(nx - d.cx, ny - d.cy) - d.r
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < right(b) && right(a) > b.left && a.top < bottom(b) && bottom(a) > b.top
}

describe('layoutSpineBands on the real camera', () => {
  for (const height of HEIGHTS) {
    for (const width of WIDTHS_PX) {
      describe(`${width} × ${height}`, () => {
        const { discs, inputs } = project(width, height)
        const placed = layoutSpineBands(inputs, width, height, undefined, { captionBottom: CAPTION_BOTTOM })
        const byId = new Map(placed.map((p) => [p.id, p]))

        // The 120 px compact band cannot hold the caption row, two plate rows, the discs and every
        // clearance; there the rows squeeze toward the discs and may TOUCH one, never cover it.
        const clearance = height >= 168 ? BAND_CLEARANCE : -SQUEEZE_MAX

        it('places every plate inside the host and clear of every station disc', () => {
          expect(placed.map((p) => p.id).sort()).toEqual([...IDS].sort())
          for (const p of placed) {
            expect(p.left).toBeGreaterThanOrEqual(0)
            expect(right(p)).toBeLessThanOrEqual(width + 1e-6)
            expect(p.top).toBeGreaterThanOrEqual(0)
            expect(bottom(p)).toBeLessThanOrEqual(height + 1e-6)
            for (const d of discs) expect(discToRect(d, p), `${p.id} vs disc ${d.id}`).toBeGreaterThanOrEqual(clearance - 1e-6)
          }
        })

        it('keeps the Build plate off its knot, whose reach is wider than a ring', () => {
          const build = byId.get('build')!
          const knot = discs.find((d) => d.id === 'build')!
          expect(knot.r).toBeGreaterThan(discs[0].r)
          expect(discToRect(knot, build)).toBeGreaterThanOrEqual(clearance - 1e-6)
        })

        it('keeps every plate below the caption row and at least NEIGHBOUR_GAP from the next plate', () => {
          for (const p of placed) expect(p.top, p.id).toBeGreaterThanOrEqual(CAPTION_BOTTOM + LABEL_GAP - 1e-6)
          for (const a of placed) {
            for (const b of placed) {
              if (a.id === b.id) continue
              expect(rectsOverlap(a, b), `${a.id} overlaps ${b.id}`).toBe(false)
              // Same row → a sideways gap of at least NEIGHBOUR_GAP.
              if (Math.abs(a.top - b.top) < PLATE_H) {
                const gap = a.left < b.left ? b.left - right(a) : a.left - right(b)
                expect(gap, `${a.id} | ${b.id}`).toBeGreaterThanOrEqual(NEIGHBOUR_GAP - 1e-6)
              }
            }
          }
        })

        if (height >= 168) {
          it('is two level bands: odd stations above the rail in one row, even stations below in another', () => {
            const upper = placed.filter((p) => p.side === 'above')
            const lower = placed.filter((p) => p.side === 'below')
            expect(upper.map((p) => p.id).sort()).toEqual(IDS.filter((_, i) => i % 2 === 1).sort())
            expect(lower.map((p) => p.id).sort()).toEqual(IDS.filter((_, i) => i % 2 === 0).sort())
            // Level: one bottom edge for the upper row, one top edge for the lower row.
            expect(new Set(upper.map((p) => bottom(p).toFixed(3))).size).toBe(1)
            expect(new Set(lower.map((p) => p.top.toFixed(3))).size).toBe(1)
            // The upper row is above every disc, the lower row below every disc.
            const discTop = Math.min(...discs.map((d) => d.cy - d.r))
            const discBottom = Math.max(...discs.map((d) => d.cy + d.r))
            for (const p of upper) expect(bottom(p)).toBeLessThanOrEqual(discTop - BAND_CLEARANCE + 1e-6)
            for (const p of lower) expect(p.top).toBeGreaterThanOrEqual(discBottom + BAND_CLEARANCE - 1e-6)
          })

          it('stays centred on its station unless a neighbour forced a sideways nudge, and only a nudged or far plate gets a leader', () => {
            // A plate may move only as part of a cluster: a chain of same-row plates whose natural
            // (station-centred) boxes would meet, or which the host's edge pushed into one another.
            const natural = (p: Rect & { id: string }) => {
              const d = discs.find((x) => x.id === p.id)!
              return { left: d.cx - p.w / 2, right: d.cx + p.w / 2 }
            }
            const free = (p: (typeof placed)[number]) => {
              const me = natural(p)
              if (me.left < 0 || me.right > width) return false
              return !placed.some((q) => {
                if (q.id === p.id || Math.abs(q.top - p.top) >= PLATE_H) return false
                const other = natural(q)
                const touches = me.left - NEIGHBOUR_GAP < other.right && me.right + NEIGHBOUR_GAP > other.left
                return touches || other.left < 0 || other.right > width
              })
            }
            for (const p of placed) {
              const d = discs.find((x) => x.id === p.id)!
              const nudge = Math.abs(p.left + p.w / 2 - d.cx)
              if (free(p)) expect(nudge, p.id).toBeLessThan(0.5)
              const gapToOwn = p.side === 'below' ? p.top - (d.cy + d.r) : d.cy - d.r - bottom(p)
              if (nudge < 4 && gapToOwn < BAND_CLEARANCE + 8) expect(p.displaced, p.id).toBe(false)
              if (nudge >= 4) expect(p.displaced, p.id).toBe(true)
            }
          })
        } else {
          it('(compact) still alternates where it can and never piles a plate on a disc', () => {
            expect(placed.filter((p) => p.side === 'below').length).toBeGreaterThanOrEqual(5)
          })
        }
      })
    }
  }

  it('grows the hovered plate in place from its anchor edge and moves no other plate', () => {
    const width = 724, height = 168
    const { inputs } = project(width, height)
    const rest = layoutSpineBands(inputs, width, height, undefined, { captionBottom: CAPTION_BOTTOM })
    for (const id of ['2', '3']) {
      const hovered = layoutSpineBands(inputs, width, height, { id, w: 240, h: 104 }, { captionBottom: CAPTION_BOTTOM })
      for (const p of hovered) {
        const before = rest.find((r) => r.id === p.id)!
        if (p.id !== id) { expect(p).toEqual(before); continue }
        expect(p.w).toBe(240)
        expect(p.h).toBe(104)
        // Grown from its anchor edge, then the minimum shift that keeps it inside the host.
        const grown = before.side === 'below' ? before.top : before.top + before.h - 104
        expect(p.top).toBe(Math.max(0, Math.min(height - 104, grown)))
        expect(p.left).toBeGreaterThanOrEqual(0)
        expect(p.left + p.w).toBeLessThanOrEqual(width)
      }
    }
  })

  it('is deterministic and empty for no plates', () => {
    const { inputs } = project(724, 168)
    expect(layoutSpineBands(inputs, 724, 168)).toEqual(layoutSpineBands([...inputs].reverse(), 724, 168))
    expect(layoutSpineBands([], 724, 168)).toEqual([])
  })
})

describe('group captions', () => {
  const stations = IDS.map((id, index) => ({ id, index, kind: 'later', stage_state: 'later', isBuild: id === 'build', isCurrent: false }) as unknown as Station)
  const data = { stations } as unknown as SceneDataSpine

  it('pins FOUNDATION over the centre of stations 0–3, BUILD over the knot, SHIP over 5–7 and CLOSE over the last, within 2 px', () => {
    for (const [width, height] of [[724, 168], [1400, 168], [640, 200]]) {
      const { discs } = project(width, height)
      const points = stationVectors(IDS.length)
      const camera = cameraFor(IDS.length, width, height)
      const out = { x: 0, y: 0, visible: false, depth: 0 }
      const captions = groupCaptions(data)
      expect(captions.map((c) => [c.label, c.from, c.to])).toEqual([['Foundation', 0, 3], ['Build', 4, 4], ['Ship', 5, 7], ['Close', 8, 8]])
      for (const c of captions) {
        const anchor = captionAnchor(c, points)!
        projectPoint(anchor, camera, width, height, out, new Vector3())
        const centre = (discs[c.from].cx + discs[c.to].cx) / 2
        expect(Math.abs(out.x - centre), `${c.label} @ ${width}×${height}`).toBeLessThan(2)
      }
    }
  })
})

describe('spreadRow', () => {
  it('leaves plates that fit centred on their stations', () => {
    const lefts = spreadRow([{ id: 'a', cx: 100, w: 60 }, { id: 'b', cx: 300, w: 60 }], 800)
    expect(lefts.get('a')).toBe(70)
    expect(lefts.get('b')).toBe(270)
  })
  it('nudges a touching pair apart symmetrically, as a cluster centred on the pair', () => {
    const lefts = spreadRow([{ id: 'a', cx: 100, w: 100 }, { id: 'b', cx: 180, w: 100 }], 800)
    // Cluster width 208 centred on 140 → a at 36, b at 144; each moved 14 px, opposite ways.
    expect(lefts.get('a')).toBe(36)
    expect(lefts.get('b')).toBe(144)
    expect(lefts.get('b')! - (lefts.get('a')! + 100)).toBe(NEIGHBOUR_GAP)
  })
  it('keeps a cluster inside the host and merges onward when the clamp makes it touch the next', () => {
    const lefts = spreadRow([{ id: 'a', cx: 20, w: 100 }, { id: 'b', cx: 60, w: 100 }, { id: 'c', cx: 230, w: 100 }], 800)
    expect(lefts.get('a')).toBe(0)
    expect(lefts.get('b')).toBe(108)
    expect(lefts.get('c')).toBe(216)
  })
})
