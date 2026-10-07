// The window's rendering scale follows its width in the real app (electron/main/windowBounds.ts);
// the specs set their own viewports and read CSS-pixel geometry, so it is off here (inherited by
// every Electron the specs launch through process.env).
process.env.TOGO_AUTO_ZOOM = '0'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
})
