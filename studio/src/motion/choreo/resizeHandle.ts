// Row #24 — Resize handle. CSS-owned: the accent grip's opacity is a 120 ms transition in
// `index.css`, and the WIDTH is never transitioned (the chatLook e2e expects exactly 380 after a
// double-click). This module exists so the catalogue is complete and a caller that asks for the
// row gets a completed timeline rather than a missing export.
import type { Choreo } from '../contract'
import { timelineFor } from './_shared'

export const resizeHandle: Choreo<void> = {
  name: 'resizeHandle',
  play(ctx) {
    return timelineFor(ctx)
  },
}
