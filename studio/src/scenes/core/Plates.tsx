// The labels (studio-observatory.md §5.0 `Plates`): two halves of one component.
//
// `Plates` lives INSIDE the R3F tree. It pushes the plate list (and any captions) into the
// Canvas's `PlateStore` when the data changes and, on every demand frame, projects each anchor
// through the camera and writes the result straight onto the registered elements — refs, no
// React state per frame.
//
// `PlateLayer` lives in the DOM beside the canvas (CanvasHost mounts it, outside the aria-hidden
// wrapper). It renders the `<ul>` of absolutely positioned `<li><button>`s: real buttons, so they
// are clickable, focusable and read by AT, and hovering or focusing one sets the shared hover id
// so keyboard users get the same 3D emphasis as the pointer. The accessible name is always
// "<kind> <id>: <title>", never a bare id. Beneath the list sits one `<svg>` of leader lines, one
// per plate, shown only for a plate the layout had to push away from its body; and the captions
// are plain `aria-hidden` spans (the table surface carries the same words).
import { useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { PlateLayerContext } from './canvasActivity'
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
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const scratch = useMemo(() => ({ point: new Vector3(), up: new Vector3() }), [])
  const out = useRef<Projected>({ x: 0, y: 0, visible: false, depth: 0 })

  useEffect(() => {
    store?.setItems(items)
    return () => store?.setItems([])
  }, [store, items])

  useEffect(() => {
    store?.setCaptions(captions)
    return () => store?.setCaptions([])
  }, [store, captions])

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
              className="absolute left-0 top-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4 will-change-transform"
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="pointer-events-none absolute inset-0 m-0 list-none overflow-hidden p-0" data-scene-plates="">
          {items.map((item) => {
            const expanded = hoverId === item.id
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
                  aria-label={`${item.kind} ${item.id}: ${item.title}`}
                  aria-expanded={item.lines && item.lines.length > 0 ? expanded : undefined}
                  onMouseEnter={() => onHover(item.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(item.id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onActivate(item.id)}
                  className={[
                    // Opaque and crisp: one shadow step, no blur (forty blurred plates cost GPU and
                    // softened the text). Focus comes from the global --ring, not a bespoke outline.
                    'flex flex-col items-start gap-0.5 rounded-[6px] border border-line-1 bg-surface-raised/95 px-2 py-[3px] text-left text-xs text-ink-1 shadow-1',
                    expanded ? 'max-w-64 shadow-2' : 'max-w-56',
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
                    {item.meta !== undefined ? <span className="font-mono text-2xs tabular-nums text-ink-4">{item.meta}</span> : null}
                    <span className="font-medium">{item.title}</span>
                  </span>
                  {expanded && item.lines && item.lines.length > 0 ? (
                    <span className="flex flex-col gap-0.5 whitespace-normal text-ink-2">
                      {item.lines.map((line, i) => (
                        <span key={i} className="line-clamp-1" title={line}>{line}</span>
                      ))}
                      <span className="mt-0.5 text-[11px] font-medium text-accent-700">Open ↵</span>
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
