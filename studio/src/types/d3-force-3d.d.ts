// d3-force-3d ships no types. Only the surface Studio uses is declared — a force simulation over
// plain node objects with x/y/z, used purely for LAYOUT (where a node sits on screen), never for a
// judgement about the work the node represents.
declare module 'd3-force-3d' {
  export interface SimulationNode { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number; fx?: number | null; fy?: number | null; fz?: number | null; index?: number }
  export interface SimulationLink<N extends SimulationNode = SimulationNode> { source: N | string | number; target: N | string | number; index?: number }
  export interface Force<N extends SimulationNode> { (alpha: number): void; initialize?(nodes: N[], random?: () => number, numDimensions?: number): void }
  export interface Simulation<N extends SimulationNode> {
    nodes(): N[]
    nodes(nodes: N[]): this
    alpha(): number
    alpha(a: number): this
    alphaMin(): number
    alphaMin(a: number): this
    alphaDecay(): number
    alphaDecay(a: number): this
    alphaTarget(): number
    alphaTarget(a: number): this
    velocityDecay(): number
    velocityDecay(a: number): this
    force(name: string): Force<N> | undefined
    force(name: string, force: Force<N> | null): this
    tick(iterations?: number): this
    restart(): this
    stop(): this
    numDimensions(): number
    numDimensions(n: number): this
    randomSource(fn: () => number): this
    on(type: 'tick' | 'end', listener: ((this: Simulation<N>) => void) | null): this
  }
  export function forceSimulation<N extends SimulationNode>(nodes?: N[], numDimensions?: number): Simulation<N>
  export function forceLink<N extends SimulationNode, L extends SimulationLink<N>>(links?: L[]): Force<N> & {
    links(): L[]; links(l: L[]): ReturnType<typeof forceLink<N, L>>
    id(fn: (node: N, i: number, nodes: N[]) => string | number): ReturnType<typeof forceLink<N, L>>
    distance(d: number | ((link: L, i: number, links: L[]) => number)): ReturnType<typeof forceLink<N, L>>
    strength(s: number | ((link: L, i: number, links: L[]) => number)): ReturnType<typeof forceLink<N, L>>
    iterations(n: number): ReturnType<typeof forceLink<N, L>>
  }
  export function forceManyBody<N extends SimulationNode>(): Force<N> & {
    strength(s: number | ((node: N, i: number, nodes: N[]) => number)): ReturnType<typeof forceManyBody<N>>
    distanceMin(d: number): ReturnType<typeof forceManyBody<N>>
    distanceMax(d: number): ReturnType<typeof forceManyBody<N>>
    theta(t: number): ReturnType<typeof forceManyBody<N>>
  }
  export function forceCenter<N extends SimulationNode>(x?: number, y?: number, z?: number): Force<N> & { strength(s: number): ReturnType<typeof forceCenter<N>> }
  export function forceCollide<N extends SimulationNode>(radius?: number | ((node: N, i: number, nodes: N[]) => number)): Force<N> & {
    radius(r: number | ((node: N, i: number, nodes: N[]) => number)): ReturnType<typeof forceCollide<N>>
    strength(s: number): ReturnType<typeof forceCollide<N>>
    iterations(n: number): ReturnType<typeof forceCollide<N>>
  }
  export function forceX<N extends SimulationNode>(x?: number | ((node: N) => number)): Force<N> & { strength(s: number | ((node: N) => number)): ReturnType<typeof forceX<N>> }
  export function forceY<N extends SimulationNode>(y?: number | ((node: N) => number)): Force<N> & { strength(s: number | ((node: N) => number)): ReturnType<typeof forceY<N>> }
  export function forceZ<N extends SimulationNode>(z?: number | ((node: N) => number)): Force<N> & { strength(s: number | ((node: N) => number)): ReturnType<typeof forceZ<N>> }
  export function forceRadial<N extends SimulationNode>(radius: number | ((node: N) => number), x?: number, y?: number, z?: number): Force<N> & { strength(s: number | ((node: N) => number)): ReturnType<typeof forceRadial<N>> }
}
