// Deterministic hashing for the layout. A spec's id hashes to its STARTING position and the
// project path hashes to its cache key, so the same backlog lays out the same way on every
// machine and every open — a graph that rearranged itself each visit would destroy the spatial
// memory it exists to build. FNV-1a and mulberry32 are tiny, dependency-free and good enough:
// nothing here is security, only reproducibility.

/** 32-bit FNV-1a of a string. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The hash as 8 hex characters — the suffix of `studio.constellation.<hash>`. */
export function hashHex(input: string): string {
  return fnv1a(input).toString(16).padStart(8, '0')
}

/** A seeded PRNG in [0, 1). Fed to d3's `randomSource` so its jiggle is reproducible too. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A starting point for one id, inside a 6 × 4 × 1 slab centred on the origin. */
export function seededPosition(id: string): [number, number, number] {
  const rand = mulberry32(fnv1a(id))
  return [(rand() - 0.5) * 6, (rand() - 0.5) * 4, (rand() - 0.5) * 1]
}
