/// <reference types="vite/client" />
/// <reference path="../shared/types.ts" />

interface Window {
  // exposed in electron/preload/index.ts via contextBridge — the ONLY surface the
  // renderer gets, typed against the shared StudioApi contract. `CommandCenterApi` is the
  // command center's additive bridge (togo-command-center.md §2.2/§2.4), typed here so the
  // screens compile against it before the preload implements it.
  studio: import('../shared/types').StudioApi & import('../shared/types').CommandCenterApi
}
