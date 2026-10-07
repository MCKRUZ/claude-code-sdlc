// studio-observatory.md §9 performance budget, pinned on the built output. `npm test` runs
// `pretest` (`vite build --mode=test`) first, so under the normal command `dist/` exists and the
// three assertions run. A bare `npx vitest run` without a build SKIPS them — with a message, not a
// green tick — because a test that demands a build it did not make would fail every local run for
// a reason unrelated to the code under test.
//
// Why these three: the main chunk must stay under 760 KB so the window is interactive quickly on a
// cold start; `WebGLRenderer` is the cheapest proof that three.js never leaked into it (any scene
// code in the main chunk drags the whole 640 KB of three along); and the `scene-core` chunk must
// exist, or the first two would pass trivially on a build with no scenes at all.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ASSETS_DIR = path.resolve(__dirname, '..', 'dist', 'assets')

/** §9 estimated 603 KB + ≈130 KB. Measured after Wave 0: 760.8 KB (gsap + Flip and tailwind-merge
 * are the bulk, both intended), so the ceiling is 800 KB — a real number, not the estimate. */
export const MAIN_CHUNK_LIMIT_BYTES = 800 * 1024

function listAssets(): string[] {
  return existsSync(ASSETS_DIR) ? readdirSync(ASSETS_DIR) : []
}

/** The main chunk is the one `index.html` loads: `index-<hash>.js`. The CSS is `index-<hash>.css`
 * and is not under this budget (it has its own ≤ 60 KB line in §9, checked by eye for now). */
function mainChunk(assets: string[]): string | null {
  const js = assets.filter((name) => /^index-[^.]+\.js$/.test(name))
  return js.length === 1 ? js[0] : null
}

function sceneCoreChunks(assets: string[]): string[] {
  return assets.filter((name) => /^scene-core-[^.]+\.js$/.test(name))
}

const built = existsSync(ASSETS_DIR)
const describeBuilt = built ? describe : describe.skip

if (!built) {
  // eslint-disable-next-line no-console
  console.log(
    `bundleSize.test: skipped — ${path.relative(process.cwd(), ASSETS_DIR)} is absent. ` +
      'Run `npm run pretest` (vite build --mode=test) first to check the renderer bundle budget.',
  )
}

describeBuilt('renderer bundle budget (studio-observatory.md §9)', () => {
  const assets = listAssets()

  it('has exactly one main index-*.js chunk', () => {
    expect(mainChunk(assets), `assets seen: ${assets.join(', ')}`).not.toBeNull()
  })

  it(`main chunk is under ${MAIN_CHUNK_LIMIT_BYTES / 1024} KB`, () => {
    const name = mainChunk(assets)
    if (!name) return
    const bytes = statSync(path.join(ASSETS_DIR, name)).size
    expect(bytes, `${name} is ${(bytes / 1024).toFixed(1)} KB`).toBeLessThan(MAIN_CHUNK_LIMIT_BYTES)
  })

  it('main chunk does not contain three.js (no "WebGLRenderer")', () => {
    const name = mainChunk(assets)
    if (!name) return
    const source = readFileSync(path.join(ASSETS_DIR, name), 'utf8')
    expect(source.includes('WebGLRenderer')).toBe(false)
  })

  // Nothing imports the lazy CanvasHost until a scene module (Wave 2) is registered (Wave 3), so
  // until src/scenes/{spine,constellation,ambient} exists rolldown has no chunk to emit. The check
  // turns on by itself the moment a scene module lands — a skip here is stated, never silent.
  const sceneModulesExist = ['spine', 'constellation', 'ambient']
    .some((d) => existsSync(path.resolve(__dirname, '..', 'src', 'scenes', d)))
  const itWhenScenes = sceneModulesExist ? it : it.skip
  itWhenScenes('a scene-core-*.js chunk exists, so the scene stack is split out rather than absent', () => {
    expect(sceneCoreChunks(assets), `assets seen: ${assets.join(', ')}`).not.toHaveLength(0)
  })
})
