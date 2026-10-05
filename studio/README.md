# SDLC Studio

A desktop shell for the [claude-code-sdlc](../) plugin, which is the repository this folder
lives in — so the plugin Studio drives is always the one beside it. Studio is an **optional
add-on** — the plugin is fully usable on its own; Studio just gives it a visual front end for
people who want one. Studio never reimplements plugin logic: every piece of project state it
shows, and every change it makes, goes through the plugin's own scripts, run the same way a
person would run them from the command line.

Scaffolded from [electron-vite-react](https://github.com/electron-vite/electron-vite-react)
(Electron + Vite + React + TypeScript + Tailwind).

## Quick Start

Studio is a Node project inside a Python plugin repository, so everything below runs from
this folder, not the repository root.

```sh
cd studio
npm install
npm run dev
```

The integration tests additionally need the plugin's Python environment — `uv run --project
scripts pytest scripts/tests -q` from the repository root builds it. Without it those tests
fail loudly rather than skipping, on purpose; run only the rest with
`STUDIO_SKIP_PLUGIN_TESTS=1`.

## Available Scripts

- `npm run dev`: start the Vite dev server with the Electron shell.
- `npm run build`: build the renderer and package the app with electron-builder.
- `npm run preview`: preview the production web build locally.
- `npm test`: run Vitest unit tests.
- `npm run test:e2e`: build the test-mode bundle and run Playwright end-to-end tests.
- `npm run typecheck`: run the TypeScript type checker.

## The smoke suite: Studio as a user sees it

`test/e2e/smoke.spec.ts` walks the real window the way a person would: a first-time user (Welcome, New project,
the setup wizard) and a team a few days in (every stage and tab, the Build screens, a document and its history,
a spec and its hand-off form, Settings, the Console), at 1280, 1024 and 640 px wide. It clicks every read-only
control, and lists the ones it deliberately did not (anything that changes something or starts a model run).

```
npm run pretest
STUDIO_SKIP_LIVE_MODEL=1 npx playwright test test/e2e/smoke.spec.ts
```

It takes about 3.5 minutes, needs the plugin checkout and its Python environment, and Studio must not already
be open. It uses **no live model**: the chat and draft entry points are replaced for the run, because opening a
stage with an unstarted document otherwise makes the chat greet with a real model call by itself.

What it writes, to `test/screenshots/smoke/` (ignored by git): a screenshot of every screen at every size (plus
one scrolled to the bottom where the panel scrolls), `observations.json`, and `report.md`. Read the pictures as
well as the report; the rules in `test/smoke/findings.ts` catch leaked internals, unnamed controls, sideways
scrolling and unexpected errors, but not a layout that is valid and still confusing.

The run fails only on a **new** bug. Problems already found are listed in `test/smoke/knownIssues.ts`, each with
what fixing it looks like, and shown under "Known, not yet fixed" in the report; fix one, delete its entry. The
first review is `docs/studio-smoke-review-2026-10-05.md` in the plugin repo.

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
