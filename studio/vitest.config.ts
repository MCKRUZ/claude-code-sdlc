import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    root: __dirname,
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['test/e2e/**'],
    // passWithNoTests stays OFF. With it on, a broken `include` glob reports success having
    // run nothing — and once this suite gates a merge, that is a green tick certifying an
    // empty run. There are always tests under test/, so finding none is a fault, not a case
    // to tolerate.
    passWithNoTests: false,
    testTimeout: 1000 * 29,
    setupFiles: ['test/setupTests.ts'],
    // Everything defaults to the plain 'node' environment (main-process tests spawn real
    // subprocesses and touch the real filesystem — jsdom would only add overhead there). A
    // component test (React Testing Library, ChatPanel.tsx and friends) opts into jsdom itself
    // with a `// @vitest-environment jsdom` pragma at the top of the file (Vitest's own
    // documented per-file mechanism — environmentMatchGlobs was tried first and, measured
    // against this project's actual config loader, did not switch the environment at all),
    // rather than paying jsdom's setup cost for every test in the suite.
  },
})
