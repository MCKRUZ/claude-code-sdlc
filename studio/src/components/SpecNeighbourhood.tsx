import { useMemo, useRef, type MouseEvent } from 'react'
import { Flip } from 'gsap/Flip'
import type { BoardRow } from '../../shared/types'
import { Card, Eyebrow, cn } from '../ui'
import { motion } from '../motion/motion'
import { flipStore } from '../motion/flipStore'
import { contextFrom, edgeDraw } from '../motion/choreo'
import { useStudioGSAP } from '../motion/useStudioGSAP'
import { useBacklogStore } from '../stores/backlogStore'
import { buildNeighbourhood, edgePath, nodeName, type NeighbourNode } from '../scenes/constellation/neighbourhood'

export const NEIGHBOURHOOD_EMPTY = "Open the Board once to see this spec's neighbourhood"
export const NEIGHBOURHOOD_LEGEND = 'Left: what this spec depends on. Right: what depends on it. Size is the risk tier; colour is the plugin\'s status word (ready teal · in-flight blue · merged green · deferred grey); a dashed amber ring is its NOT READY; a dashed body is a spec the Board has not shown.'

/** I7 — where this spec sits among its dependencies (studio-upgrade-2 §4 P3). Inline SVG for the
 * edges and HTML buttons for the bodies, laid over the same viewBox: no canvas, no second WebGL
 * context, and every body is a real button a reader can reach. The data is whatever the Board or
 * Sprint last fetched into `backlogStore` — the screen fetches nothing of its own, so an empty
 * store says so instead of drawing an empty sky. Edges draw in over 220 ms (`edgeDraw`); off and
 * reduced motion end in the same DOM a cold reload paints. */
export function SpecNeighbourhood({
  row,
  onOpenSpec,
  rowFor,
}: {
  row: BoardRow
  /** Opens a neighbour; null when this screen cannot open another spec. */
  onOpenSpec: ((row: BoardRow) => void) | null
  /** The row to open for a neighbour id, or null when the store does not know it. */
  rowFor: (id: string) => BoardRow | null
}) {
  const { rows, slate } = useBacklogStore()
  const figure = useRef<HTMLElement>(null)
  const hood = useMemo(() => buildNeighbourhood(row, rows, slate), [row, rows, slate])
  const edgeKey = hood ? hood.edges.map((e) => `${e.from}>${e.to}`).join('|') : ''

  useStudioGSAP(() => {
    const scope = figure.current
    if (!scope || !hood) return
    const edges = Array.from(scope.querySelectorAll<SVGPathElement>('[data-edge]'))
    edgeDraw.play(contextFrom(scope, { enabled: motion.enabled(), reduced: motion.reduced() }, motion), { edges })
  }, { scope: figure, dependencies: [edgeKey] })

  if (!hood) {
    return (
      <Card as="section" aria-label="Neighbourhood">
        <Eyebrow as="h3">Neighbourhood</Eyebrow>
        <p className="mt-1.5 text-sm text-ink-3">{NEIGHBOURHOOD_EMPTY}</p>
      </Card>
    )
  }

  const open = (node: NeighbourNode, e: MouseEvent<HTMLButtonElement>) => {
    const target = onOpenSpec && rowFor(node.id)
    if (!target) return
    // Row #8: the node stashes its state under `spec:<id>` so the next title Flips from it.
    if (motion.enabled()) flipStore.stash(`spec:${node.id}`, Flip.getState(e.currentTarget), e.currentTarget)
    onOpenSpec(target)
  }

  const nodes = [...hood.dependencies, hood.centre, ...hood.dependents]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return (
    <Card as="section" aria-label="Neighbourhood" padding="md">
      <Eyebrow as="h3">Neighbourhood</Eyebrow>
      <figure ref={figure} className="m-0 mt-2" data-testid="spec-neighbourhood">
        <div className="relative w-full" style={{ aspectRatio: `${hood.width} / ${hood.height}` }}>
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${hood.width} ${hood.height}`}
            preserveAspectRatio="none"
          >
            {hood.edges.map((edge) => {
              const from = byId.get(edge.from)
              const to = byId.get(edge.to)
              if (!from || !to) return null
              return (
                <path
                  key={`${edge.from}>${edge.to}`}
                  data-edge=""
                  d={edgePath(from, to)}
                  fill="none"
                  stroke={edge.ghost ? 'var(--color-ink-4)' : 'var(--color-line-2)'}
                  strokeWidth={1.25}
                  strokeDasharray={edge.ghost ? '3 3' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          {nodes.map((node) => {
            const side = hood.dependencies.includes(node) ? 'left' : hood.dependents.includes(node) ? 'right' : 'centre'
            return <NodeButton key={node.id} node={node} side={side} centre={node === hood.centre} onOpen={node !== hood.centre && onOpenSpec && rowFor(node.id) ? open : null} width={hood.width} height={hood.height} />
          })}
        </div>
        <figcaption className="mt-2 text-xs text-ink-3">{NEIGHBOURHOOD_LEGEND}</figcaption>
      </figure>
    </Card>
  )
}

function NodeButton({
  node, side, centre, onOpen, width, height,
}: {
  node: NeighbourNode
  side: 'left' | 'right' | 'centre'
  centre: boolean
  onOpen: ((node: NeighbourNode, e: MouseEvent<HTMLButtonElement>) => void) | null
  width: number
  height: number
}) {
  const diameter = Math.round(node.r * 2)
  const body = (
    <span
      aria-hidden="true"
      data-not-ready={node.ringToken ? '' : undefined}
      className={cn('block shrink-0 rounded-full', node.ghost && 'border border-dashed border-ink-4 bg-transparent', centre && 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface-1')}
      style={{
        width: diameter,
        height: diameter,
        backgroundColor: node.ghost ? undefined : `var(--color-${node.colorToken})`,
        // The plugin's NOT READY as a SHAPE cue (a dashed warn ring), the body keeping its status colour.
        outline: node.ringToken ? `1px dashed var(--color-${node.ringToken})` : undefined,
        outlineOffset: node.ringToken ? 2 : undefined,
      }}
    />
  )
  // Two lines at most, never a cut word: the id in the ident face, the name beneath it.
  const label = (
    <span className={cn('block max-w-[7.5rem] text-xs leading-4', node.ghost ? 'text-ink-3' : 'text-ink-1')}>
      <span className="block font-mono text-ident tabular-nums">{node.id}</span>
      {node.label && <span className="line-clamp-2 block text-ink-3">{node.label}</span>}
    </span>
  )
  const reason = onOpen ? null : centre ? 'This is the spec you are reading.' : 'Open the Board once to open this spec from here.'
  // Anchored at the node's centre; the label hangs off the side the column faces so it never
  // crosses an edge.
  const style = {
    left: `${(node.x / width) * 100}%`,
    top: `${(node.y / height) * 100}%`,
    transform: side === 'left' ? 'translate(calc(-100% + ' + node.r + 'px), -50%)' : side === 'right' ? `translate(-${node.r}px, -50%)` : 'translate(-50%, -50%)',
  }
  return (
    <button
      type="button"
      data-neighbour={node.id}
      data-ghost={node.ghost || undefined}
      data-pressable=""
      aria-label={nodeName(node)}
      aria-disabled={onOpen ? undefined : 'true'}
      title={reason ?? undefined}
      onClick={onOpen ? (e) => onOpen(node, e) : undefined}
      className={cn(
        'absolute flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left',
        side === 'left' && 'flex-row-reverse',
        side === 'centre' && 'flex-col',
        onOpen ? 'hover:bg-surface-2' : 'cursor-default',
      )}
      style={style}
    >
      {body}
      {label}
    </button>
  )
}
