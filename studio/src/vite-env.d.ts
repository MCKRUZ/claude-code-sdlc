/// <reference types="vite/client" />
/// <reference path="../shared/types.ts" />

interface Window {
  // exposed in electron/preload/index.ts via contextBridge — the ONLY surface the
  // renderer gets, typed against the shared StudioApi contract.
  studio: import('../shared/types').StudioApi
}
