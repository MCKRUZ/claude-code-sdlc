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
    // The draft and batch suites set up a REAL project in beforeEach — init_project.py through
    // the plugin's own venv, then a git repository — and Vitest runs test files in parallel
    // workers, so under a full run a dozen of those hooks contend for the same CPU and venv at
    // once. Measured 2026-10-05 after the sprint-view suites joined: the same hooks pass alone
    // and overrun the 10s default in a full run. The work is real, not a hang, so the hook gets
    // the same ceiling a test does rather than a flake that reads as a regression.
    hookTimeout: 1000 * 29,
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
