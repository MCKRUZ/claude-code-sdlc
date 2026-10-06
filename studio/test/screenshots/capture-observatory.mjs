// Screenshots of the Observatory for the owner — NOT a spec. Launches the built test-mode app
// (run `npm run pretest` first) against a temporary project made by the plugin's own scripts
// (the same harness as test/e2e/sprint.spec.ts), walks six screens and writes
// test/screenshots/observatory-*.png. Run from studio/:
//
//   node test/screenshots/capture-observatory.mjs
//
// Why a script and not a spec: a spec asserts; this only looks. Putting it under test/e2e would
// make every e2e run pay for six screenshots nobody checks mechanically.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
// Studio lives in `studio/` inside the plugin, so the plugin is the parent directory.
const PLUGIN_ROOT = process.env.SDLC_PLUGIN_ROOT ?? resolve(root, '..')
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts')
const VENV_PYTHON = process.platform === 'win32'
  ? join(SCRIPTS_DIR, '.venv', 'Scripts', 'python.exe')
  : join(SCRIPTS_DIR, '.venv', 'bin', 'python')
const WEBGL_NOTICE = 'Graphics are not available in this window.'

if (!existsSync(VENV_PYTHON)) throw new Error(`no plugin venv at ${VENV_PYTHON} — run the plugin's pytest once to build it`)
if (!existsSync(join(root, 'dist', 'index.html'))) throw new Error('no dist/ — run `npm run pretest` first')

const py = (args) => execFileSync(VENV_PYTHON, args, { cwd: SCRIPTS_DIR, stdio: 'pipe' })
const shot = (page, name) => page.screenshot({ path: join(here, `observatory-${name}.png`) })

// --- fixture: a project with three specs and a planned sprint, like sprint.spec --------------
const workspace = mkdtempSync(join(tmpdir(), 'studio-shots-'))
const project = join(workspace, 'project')
py([join(SCRIPTS_DIR, 'init_project.py'), '--profile', join(PLUGIN_ROOT, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project])
for (const [name, risk] of [['duplicate claim 409', 'HIGH'], ['claim export', 'MEDIUM'], ['adjuster notes', 'LOW']]) {
  py([join(SCRIPTS_DIR, 'new_spec.py'), '--repo', project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'])
}
const specIds = readdirSync(join(project, 'specs')).filter((f) => /^\d{4}-/.test(f)).map((f) => f.slice(0, 4)).sort()
py([
  join(SCRIPTS_DIR, 'sprint.py'), 'new', '--repo', project, '--sprint', 'S07', '--goal', 'Adjusters file without a phone call',
  '--start', '2026-09-28', '--target', '3', '--mix', 'HIGH:1,MEDIUM:1,LOW:1', '--by', 'Priya N.',
])
py([join(SCRIPTS_DIR, 'sprint.py'), 'slate', '--repo', project, '--sprint', 'S07', ...specIds.flatMap((id) => ['--spec', id]), '--by', 'Priya N.'])

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
  await page.getByText('Loading…').waitFor({ state: 'hidden', timeout: 30_000 })
  await shot(page, 'welcome')

  const openProject = async () => {
    await page.getByText('observatory project').click()
    await page.getByText('Documents').first().waitFor({ timeout: 60_000 })
    // Let the readiness poll land so the stage home shows real rows rather than its skeleton.
    await page.waitForTimeout(2_500)
  }
  await openProject()
  await shot(page, 'stage-light')

  // Dark through the real control: the sidebar's Appearance button opens the Theme group, and the
  // toggle writes `localStorage['studio.theme']` itself (a reload of the Electron window stalled
  // the project re-open, so the preference is driven, not re-read).
  const setTheme = async (label) => {
    const sidebar = page.locator('aside').first()
    await sidebar.getByRole('button', { name: 'Appearance' }).click()
    await sidebar.getByRole('group', { name: 'Theme' }).getByRole('button', { name: label }).click()
    await sidebar.getByRole('button', { name: 'Appearance' }).click()
    await page.waitForTimeout(800)
  }
  await setTheme('Dark')
  notes.push(`studio.theme after the Dark pick: ${await page.evaluate(() => localStorage.getItem('studio.theme'))}`)
  await shot(page, 'stage-dark')
  await setTheme('Light')

  // Sprint → Graph. In the test-mode build the default surface is the table; the toggle shows
  // either the canvas or the WebGL notice — both are the honest answer for this machine.
  await page.getByRole('button', { name: /^Build Loop/ }).click()
  await page.getByRole('button', { name: 'Sprint', exact: true }).click()
  await page.getByTestId('sprint-header').waitFor({ timeout: 60_000 })
  const figure = page.getByTestId('constellation-sprint')
  await figure.getByRole('button', { name: /^Graph/ }).click()
  const deadline = Date.now() + 30_000
  let surface = 'neither'
  while (Date.now() < deadline) {
    if (await figure.locator('canvas').count()) { surface = 'canvas'; break }
    if (await figure.getByText(WEBGL_NOTICE).count()) { surface = 'webgl-notice'; break }
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(1_500) // the layout settles over a few frames
  await shot(page, 'sprint-graph')
  notes.push(`sprint-graph shows: ${surface}`)

  await page.getByRole('button', { name: /^Build Loop/ }).click()
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await page.getByRole('button', { name: 'Everything' }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Everything' }).click()
  await page.waitForTimeout(1_000)
  await shot(page, 'board')

  await page.locator('aside').first().getByRole('button', { name: 'Settings' }).click()
  const appearance = page.locator('#appearance')
  await appearance.waitFor({ timeout: 60_000 })
  await appearance.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await shot(page, 'settings-appearance')
} finally {
  await app.close().catch(() => {})
  try { rmSync(workspace, { recursive: true, force: true }) } catch { /* untidy, not fatal */ }
}
for (const n of notes) console.log(n)
console.log(`wrote ${readdirSync(here).filter((f) => f.startsWith('observatory-')).length} observatory-*.png to ${here}`)
