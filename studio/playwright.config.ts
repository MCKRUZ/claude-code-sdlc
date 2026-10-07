// The window's rendering scale follows its width in the real app (electron/main/windowBounds.ts);
// the specs set their own viewports and read CSS-pixel geometry, so it is off here (inherited by
// every Electron the specs launch through process.env).
process.env.TOGO_AUTO_ZOOM = '0'
// And nothing reaches the operating system's opener (activityRuns.ts openWithSystem): on the Linux
// runner xdg-open starts a browser and Electron's shutdown waits for it.
process.env.TOGO_NO_SYSTEM_OPEN = '1'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  // The test timeout is also the worker-teardown budget. On the ubuntu runner, closing the last
  // Electron app of a run took longer than Playwright's 30 s default after every test had
  // passed (the specs set their own longer timeouts per test; this covers the teardown).
  timeout: 120_000,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
})
