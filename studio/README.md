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

### The kit

Every screen is composed from `src/ui/` (typed contracts in `contract.ts`, exports in `index.ts`).
Round 2 (`docs/proposals/studio-upgrade-2.md`) added the pieces every screen now shares:

- `PageHeader` — area eyebrow ("BUILD · BOARD"), the `h2[data-page-heading]` with the heading
  text byte-identical to before, a lede as the h2's next sibling, right-aligned actions;
  `sticky` uses the one sticky recipe (`components/useStuck.ts`: transparent at rest, `surface-0`
  and a hairline only once scrolled — the ghost-strip fix).
- `Disclosure` — a `<details>` with a chevron summary and no `::marker`; closed by default.
- `EmptyState figure=…` — six small figures in the product's own vocabulary (`emptyFigures.tsx`).
- `Dialog scrollBody` — a scrolling body with the footer pinned; rows stagger in (cap 8).
- Toasts anchor over `<main>` (never over the chat composer), dedupe a same-title update within
  2 s in place, and their rail is a clock that pauses while hovered.
- Text: `text-accent-text` / `hover:text-accent-text-hover` for every link-coloured word (readable
  in dark too); `Eyebrow` / `EYEBROW_TYPE_CLASS` for the label voice — `ink-4` is decoration only,
  never a word, and a bare `text-eyebrow` class is the colour utility alone.
- `shared/format.ts` — `plural`, `formatDate`, `formatRelative`, `formatHours`, `NO_DATA`: the one
  place a plugin value becomes words. It formats what the plugin reported and derives nothing;
  a value the plugin did not give reads "no data" / "no date recorded", never 0 or today.

## Releases — the .dmg and the .exe

Installers are never committed: `studio/release/` is gitignored and the artifacts live on GitHub
Releases. `.github/workflows/release.yml` builds them on a version tag — the `.dmg` (and `.zip`)
on a macOS runner, the `.exe` installer on a Windows runner, both from `electron-builder.json`
with the Tōgō icon and bundle id `com.splashthree.togo` — and attaches them to one Release with
install notes. The tag must match `.claude-plugin/plugin.json`'s version:

```bash
git tag v1.7.0 && git push origin v1.7.0
```

Locally, `npm run build` produces the same files under `release/<version>/`. Signing is switched
on by secrets alone (macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`);
without them the builds are unsigned and the first launch needs right-click → Open on macOS or
SmartScreen's "run anyway" on Windows. There is no auto-update channel: people install the new
release. A packaged Tōgō finds the plugin in Claude Code's marketplace cache
(`/plugin install claude-code-sdlc@togo`), or at the path set in Settings.

## Appearance

Settings › **Appearance** (also the sidebar's "Appearance" button) holds four per-person
preferences. Each is stored in `localStorage` and takes effect without a reload.

| Preference | Options | Stored as | Notes |
|---|---|---|---|
| Theme | System / Light / Dark | `studio.theme` | System follows the operating system. The dark theme is a remap of the colour ramps, so every screen flips at once. |
| Density | Comfortable / Compact | `studio.density` | Compact tightens the vertical rhythm; the sidebar and chat keep their width. |
| Animations | Auto / On / Off | `studio.motion` | Auto honours the OS reduced-motion setting. **On** is an explicit opt-in that overrides it; Off turns every animation off. Animations are always off under test. The opening flourishes (project assemble, Welcome field, Spine draw) quieten with familiarity — opens 1–3 in full, 4–10 brisk, then not at all; a hashed per-project counter in `studio.opens.<hash>`. **Play the opening again** resets it (disabled outside a project, saying why). |
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
| `Home` / `n` | in a graph | Fit the graph / focus the spec the plugin named next up |
| `Shift+←→↑↓` / `+` `−` | in a graph | Orbit / zoom the camera |
| `↑` / `↓` / `Esc` | in a graph | Previous / next spec in build order / clear the hover |

"In a graph" bindings fire only while a Constellation figure (the Sprint or Board graph) has
keyboard focus — the Spine carries no keyboard scope — and
the same two commands — *Fit the graph*, *Focus next up* — sit in the palette while a graph is on
screen. They move a camera and a focus ring; nothing is fetched or written.

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
  band above a stage's home and on the Closing screen. Station plates carry short names
  (`STAGE_SHORT_LABEL`; the full name on hover and on the current station); a thin accent
  reticle marks the stage whose home is open ("The accent ring marks the stage you are
  viewing" — `data-viewing` on the Table twin, never `aria-current`); on Closing every plate
  carries its ledger line word for word from the plugin's row ("signed off · name · date",
  "completed · no name recorded", "not started"). Sign-off plays a short ceremony along the
  rail; the end state equals a cold reload.
- **Dependency Constellation** (`scenes/constellation/`) — specs as nodes, `depends_on` as
  edges, on the Sprint screen and the Board (Graph in the filter bar). A node's size comes from
  its risk tier alone; a dependency on an id with no spec is a ghost node drawn from the id; a
  dependency outside the slate on an unmerged spec is warn-toned. The Sprint's Table twin is the
  slate itself; the Board's is the list. The Board host spreads bodies into a band and fits the
  camera to the host's aspect (bodies fill ≥ 60 % of the figure); y carries no meaning. A spec
  page draws its own dependency neighbourhood as plain SVG (`SpecNeighbourhood`), no canvas.
- **Materials and light** (`scenes/core/`) — bodies carry a fresnel rim in their own status colour
  and a soft specular dot; rings and the rail are shaded so the token colour is the brightest
  pixel; a three-point rig, a contact pool under every body (scale from radius only) and a
  theme-aware grid. Nothing takes geometry, brightness or size from time, people or activity.
- **Ambient field** (`scenes/ambient/`) — a slow particle background behind the entry screens
  only (Welcome, New project, Setup), gated by `AMBIENT_ENABLED && motion.enabled() &&
  canUseWebGL()`; never on a project screen and never under test.

## Bundle

Measured on the production `vite build` of the v8 capture after upgrade round 2 (2026-10-06):
main chunk `dist/assets/index-*.js` **641.8 KB** (gzip 194.8 KB; budget ≤ 800 KB, enforced by
`test/bundleSize.test.ts` — the `--mode=test` build measures 641.4 KB), `scene-core-*.js`
**966.9 KB** (three, R3F, d3-force-3d — loaded on the first Canvas mount only), per-scene chunks
2–26 KB (ConstellationScene 26, SpineScene 18, Plates 9), `gsap` 70 KB, the choreography 30 KB
and its presets 30 KB, the kit 46 KB and `shared/format` 1.5 KB as shared chunks, CSS 73 KB.
Round 1 measured 574.8 / 941.8 KB; the main chunk grew 67 KB for the kit's new primitives, the
ceremonies, the palette's Flip and the spec neighbourhood. Fonts (Inter Variable, JetBrains Mono
Variable) are bundled woff2; nothing is fetched over the network, and the Content-Security-Policy
in `index.html` is unchanged.

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
overhaul (spec 0033, built), `docs/proposals/studio-upgrade-2.md` the second round (built;
its status line records what P7 verified), and `docs/brand/togo/` the identity — the solid
Macron is the mark; its Depth gradient lives at hero size only (Welcome, the opening card, the
app icon), regenerated by `docs/brand/togo/build-assets.mjs`.
