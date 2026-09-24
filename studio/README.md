# SDLC Studio

A desktop shell for the [claude-code-sdlc](../claude-code-sdlc) plugin. Studio is an **optional
add-on** — the plugin is fully usable on its own; Studio just gives it a visual front end for
people who want one. Studio never reimplements plugin logic: every piece of project state it
shows, and every change it makes, goes through the plugin's own scripts, run the same way a
person would run them from the command line.

Scaffolded from [electron-vite-react](https://github.com/electron-vite/electron-vite-react)
(Electron + Vite + React + TypeScript + Tailwind).

## Quick Start

```sh
npm install
npm run dev
```

## Available Scripts

- `npm run dev`: start the Vite dev server with the Electron shell.
- `npm run build`: build the renderer and package the app with electron-builder.
- `npm run preview`: preview the production web build locally.
- `npm test`: run Vitest unit tests.
- `npm run test:e2e`: build the test-mode bundle and run Playwright end-to-end tests.
- `npm run typecheck`: run the TypeScript type checker.

## Project Structure

```tree
├── build/            Packaging assets
├── dist-electron/    Compiled Electron output
├── electron/         Main-process and preload source
│   ├── main/
│   └── preload/
├── public/           Static assets
├── src/              Renderer source code (React)
└── test/             Unit and end-to-end tests
    └── e2e/
```

Files under `electron/` are compiled into `dist-electron/`.

## Security

- The renderer never gets `nodeIntegration` — the main process talks to `claude`/`uv`/the
  filesystem, and exposes only a narrow, explicit API to the renderer via the preload script's
  `contextBridge`.
- `index.html` carries a restrictive Content-Security-Policy (`script-src 'self'`).

## Status

Specs 0008–0014 (in the `claude-code-sdlc` repo's `specs/` directory) define Studio's build
order. The application shell itself — spec 0008 — has not landed yet; this repo currently holds
a cleaned-up, verified scaffold only.
