// The labels (studio-observatory.md §5.0 `Plates`): two halves of one component.
//
// `Plates` lives INSIDE the R3F tree. It pushes the plate list (and any captions) into the
// Canvas's `PlateStore` when the data changes and, on every demand frame, projects each anchor
// through the camera and writes the result straight onto the registered elements — refs, no
// React state per frame. Round 2 (I5): it also tweens the store's `siblingDim` when a plate
// expands, so the other plates step back to .55 over 160 ms (instant with motion off).
//
// `PlateLayer` lives in the DOM beside the canvas (CanvasHost mounts it, outside the aria-hidden
// wrapper). It renders the `<ul>` of absolutely positioned `<li><button>`s: real buttons, so they
// are clickable, focusable and read by AT, and hovering or focusing one sets the shared hover id
// so keyboard users get the same 3D emphasis as the pointer. The accessible name is always
// "<kind> <id>: <title>", never a bare id. Beneath the list sits one `<svg>` of leader lines, one
// per plate, shown only for a plate the layout had to push away from its body; and the captions
// are plain `aria-hidden` spans (the table surface carries the same words). Round 2 (M7): an
// expanding plate grows from its last collapsed box over `FLIP_PLATE` (size only, never a scale);
// the list is `overflow-visible` with a −8 px clip so the 4 px focus ring is never cut.
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { gsap } from 'gsap'
import { Vector3 } from 'three'
import { motion } from '../../motion/motion'
import { FLIP_PLATE } from '../../motion/presets'
import { EYEBROW_CLASS } from '../../ui/Eyebrow'
import { PlateInteractionContext, PlateLayerContext } from './canvasActivity'
import { SIBLING_DIM_S } from './projectLabels'
import type { CaptionItem, PlateItem, PlateLayout, PlateStore, Projected } from './projectLabels'

export interface PlatesProps {
  items: PlateItem[]
  captions?: CaptionItem[]
  /** A scene's own placement (the Spine's two bands); absent → the default greedy stack. */
  layout?: PlateLayout
}

const NO_CAPTIONS: CaptionItem[] = []

/** In-canvas half: owns projection. Render once per scene with the current plate list. */
export function Plates({ items, captions = NO_CAPTIONS, layout }: PlatesProps) {
  const store = useContext(PlateLayerContext)
  const { hoverId } = useContext(PlateInteractionContext)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const scratch = useMemo(() => ({ point: new Vector3(), up: new Vector3() }), [])
  const out = useRef<Projected>({ x: 0, y: 0, visible: false, depth: 0 })
  const dim = useRef<{ v: number }>({ v: 0 })

  useEffect(() => {
    store?.setItems(items)
    return () => store?.setItems([])
  }, [store, items])

  useEffect(() => {
    store?.setCaptions(captions)
    return () => store?.setCaptions([])
  }, [store, captions])

  // Sibling dim (I5): 0 → 1 while a plate is expanded, back to 0 when none is. Motion off: the
  // end state at once. The store reads `siblingDim` on the next projection; `invalidate` asks for it.
  useEffect(() => {
    if (!store) return
    const expanded = hoverId !== null && items.some((i) => i.id === hoverId)
    const target = expanded ? 1 : 0
    const apply = () => { store.siblingDim = dim.current.v; invalidate() }
    if (!motion.enabled()) { dim.current.v = target; apply(); return }
    const tween = gsap.to(dim.current, { v: target, duration: SIBLING_DIM_S, ease: 'power2.out', overwrite: true, onUpdate: apply, onComplete: apply })
    return () => { tween.kill() }
  }, [store, hoverId, items, invalidate])

  useFrame(() => {
    // The camera's world up (its matrix's second column) measures a body's projected radius.
    scratch.up.setFromMatrixColumn(camera.matrixWorld, 1)
    store?.project(camera, size.width, size.height, out.current, scratch.point, scratch.up, layout)
  })
  return null
}

export interface PlateLayerProps {
  store: PlateStore
  hoverId: string | null
  onHover: (id: string | null) => void
  onActivate: (id: string) => void
}

const EMPTY: PlateItem[] = []

/** DOM half: the `<ul>` of buttons, positioned by the store each frame. */
export function PlateLayer({ store, hoverId, onHover, onActivate }: PlateLayerProps) {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY)
  const captions = useSyncExternalStore(store.subscribe, store.getCaptions, () => NO_CAPTIONS)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const sizes = useRef(new Map<string, { w: number; h: number }>())
  const lastHover = useRef<string | null>(null)

  // M7: the plate that just expanded grows from its last collapsed box. Measured after every
  // commit, so the previous box is always the one the last frame drew. Size only — `scale: false`
  // — and never under reduced motion (a size change is a layout move).
  useLayoutEffect(() => {
    const prev = lastHover.current
    lastHover.current = hoverId
    const enabled = motion.enabled()
    if (enabled && hoverId !== null && hoverId !== prev) {
      const el = buttons.current.get(hoverId)
      const was = sizes.current.get(hoverId)
      if (el && was && !motion.reduced()) {
        gsap.from(el, { width: was.w, height: was.h, duration: FLIP_PLATE.duration, ease: FLIP_PLATE.ease, overwrite: true, clearProps: 'width,height' })
      }
    }
    for (const [id, el] of buttons.current) sizes.current.set(id, { w: el.offsetWidth, h: el.offsetHeight })
  })

  if (items.length === 0 && captions.length === 0) return null
  return (
    <>
      {items.length > 0 ? (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" data-scene-leaders="">
          {items.map((item) => (
            <line
              key={item.id}
              ref={(el) => store.registerLeader(item.id, el)}
              style={{ visibility: 'hidden' }}
              className="stroke-line-3"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          ))}
        </svg>
      ) : null}
      {captions.length > 0 ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" data-scene-captions="">
          {captions.map((c) => (
            <span
              key={c.id}
              ref={(el) => store.registerCaption(c.id, el)}
              style={{ visibility: 'hidden' }}
              className={`absolute left-0 top-0 whitespace-nowrap will-change-transform ${EYEBROW_CLASS}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
      {items.length > 0 ? (
        // `overflow-visible` + a −8 px clip: the focus ring (4 px) is never cut at the host's edge,
        // and nothing further out than that paints over the page.
        <ul className="pointer-events-none absolute inset-0 m-0 list-none overflow-visible p-0 [clip-path:inset(-8px)]" data-scene-plates="">
          {items.map((item) => {
            const expanded = hoverId === item.id
            const shownTitle = !expanded && item.shortTitle !== undefined ? item.shortTitle : item.title
            const short = shownTitle !== item.title
            return (
              <li
                key={item.id}
                ref={(el) => store.register(item.id, el)}
                className="pointer-events-auto absolute left-0 top-0 will-change-transform"
                style={{ visibility: 'hidden' }}
                data-plate-id={item.id}
                data-expanded={expanded ? '' : undefined}
              >
                <button
                  type="button"
                  ref={(el) => { if (el) buttons.current.set(item.id, el); else buttons.current.delete(item.id) }}
                  aria-label={`${item.kind} ${item.id}: ${item.title}`}
                  aria-expanded={item.lines && item.lines.length > 0 ? expanded : undefined}
                  onMouseEnter={() => onHover(item.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(item.id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onActivate(item.id)}
                  className={[
                    // Crisp: one shadow step, no blur (forty blurred plates cost GPU and softened
                    // the text). Focus comes from the global --ring, not a bespoke outline.
                    'flex flex-col items-start gap-0.5 rounded-[6px] border border-line-1 px-2 py-[3px] text-left text-xs text-ink-1',
                    // Expanded, the plate is a card that is read: OPAQUE `surface-1` and the kit's
                    // raised shadow (the store draws its <li> at opacity 1 and lifts it +2000 on
                    // z-index, above every other plate and the leaders). Collapsed plates keep the
                    // near-opaque raised surface they had.
                    expanded ? 'max-w-64 bg-surface-1 shadow-2' : 'max-w-56 bg-surface-raised/95 shadow-1',
                    item.muted ? 'text-ink-3' : '',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {item.ribbon !== undefined ? (
                      <span className="inline-flex h-4 items-center rounded-[4px] bg-accent-600 px-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">{item.ribbon}</span>
                    ) : null}
                    {item.badge !== undefined ? (
                      <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-[4px] bg-surface-3 px-1 text-[10px] font-semibold tabular-nums text-ink-2">{item.badge}</span>
                    ) : null}
                    {item.meta !== undefined ? <span className="font-mono text-2xs tabular-nums text-ink-3">{item.meta}</span> : null}
                    <span className={short ? 'text-2xs font-medium' : 'font-medium'} data-plate-title={short ? 'short' : 'full'}>{shownTitle}</span>
                  </span>
                  {item.subtitle !== undefined ? (
                    <span className="whitespace-nowrap text-2xs text-ink-3" data-plate-subtitle="">{item.subtitle}</span>
                  ) : null}
                  {expanded && item.lines && item.lines.length > 0 ? (
                    <span className="flex flex-col gap-0.5 whitespace-normal text-ink-2">
                      {item.lines.map((line, i) => (
                        <span key={i} className="line-clamp-1" title={line}>{line}</span>
                      ))}
                      <span className="mt-0.5 text-[11px] font-medium text-accent-text">Open ↵</span>
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}
