import { defineConfig } from 'vitest/config'

export default defineConfig({
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
  },
})
