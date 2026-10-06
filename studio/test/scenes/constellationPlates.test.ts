// @vitest-environment jsdom
/** The plate store as the scene drives it each frame (studio-observatory.md §5.0 `Plates`): a
 * real camera projects two bodies whose collapsed labels would collide, the store stacks them,
 * and then one plate expands on hover. The promise (observatory v4 critique, sprint-graph-hover):
 * hover changes only the hovered plate's rectangle — the other plate's transform is byte-identical
 * before and after, and it stays identical when the hover ends. */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { PlateItem } from '../../src/scenes/core/projectLabels'
import { PlateStore } from '../../src/scenes/core/projectLabels'

const W = 724, H = 360

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(40, W / H, 0.1, 80)
  cam.position.set(0, 2.6, 11)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  return cam
}

/** A registered `<li>` with a measurable box; jsdom has no layout, so the size is declared. */
function li(w: number, h: number, expanded = false): HTMLLIElement {
  const el = document.createElement('li')
  Object.defineProperty(el, 'offsetWidth', { value: w, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: h, configurable: true })
  if (expanded) el.dataset.expanded = ''
  else delete el.dataset.expanded
  return el
}

function item(id: string, x: number, z: number): PlateItem {
  return { id, kind: 'Spec', title: id, anchor: new Vector3(x, 0, z), anchorRadius: 0.35, side: 'below' }
}

function resize(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, 'offsetWidth', { value: w, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: h, configurable: true })
}

describe('PlateStore under hover', () => {
  it('expanding one plate leaves every other plate\'s transform unchanged, and collapsing restores it', () => {
    const store = new PlateStore()
    // Two bodies close enough that their 120 px labels overlap: the farther one is stacked under.
    const items = [item('0004', -0.4, 1.5), item('0005', 0.4, -0.5)]
    store.setItems(items)
    const a = li(120, 22), b = li(120, 22)
    store.register('0004', a)
    store.register('0005', b)
    const cam = camera()
    const out = { x: 0, y: 0, visible: false, depth: 0 }
    const scratch = new Vector3(), up = new Vector3()
    up.setFromMatrixColumn(cam.matrixWorld, 1)

    store.project(cam, W, H, out, scratch, up)
    const restingA = a.style.transform, restingB = b.style.transform
    expect(restingA).not.toBe('')
    expect(restingB).not.toBe('')
    expect(restingA).not.toBe(restingB)

    // Hover 0004: it is drawn expanded, so it measures much larger.
    a.dataset.expanded = ''
    resize(a, 240, 84)
    store.project(cam, W, H, out, scratch, up)
    expect(b.style.transform).toBe(restingB)
    expect(a.style.transform).toBe(restingA)
    expect(a.style.zIndex > b.style.zIndex || Number(a.style.zIndex) > Number(b.style.zIndex)).toBe(true)

    // Hover ends: both back exactly where they rested.
    delete a.dataset.expanded
    resize(a, 120, 22)
    store.project(cam, W, H, out, scratch, up)
    expect(a.style.transform).toBe(restingA)
    expect(b.style.transform).toBe(restingB)
  })

  it('the expanded plate is drawn solid — opacity 1 whatever its depth — and returns to the depth ramp when it collapses', () => {
    // Observatory v9 sprint-graph-hover: the hovered (far) plate was drawn at the depth ramp's .55,
    // so the edges and the neighbouring plate showed through its own text.
    const store = new PlateStore()
    store.setItems([item('0004', -0.4, 1.5), item('0005', 0.4, -0.5)])
    const a = li(120, 22), b = li(120, 22)
    store.register('0004', a)
    store.register('0005', b)
    const cam = camera()
    const out = { x: 0, y: 0, visible: false, depth: 0 }
    const scratch = new Vector3(), up = new Vector3()
    up.setFromMatrixColumn(cam.matrixWorld, 1)
    store.project(cam, W, H, out, scratch, up)
    // 0005 is the farther body: at rest the depth ramp holds it below full strength.
    const restingB = b.style.opacity
    expect(Number(restingB)).toBeLessThan(1)
    expect(Number(restingB)).toBeGreaterThan(0)

    b.dataset.expanded = ''
    resize(b, 240, 84)
    store.project(cam, W, H, out, scratch, up)
    expect(b.style.opacity).toBe('1')
    // …and it sits above the other plate, whatever their depths.
    expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex))

    delete b.dataset.expanded
    resize(b, 120, 22)
    store.project(cam, W, H, out, scratch, up)
    expect(b.style.opacity).toBe(restingB)
  })

  it('an expanded plate shifts only as far as the host edge demands', () => {
    const store = new PlateStore()
    // One body far right: its collapsed plate is already clamped to the right edge.
    store.setItems([item('0006', 4.2, 0)])
    const el = li(120, 22)
    store.register('0006', el)
    const cam = camera()
    const out = { x: 0, y: 0, visible: false, depth: 0 }
    const scratch = new Vector3(), up = new Vector3()
    up.setFromMatrixColumn(cam.matrixWorld, 1)
    store.project(cam, W, H, out, scratch, up)
    const parse = (t: string) => ({ left: Number(/translate3d\(([-\d.]+)px/.exec(t)![1]), scale: Number(/scale\(([\d.]+)\)/.exec(t)![1]) })
    const resting = parse(el.style.transform)
    el.dataset.expanded = ''
    resize(el, 260, 84)
    store.project(cam, W, H, out, scratch, up)
    const expanded = parse(el.style.transform)
    // The box is the measured width at the depth scale the plate is drawn at. Pulled left exactly
    // enough for it to end at the host's right edge, never more.
    const drawnWidth = 260 * expanded.scale
    expect(expanded.scale).toBe(resting.scale)
    expect(expanded.left).toBeLessThanOrEqual(resting.left)
    expect(expanded.left + drawnWidth).toBeLessThanOrEqual(W + 0.15)
    expect(expanded.left).toBeCloseTo(Math.min(resting.left, W - drawnWidth), 0)
  })
})
