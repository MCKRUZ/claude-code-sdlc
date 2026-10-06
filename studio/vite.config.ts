import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'
import { notBundle } from 'vite-plugin-electron/plugin'
import pkg from './package.json'

const external = Object.keys(
  'dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {},
)

/** The 3D scene stack (three ≈ 640 KB, @react-three/fiber ≈ 120 KB, d3-force-3d ≈ 35 KB, and
 * three's `examples/jsm/lines` which lives under the same `three` package folder) goes into one
 * `scene-core` chunk — studio-observatory.md §9. The scenes themselves are only ever reached by
 * an `import()` inside `SceneShell`, so this chunk is fetched on the first Canvas mount and never
 * by a session that stays on tables; the main `index-*.js` chunk must keep under 760 KB and must
 * not contain `WebGLRenderer` at all (`test/bundleSize.test.ts` pins both). Rolldown's
 * `codeSplitting.groups` is the Vite 8 replacement for rollup's `manualChunks`. */
const SCENE_CORE_TEST = /node_modules[\\/](three|@react-three[\\/]fiber|d3-force-3d)[\\/]/

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
      },
    },
    build: {
      // The scene-core chunk is ≈ 800 KB minified by design; the warning threshold sits just above
      // it so a genuine regression (the main chunk growing, or scene code leaking into it) still
      // prints a warning rather than being lost in an always-on one.
      chunkSizeWarningLimit: 900,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: 'scene-core', test: SCENE_CORE_TEST }],
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      electronSimple({
        main: {
          input: 'electron/main/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rolldownOptions: {
                external,
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rolldownOptions: {
                external,
              },
            },
          },
        },
        // Polyfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        // renderer: {},
      }),
    ],
    clearScreen: false,
  }
})
