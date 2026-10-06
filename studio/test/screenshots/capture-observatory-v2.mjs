// Production-mode screenshots of the Observatory on a RICH fixture — NOT a spec. Unlike
// capture-observatory.mjs this builds with `npx vite build` (production: motion on, the Ambient
// field enabled, the Graph surface the default) and walks a six-spec sprint with real verdicts,
// a hand-off, a roster and a local bare origin (so the Sync chip is not an error). Run from studio/:
//
//   node test/screenshots/capture-observatory-v2.mjs            # builds first
//   SKIP_BUILD=1 node test/screenshots/capture-observatory-v2.mjs  # reuse dist/
//   SHOT_PREFIX=observatory-v3 node test/screenshots/capture-observatory-v2.mjs  # a new series
//   SHOT_SETTLE=1800 …                                                 # longer settle per shot (ms)
//
// Writes test/screenshots/<prefix>-<name>.png (prefix defaults to observatory-v2) and prints DPR +
// canvas size for sprint-graph. The v8 run (studio-upgrade-2 §4 P7) adds five shots to the twelve:
// `welcome-dark` (the Welcome's own corner pill), `spec-view-dark`, `palette-dark`, `settings-dark`
// (the sidebar's Appearance popover, as the stage-dark shot) and `closing` (the Spine with its
// ledger plates under "Declaring Build finished"). Seventeen files per run.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const PLUGIN_ROOT = process.env.SDLC_PLUGIN_ROOT ?? resolve(root, '..')
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts')
const VENV_PYTHON = process.platform === 'win32'
  ? join(SCRIPTS_DIR, '.venv', 'Scripts', 'python.exe')
  : join(SCRIPTS_DIR, '.venv', 'bin', 'python')
const SETTLE = Number(process.env.SHOT_SETTLE ?? 1_200)
const PREFIX = process.env.SHOT_PREFIX ?? 'observatory-v2'
// SHOT_PROBE=ghost (studio-upgrade-2 §4 P3 / C4-A2): instead of the walk, open Sprint on the GRAPH
// surface WITHOUT moving the pointer afterwards, capture the 25 px band above the Sprint header at
// 1.2 / 1.6 / 2.0 / 2.5 s and report the max per-channel deviation from `surface-0` per capture
// (ghost = any pixel row deviating > 8/255). GHOST_BISECT=<n> adds ONE style rule before the
// navigation so the cause can be named from evidence rather than guessed:
//   1 `[data-reveal]` transform:none / opacity:1   — kills the row stagger
//   2 the slate scroller overflow:visible          — the scroll box
//   3 the sticky header position:static            — sticky layer promotion
//   4 the band display:none                        — the band (a `::before` before the fix, a real
//                                                    `[data-stuck-band]` element after it)
//   5 TABLE surface (the prior said "known clean"; the probe showed the canvas was NOT necessary)
// Verdict and numbers: the header comment of `src/components/useStuck.ts`. The Sprint header is
// the `PageHeader` at the top of the screen since S7, found by its `h2[data-page-heading]`.
// GHOST_TARGET=board runs the same measurement on the Board's filter bar — a sticky header that
// sits MID-page (under the notice and the team chips), so the fix is shown to hold where the band
// has content above it, not only at the top of the screen where the Sprint header now lives.
const PROBE = process.env.SHOT_PROBE ?? null
const GHOST_TARGET = process.env.GHOST_TARGET === 'board' ? 'board' : 'sprint'
const GHOST_BISECT = Number(process.env.GHOST_BISECT ?? 0)
const GHOST_TIMES_MS = [1_200, 1_600, 2_000, 2_500]
const GHOST_THRESHOLD = 8
const GHOST_BISECT_CSS = {
  1: '[data-reveal]{transform:none!important;opacity:1!important}',
  2: '[aria-label="Sprint slate, scrolls sideways"]{overflow:visible!important}',
  3: 'main header[class*="sticky"],[data-testid="sprint-board"]>div:first-child{position:static!important}',
  4: '[data-stuck-band],[data-testid="sprint-board"]>div:first-child::before{display:none!important}',
}

if (!existsSync(VENV_PYTHON)) throw new Error(`no plugin venv at ${VENV_PYTHON} — run the plugin's pytest once to build it`)
if (!process.env.SKIP_BUILD) {
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' }) // PRODUCTION mode on purpose
}
if (!existsSync(join(root, 'dist', 'index.html'))) throw new Error('no dist/ — the production build did not land')

const failures = []
const py = (label, args) => {
  try { execFileSync(VENV_PYTHON, args, { cwd: SCRIPTS_DIR, stdio: 'pipe' }) }
  catch (e) { failures.push(`${label}: ${String(e.stderr ?? e.stdout ?? e.message).trim().split('\n').slice(-3).join(' | ')}`) }
}
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'pipe' })
const shot = (page, name) => page.screenshot({ path: join(here, `${PREFIX}-${name}.png`) })
const settle = async (page, ms = SETTLE) => page.waitForTimeout(ms)

/** Replace one frontmatter line in place (`key: …` → `key: "value"`), everything else untouched. */
const setFm = (file, key, value) => {
  const text = readFileSync(file, 'utf-8')
  const re = new RegExp(`^${key}:.*$`, 'm')
  if (!re.test(text)) { failures.push(`frontmatter ${key} missing in ${file}`); return }
  writeFileSync(file, text.replace(re, `${key}: "${value}"`))
}

// --- fixture: bare origin + clone, six specs, a sprint with verdicts and a hand-off ------------
const workspace = mkdtempSync(join(tmpdir(), 'studio-shots-v2-'))
const origin = join(workspace, 'origin.git')
const project = join(workspace, 'project')
git(['init', '--bare', '--initial-branch=main', origin], workspace)
git(['clone', origin, project], workspace)
git(['config', 'user.email', 'studio-shots@example.com'], project)
git(['config', 'user.name', 'Studio Shots'], project)

const sprintPy = join(SCRIPTS_DIR, 'sprint.py')
py('init_project', [join(SCRIPTS_DIR, 'init_project.py'), '--profile', join(PLUGIN_ROOT, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project])
const SPECS = [
  ['duplicate claim 409', 'HIGH'], ['claim export', 'MEDIUM'], ['adjuster notes', 'LOW'],
  ['fraud score feed', 'MEDIUM'], ['letters batch', 'LOW'], ['payments ledger', 'HIGH'],
]
for (const [name, risk] of SPECS) {
  py(`new_spec ${name}`, [join(SCRIPTS_DIR, 'new_spec.py'), '--repo', project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'])
}
const specFiles = Object.fromEntries(readdirSync(join(project, 'specs')).filter((f) => /^\d{4}-/.test(f)).map((f) => [f.slice(0, 4), join(project, 'specs', f)]))
const ids = Object.keys(specFiles).sort()
const demo = {
  '0001': { status: 'ready' }, '0002': { status: 'ready', depends_on: '0001' }, '0003': { status: 'draft', depends_on: '0001' },
  '0004': { status: 'in-flight', developer: '@sam-k' }, '0005': { status: 'ready', depends_on: '0002, 0004' }, '0006': { status: 'draft', depends_on: '0005' },
}
for (const [id, fields] of Object.entries(demo)) {
  if (!specFiles[id]) { failures.push(`spec ${id} was not created`); continue }
  for (const [k, v] of Object.entries(fields)) setFm(specFiles[id], k, v)
}
py('sprint new', [sprintPy, 'new', '--repo', project, '--sprint', 'S07', '--goal', 'Adjusters file without a phone call',
  '--start', '2026-09-28', '--target', '6', '--mix', 'HIGH:2,MEDIUM:2,LOW:2', '--by', 'Pod Lead'])
py('sprint slate', [sprintPy, 'slate', '--repo', project, '--sprint', 'S07', '--by', 'Pod Lead', ...ids.flatMap((id) => ['--spec', id])])
for (const id of ['0001', '0002', '0005']) {
  py(`verdict eng ${id}`, [sprintPy, 'verdict', '--repo', project, '--spec', id, '--lane', 'eng', '--verdict', 'accepted', '--by', 'Eng Lead'])
  py(`verdict data ${id}`, [sprintPy, 'verdict', '--repo', project, '--spec', id, '--lane', 'data', '--verdict', 'n-a', '--reason', 'no new data', '--by', 'Data Lead'])
}
py('handoff 0003', [sprintPy, 'handoff', '--repo', project, '--spec', '0003', '--to', '@sam-k', '--by', 'Pod Lead', '--note', 'take the notes spec next'])

// Roster: the example, plus @sam-k so the demo's developer resolves.
const roster = readFileSync(join(PLUGIN_ROOT, 'templates', 'team', 'team.example.yaml'), 'utf-8')
  + '\n  - handle: "@sam-k"\n    name: "Sam Kowalski"\n    team: claims\n    roles: [developer, checker]\n    signs_off: ["build"]\n'
writeFileSync(join(project, '.sdlc', 'team.yaml'), roster)
try {
  git(['add', '-A'], project)
  git(['commit', '-q', '-m', 'observatory fixture'], project)
  git(['push', '-q', '-u', 'origin', 'main'], project)
} catch (e) { failures.push(`git commit/push: ${String(e.stderr ?? e.message).trim()}`) }

const userData = join(workspace, 'userData')
mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({
  recentProjects: [{ path: project, name: 'observatory project', lastOpenedAt: new Date().toISOString() }],
  pluginScriptsPathOverride: SCRIPTS_DIR,
}, null, 2))

// --- the ghost probe ---------------------------------------------------------------------------
/** A minimal PNG reader for what Chromium's screenshots are: 8-bit RGB / RGBA, no interlace.
 * No dependency — the plan forbids adding one for a probe. */
function decodePng(buffer) {
  let pos = 8 // signature
  const idat = []
  let width = 0, height = 0, colorType = 6
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error(`png: bit depth ${data[8]} unsupported`)
      colorType = data[9]
      if (data[12] !== 0) throw new Error('png: interlaced screenshots are not expected')
    } else if (type === 'IDAT') idat.push(data)
    pos += 12 + length
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error(`png: colour type ${colorType} unsupported`) })()
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0
      const b = y > 0 ? out[dst - stride + x] : 0
      const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0
      let v = raw[src + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      out[dst + x] = v & 0xff
    }
  }
  return { width, height, bpp, data: out }
}

/** Per pixel row: the max |channel − surface-0 channel| over the row; the report is how many rows
 * exceed the threshold and the worst deviation seen, so a 1 px glyph strip cannot hide in a mean. */
function bandDeviation(img, surface) {
  const rows = []
  for (let y = 0; y < img.height; y++) {
    let worst = 0
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * img.bpp
      for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(img.data[i + ch] - surface[ch]))
    }
    rows.push(worst)
  }
  const ghostRows = rows.map((v, i) => [i, v]).filter(([, v]) => v > GHOST_THRESHOLD)
  return { rows: img.height, worst: Math.max(...rows), ghostRows: ghostRows.length, ghostRowIndexes: ghostRows.map(([i]) => i), perRow: rows }
}

class ProbeDone extends Error {}

const hexToRgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }

/** The protocol in the file comment. Returns the report lines; writes nothing but the console. */
async function ghostProbe(page) {
  const lines = [`GHOST PROBE bisect=${GHOST_BISECT || 'none'} dpr=${await page.evaluate(() => window.devicePixelRatio)}`]
  if (GHOST_BISECT_CSS[GHOST_BISECT]) await page.addStyleTag({ content: GHOST_BISECT_CSS[GHOST_BISECT] })
  const surfaceHex = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-surface-0').trim())
  const surface = hexToRgb(surfaceHex)
  lines.push(`surface-0 ${surfaceHex} → ${surface.join(',')}`)
  await page.getByRole('button', { name: /^Build Loop/ }).click()
  const t0 = Date.now()
  await page.getByRole('button', { name: GHOST_TARGET === 'board' ? 'Board' : 'Sprint', exact: true }).click()
  if (GHOST_TARGET === 'board') await page.getByRole('button', { name: 'Everything' }).waitFor({ timeout: 60_000 })
  else await page.getByTestId('sprint-header').waitFor({ timeout: 60_000 })
  const tHeader = Date.now() - t0
  const figure = page.getByTestId('constellation-sprint')
  let surfaceNote = GHOST_TARGET === 'board' ? 'board list (no figure)' : 'graph (default)'
  if (GHOST_TARGET === 'board') {
    // The list surface: rows stagger in under the sticky filter bar exactly as the slate did.
  } else if (GHOST_BISECT === 5) {
    await figure.getByRole('button', { name: 'Table', exact: true }).click()
    surfaceNote = 'TABLE (bisect 5)'
  } else {
    const graph = figure.getByRole('button', { name: 'Graph', exact: true })
    if (await graph.count() && (await graph.getAttribute('aria-pressed')) !== 'true') { await graph.click(); surfaceNote = 'graph (clicked)' }
    await figure.locator('canvas').first().waitFor({ timeout: 30_000 }).catch(() => lines.push('no canvas appeared'))
  }
  const tSurface = Date.now() - t0
  lines.push(`header at ${tHeader} ms, surface ${surfaceNote} at ${tSurface} ms; pointer left where the last click put it`)
  for (const at of GHOST_TIMES_MS) {
    const wait = t0 + at - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    const band = await page.evaluate(() => {
      const filterRow = document.querySelector('[data-filter-row]')
      const heading = Array.from(document.querySelectorAll('main h2[data-page-heading]')).find((h) => h.textContent?.trim() === 'Sprint')
        ?? document.querySelector('[data-testid="sprint-board"] h2')
      const header = filterRow ? filterRow.parentElement : heading?.closest('header, [data-testid="sprint-board"] > div')
      const main = document.getElementById('main')
      if (!header || !main) return null
      const r = header.getBoundingClientRect(); const m = main.getBoundingClientRect()
      // The Sprint header sits under <main>'s 24 px padding, so the 25 px band is all ground. The
      // Board's filter bar sits 24 px (`space-y-6`) under the team chips: the 25th row up is the
      // chips' own bottom edge, real content — so that target measures the 24 px gap exactly.
      const height = filterRow ? 24 : 25
      return { x: Math.round(m.left), y: Math.round(r.top) - height, width: Math.round(m.width), height, stuck: header.hasAttribute('data-stuck'), surface: document.querySelector('[data-testid="constellation-sprint"]')?.getAttribute('data-surface') ?? 'list' }
    })
    const atMs = Date.now() - t0
    if (!band) { lines.push(`t=${atMs} ms: no header found`); continue }
    const png = await page.screenshot({ type: 'png', clip: { x: band.x, y: band.y, width: band.width, height: band.height } })
    const dev = bandDeviation(decodePng(png), surface)
    lines.push(`t=${atMs} ms target=${GHOST_TARGET} surface=${band.surface} stuck=${band.stuck} band y=${band.y}..${band.y + band.height} rows=${dev.rows}: ghost rows=${dev.ghostRows} worst=${dev.worst}/255${dev.ghostRows ? ` at device rows [${dev.ghostRowIndexes.join(',')}] per-row max [${dev.perRow.join(' ')}]` : ''}`)
    if (dev.ghostRows) writeFileSync(join(here, `${PREFIX}-ghost-probe-${GHOST_BISECT || 0}-${at}.png`), png)
  }
  return lines
}

// --- the walk ----------------------------------------------------------------------------------
const app = await electron.launch({
  args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development' },
})
const notes = []
const consoleLines = []
const GPU_ERROR = /GLSL|shader|useProgram|WebGL|THREE\.WebGL|program not valid|CONTEXT_LOST/i
try {
  const page = await app.firstWindow()
  // GPU-side smoke test: a shader that fails to compile reports itself only on the renderer's
  // console (three logs the GLSL error, then `useProgram: program not valid` every frame) and the
  // scene silently draws nothing — the ground grid did exactly that for a reserved word. Every
  // console error/warning the walk sees is collected; GPU ones fail the run below.
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') consoleLines.push(`[${type}] ${msg.text().split('\n')[0].slice(0, 220)}`)
  })
  page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${String(err.message ?? err).split('\n')[0].slice(0, 220)}`))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('heading', { level: 1, name: 'Tōgō' }).waitFor({ timeout: 30_000 })
  await settle(page)
  await shot(page, 'welcome')
  // v8: the Welcome in the dark theme. The corner pill is the kit's ThemeToggle (group "Theme"),
  // the same control the sidebar's Appearance popover holds; back to Light so the walk's light
  // twins are the explicit preference, not whatever the OS says.
  const welcomeTheme = page.getByRole('group', { name: 'Theme' })
  await welcomeTheme.getByRole('button', { name: 'Dark' }).click()
  await page.mouse.move(720, 620)
  await settle(page)
  await shot(page, 'welcome-dark')
  await welcomeTheme.getByRole('button', { name: 'Light' }).click()
  await page.waitForTimeout(400)

  await page.getByText('observatory project').click()
  await page.getByText('Documents').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(2_500) // readiness poll lands; StageHome shows rows, not its skeleton
  const sidebar = page.locator('aside').first()

  if (PROBE === 'ghost') {
    // The probe is the whole run: no walk, no shots, the pointer untouched after the last click.
    for (const line of await ghostProbe(page)) console.log(line)
    throw new ProbeDone()
  }

  /** Click a SceneShell's Graph button if the table is showing, then wait for its canvas. */
  const ensureGraph = async (figure) => {
    const graph = figure.getByRole('button', { name: 'Graph', exact: true })
    if (await graph.count() && (await graph.getAttribute('aria-pressed')) !== 'true') await graph.click()
    await figure.locator('canvas').first().waitFor({ timeout: 30_000 }).catch(() => notes.push('no canvas appeared'))
  }
  const spine = page.getByTestId('spine-band')
  await ensureGraph(spine)
  await settle(page)
  await shot(page, 'stage-light')

  const setTheme = async (label) => {
    await sidebar.getByRole('button', { name: 'Appearance' }).click()
    await sidebar.getByRole('group', { name: 'Theme' }).getByRole('button', { name: label }).click()
    await sidebar.getByRole('button', { name: 'Appearance' }).click()
    await page.mouse.move(720, 450) // the popover closes under the pointer; park it off the sidebar
    await page.waitForTimeout(400)
  }
  await setTheme('Dark')
  await settle(page)
  await shot(page, 'stage-dark')
  await sidebar.getByRole('button', { name: /Design\. / }).hover()
  await settle(page)
  await shot(page, 'stage-dark-hover')
  await page.mouse.move(720, 450)
  await setTheme('Light')

  const openBuild = async (view) => {
    await page.getByRole('button', { name: /^Build Loop/ }).click()
    await page.getByRole('button', { name: view, exact: true }).click()
  }
  await openBuild('Sprint')
  await page.getByTestId('sprint-header').waitFor({ timeout: 60_000 })
  const figure = page.getByTestId('constellation-sprint')
  await ensureGraph(figure)
  await settle(page, 1_800)
  await shot(page, 'sprint-graph')
  notes.push(`devicePixelRatio: ${await page.evaluate(() => window.devicePixelRatio)}`)
  notes.push(`sprint-graph canvas: ${await page.evaluate(() => {
    const c = document.querySelector('[data-testid="constellation-sprint"] canvas')
    if (!c) return 'none'
    const r = c.getBoundingClientRect()
    return `css ${Math.round(r.width)}x${Math.round(r.height)}, buffer ${c.width}x${c.height}`
  })}`)
  const plate = figure.locator('[data-plate-id="0005"] button')
  if (await plate.count()) await plate.hover({ force: true })
  else notes.push('no plate for 0005')
  await settle(page)
  await shot(page, 'sprint-graph-hover')
  await page.mouse.move(720, 60)
  await figure.getByRole('button', { name: 'Table', exact: true }).click()
  await settle(page)
  await shot(page, 'sprint-table')
  if (process.env.SHOT_PROBE) {
    // Layout probe for the slate scroller (observatory v6): who clips, and does the fade render?
    const probe = await page.evaluate(() => {
      const scroller = document.querySelector('[aria-label="Sprint slate, scrolls sideways"]')
      const kit = scroller?.firstElementChild
      const table = kit?.querySelector('table')
      const cs = (el) => (el ? getComputedStyle(el) : null)
      const r = (el) => el ? el.getBoundingClientRect().toJSON() : null
      return {
        scroller: scroller && { sw: scroller.scrollWidth, cw: scroller.clientWidth, ov: cs(scroller).overflowX, rect: r(scroller), more: scroller.hasAttribute('data-more-right') },
        kit: kit && { tag: kit.tagName, cls: kit.className, ov: cs(kit).overflow, sw: kit.scrollWidth, cw: kit.clientWidth, rect: r(kit) },
        table: table && { w: table.getBoundingClientRect().width, layout: cs(table).tableLayout, width: cs(table).width },
        fade: !!document.querySelector('[data-testid="sprint-slate-fade"]'),
        main: (() => { const m = document.getElementById('main'); return m && { sw: m.scrollWidth, cw: m.clientWidth } })(),
      }
    })
    console.log('PROBE', JSON.stringify(probe))
  }

  await openBuild('Board')
  await page.getByRole('button', { name: 'Everything' }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Everything' }).click()
  await settle(page)
  await shot(page, 'board-list')
  await page.getByRole('group', { name: 'Board surface' }).getByRole('button', { name: 'Graph', exact: true }).click()
  await page.locator('canvas').first().waitFor({ timeout: 30_000 }).catch(() => notes.push('board: no canvas'))
  await settle(page, 1_800)
  await shot(page, 'board-graph')
  await page.getByRole('group', { name: 'Board surface' }).getByRole('button', { name: 'List', exact: true }).click()

  await page.keyboard.press('Meta+K')
  await page.getByTestId('command-palette').waitFor({ timeout: 10_000 })
  await page.keyboard.type('sprint')
  await settle(page, 600)
  await shot(page, 'palette')
  await page.keyboard.press('Escape')

  await sidebar.getByRole('button', { name: 'Settings' }).click()
  const appearance = page.locator('#appearance')
  await appearance.waitFor({ timeout: 60_000 })
  await appearance.scrollIntoViewIfNeeded()
  await settle(page)
  await shot(page, 'settings')

  await openBuild('Board')
  await page.getByRole('button', { name: 'Everything' }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Everything' }).click()
  await page.getByRole('button', { name: /^0001\b/ }).first().click()
  await page.waitForTimeout(2_000)
  await settle(page)
  await shot(page, 'spec-view')

  // v8 dark twins — the spec view where we stand, then the palette over the Board (as the light
  // shot) and Settings scrolled to Appearance (as the light shot).
  await setTheme('Dark')
  await settle(page)
  await shot(page, 'spec-view-dark')
  await page.getByRole('button', { name: '← Back to the board' }).click()
  await page.getByRole('button', { name: 'Everything' }).waitFor({ timeout: 60_000 })
  await page.keyboard.press('Meta+K')
  await page.getByTestId('command-palette').waitFor({ timeout: 10_000 })
  await page.keyboard.type('sprint')
  await settle(page, 600)
  await shot(page, 'palette-dark')
  await page.keyboard.press('Escape')
  await sidebar.getByRole('button', { name: 'Settings' }).click()
  await appearance.waitFor({ timeout: 60_000 })
  await appearance.scrollIntoViewIfNeeded()
  await settle(page)
  await shot(page, 'settings-dark')
  await setTheme('Light')

  // v8: Closing — the Spine with every plate carrying its ledger line (I4) above the Build
  // stage's own sign-off questions. The Graph toggle in <main> is the Spine's; no other figure.
  await openBuild('Closing')
  await page.getByRole('heading', { name: 'Declaring Build finished' }).waitFor({ timeout: 60_000 })
  await ensureGraph(page.locator('main#main'))
  await settle(page, 1_800)
  await shot(page, 'closing')
} catch (e) {
  if (!(e instanceof ProbeDone)) throw e
} finally {
  await app.close().catch(() => {})
  try { rmSync(workspace, { recursive: true, force: true }) } catch { /* untidy, not fatal */ }
}
for (const n of notes) console.log(n)
if (failures.length) { console.log('fixture commands that failed:'); for (const f of failures) console.log(`  - ${f}`) }
else console.log('fixture: every command succeeded')
console.log(`wrote ${readdirSync(here).filter((f) => f.startsWith(`${PREFIX}-`)).length} ${PREFIX}-*.png to ${here}`)
const gpu = consoleLines.filter((l) => GPU_ERROR.test(l))
console.log(`renderer console: ${consoleLines.length} error/warning line(s), ${gpu.length} GPU-related`)
for (const l of consoleLines.slice(0, 12)) console.log(`  ${l}`)
if (gpu.length) { console.log('GPU errors are a failed capture: a scene drew less than it claims.'); process.exitCode = 2 }
