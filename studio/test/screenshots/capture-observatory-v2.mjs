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
// canvas size for sprint-graph.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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

// --- the walk ----------------------------------------------------------------------------------
const app = await electron.launch({
  args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development' },
})
const notes = []
try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('heading', { level: 1, name: 'Tōgō' }).waitFor({ timeout: 30_000 })
  await settle(page)
  await shot(page, 'welcome')

  await page.getByText('observatory project').click()
  await page.getByText('Documents').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(2_500) // readiness poll lands; StageHome shows rows, not its skeleton
  const sidebar = page.locator('aside').first()

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
} finally {
  await app.close().catch(() => {})
  try { rmSync(workspace, { recursive: true, force: true }) } catch { /* untidy, not fatal */ }
}
for (const n of notes) console.log(n)
if (failures.length) { console.log('fixture commands that failed:'); for (const f of failures) console.log(`  - ${f}`) }
else console.log('fixture: every command succeeded')
console.log(`wrote ${readdirSync(here).filter((f) => f.startsWith(`${PREFIX}-`)).length} ${PREFIX}-*.png to ${here}`)
