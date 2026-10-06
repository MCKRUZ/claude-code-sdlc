# Tōgō

Tōgō (TOH-goh, 統合 — integration) is the desktop shell for the [claude-code-sdlc](../) plugin,
which is the repository this folder lives in — so the plugin Tōgō drives is always the one
beside it. Tōgō is an **optional add-on** — the plugin is fully usable on its own; Tōgō just
gives it a visual front end for people who want one. Tōgō never reimplements plugin logic:
every piece of project state it shows, and every change it makes, goes through the plugin's
own scripts, run the same way a person would run them from the command line.

The folder is still `studio/` and the npm package `sdlc-studio`; the product, window title and
packaged app are Tōgō — see `docs/brand/togo/brandbook.html`.

Scaffolded from [electron-vite-react](https://github.com/electron-vite/electron-vite-react)
(Electron + Vite + React + TypeScript + Tailwind).

## Quick Start

Tōgō is a Node project inside a Python plugin repository, so everything below runs from
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
- `npm test`: run Vitest unit tests (runs `pretest`, a `vite build --mode=test`, first so the
  bundle-budget test has something to measure).
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
│   ├── theme/        Design tokens, light/dark remap, density
│   ├── ui/           The UI kit (typed contracts in contract.ts)
│   ├── motion/       The one motion rule and the GSAP choreographies
│   ├── palette/      Command palette
│   ├── shortcuts/    Keyboard map (shortcutMap.ts) and listener
│   ├── scenes/       3D scenes: core shell, spine, constellation, ambient
│   └── components/   Screens, composed from the kit
└── test/             Unit and end-to-end tests
    └── e2e/
```

Files under `electron/` are compiled into `dist-electron/`.

## Appearance

Settings › **Appearance** (also the sidebar's "Appearance" button) holds four per-person
preferences. Each is stored in `localStorage` and takes effect without a reload.

| Preference | Options | Stored as | Notes |
|---|---|---|---|
| Theme | System / Light / Dark | `studio.theme` | System follows the operating system. The dark theme is a remap of the colour ramps, so every screen flips at once. |
| Density | Comfortable / Compact | `studio.density` | Compact tightens the vertical rhythm; the sidebar and chat keep their width. |
| Animations | Auto / On / Off | `studio.motion` | Auto honours the OS reduced-motion setting. **On** is an explicit opt-in that overrides it; Off turns every animation off. Animations are always off under test. |
| Visuals default | Graph / Table | `studio.sprint.surface` | Which surface the Sprint constellation opens on. The Table twin is always one click away, and is what shows when graphics are unavailable. |

## Keyboard shortcuts

The map lives in `src/shortcuts/shortcutMap.ts`; the Shortcuts help (⌘/ or `?`) renders the
same data. `Mod` is ⌘ on macOS and Ctrl elsewhere. Two-key sequences (`g` then `b`) must be
typed within 800 ms. Shortcuts marked † also fire while an input has focus.

| Keys | Where | Does |
|---|---|---|
| `Mod+K` †, `/` | everywhere | Command palette |
| `Mod+/` †, `?` | everywhere | Keyboard shortcuts help |
| `Mod+Shift+D` † | everywhere | Cycle theme: system → light → dark |
| `Mod+Shift+M` † | everywhere | Toggle animations |
| `Mod+Shift+L` † | everywhere | Toggle density |
| `Mod+J` † | in a project | Toggle the console |
| `Mod+Shift+C` † | in a project | Focus the chat composer |
| `Mod+\` † | in a project | Toggle the chat panel |
| `Mod+,` † | in a project | Settings |
| `g` `0`…`g` `9`, `g` `.` | in a project | Go to Phase 0–9, or Close |
| `g` `b` / `g` `s` / `g` `h` / `g` `c` / `g` `d` | in a project | Board / Sprint / How it is going / Closing / Build documents |
| `[` / `]` | in a project | Previous / next stage |
| `1` / `2` / `3` | stage home | Workflow / Documents / Guide tab |
| `Alt+↑` / `Alt+↓` | document view | Previous / next document |
| `Mod+S` † | document view | Save the open field |

⌘W / ⌘Q / ⌘R / ⌘1–9 and the F-keys are deliberately absent: Electron and the OS own them.
Escape always closes the innermost thing (palette, dialog, hover card) and never discards an
unsaved edit — the field editor, hand-off form and an open AI proposal register as "dirty".

## Scenes

Two 3D scenes and one background, all built on `src/scenes/core/SceneShell.tsx`: a lazily
loaded `<canvas>` with a **Graph / Table** toggle, where the Table twin is the real content, not
a fallback. The Table is what renders when WebGL is unavailable, the window is under 400 px,
the canvas has crashed, or Tōgō is under test. Scenes draw only what the plugin reports —
Tōgō computes no status of its own, and a value the plugin reports as null reads "no data".

- **Lifecycle Spine** (`scenes/spine/`) — the stage order and each stage's sign-off state, as a
  band above a stage's home and on the Closing screen. Sign-off plays a short ceremony along the
  rail; the end state equals a cold reload.
- **Dependency Constellation** (`scenes/constellation/`) — specs as nodes, `depends_on` as
  edges, on the Sprint screen and the Board (Graph in the filter bar). A node's size comes from
  its risk tier alone; a dependency on an id with no spec is a ghost node drawn from the id; a
  dependency outside the slate on an unmerged spec is warn-toned. The Sprint's Table twin is the
  slate itself; the Board's is the list.
- **Ambient field** (`scenes/ambient/`) — a slow particle background behind the entry screens
  only (Welcome, New project, Setup), gated by `AMBIENT_ENABLED && motion.enabled() &&
  canUseWebGL()`; never on a project screen and never under test.

## Bundle

Measured on `vite build --mode=test` after the Observatory (2026-10-05): main chunk
`dist/assets/index-*.js` **574.8 KB** (budget ≤ 800 KB, enforced by `test/bundleSize.test.ts`),
`scene-core-*.js` **941.8 KB** (three, R3F, d3-force-3d — loaded on the first Canvas mount only),
per-scene chunks 4–18 KB, `gsap` 68 KB and the choreography presets 58 KB as shared chunks, CSS
60 KB. Fonts (Inter Variable, JetBrains Mono Variable) are bundled woff2; nothing is fetched over
the network, and the Content-Security-Policy in `index.html` is unchanged.

## Security

- The renderer never gets `nodeIntegration` — the main process talks to `claude`/`uv`/the
  filesystem, and exposes only a narrow, explicit API to the renderer via the preload script's
  `contextBridge`.
- `index.html` carries a restrictive Content-Security-Policy (`script-src 'self'`).
- `test/noNewIpcInRenderer.test.ts` fails if any file under `src/{ui,motion,palette,scenes,
  theme,shortcuts,stores}` reaches for `window.studio`.

## Code host

A project opens without `gh` or `az`. The code host is chosen **by the repository** — the
`origin` remote says GitHub or Azure DevOps (a per-clone `.sdlc/code-host.yaml`, written from
Settings › *Repository* through the plugin's `set_setting.py code-host`, can pin it) — and only
the matching CLI matters: the GitHub CLI (`gh`) for GitHub, the Azure CLI with its `azure-devops`
extension for Azure DevOps. The tooling screen lists both under *Code-host CLIs* as optional.
Features that read or write pull requests (live spec status, the hand-off's draft PR, branch
policies, pipeline evidence, gate credentials) say exactly what they need when the CLI is missing
or signed out, in one sentence from `shared/codeHostModel.ts`, and stay disabled with that
reason; everything else keeps working from the spec files. Who you are comes from the signed-in
CLI mapped through the roster (`@handle`, or `people[].email` for an Azure DevOps sign-in); when
the host cannot say, Settings and the hand-off dialog offer a typed name, and anything saved
that way is marked as typed. The renderer never spawns a CLI — the main process resolves the
host once per project (`electron/main/codeHost.ts`) and the Console narrates `gh` and `az`
calls in plain words. Design: `../docs/proposals/code-host-providers.md`.

## Status

Tōgō drives the plugin **beside it**. Unpackaged, tool detection prefers `<studio>/../scripts`
when it carries `capabilities.py`, then the newest marketplace-cached plugin that does, then a
path set in Tōgō — and Settings › *Tooling on this machine* says which one is in use and the
version it declares. Every `claude` call uses the flags listed in `shared/claudeContract.ts`,
checked once against the installed CLI's `--help`: an older Claude Code is reported ("Claude Code
<version> lacks <flags> — update with `claude update`") and the model controls stay off until it is
updated, while the project itself stays readable.

The specs in the repository's `specs/` directory (0008 onward) record Tōgō's build order;
`docs/proposals/studio-improvements.md` is the plan (Batches 1–2 built; its D4/D5 became the
code-host providers plan, built through Wave 7), `docs/proposals/studio-observatory.md` the visual
overhaul (spec 0033, built), and `docs/brand/togo/` the identity.
