/** The Dependency Constellation on the Sprint screen, in the real window (studio-observatory.md
 * §5.2, §11 Wave 2 S2). Mirrors `sprint.spec.ts`'s harness: the fixture is built by the plugin's
 * own scripts, the app is launched once, and the Sprint view is reached through the sidebar.
 *
 * The promises: in a `--mode=test` build the figure opens on its TABLE surface (the slate below
 * is that table — no second table, so the sprint spec's NOT READY count holds); switching to
 * Graph yields either a canvas or the "hardware graphics are unavailable" notice and never a page
 * error; switching back shows the slate; and the Graph / Table toggle lives OUTSIDE
 * `[data-testid=sprint-board]`, so the board's own three buttons are exactly what they were.
 *
 * Until Wave 3 registers the scene (`registerScene('constellation-sprint', …)`) the slot renders
 * nothing; the suite then skips LOUDLY rather than pass vacuously. Wave 3: delete that guard.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python

const LEGEND = "Bodies are specs sized by risk tier; edges are depends_on as declared; x follows the plugin's build order; y and z carry no meaning."
const WEBGL_NOTICE = 'hardware graphics are unavailable here'

let app: ElectronApplication
let page: Page
let workspace = ''
let specIds: string[] = []
const pageErrors: string[] = []

function py(args: string[]): void {
  execFileSync(VENV_PYTHON, args, { cwd: SCRIPTS_DIR })
}

async function openBuildView(target: Page, view: string) {
  await target.getByRole('button', { name: /^Build Loop/ }).click()
  await target.getByRole('button', { name: view, exact: true }).click()
}

test.describe('[observatory S2] the dependency constellation on the Sprint screen', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-constellation-'))
    const project = join(workspace, 'project')

    py([join(SCRIPTS_DIR, 'init_project.py'), '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project])
    for (const [name, risk] of [['duplicate claim 409', 'HIGH'], ['claim export', 'MEDIUM'], ['adjuster notes', 'LOW']]) {
      py([join(SCRIPTS_DIR, 'new_spec.py'), '--repo', project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'])
    }
    specIds = readdirSync(join(project, 'specs')).filter((f) => /^\d{4}-/.test(f)).map((f) => f.slice(0, 4)).sort()
    py([
      join(SCRIPTS_DIR, 'sprint.py'), 'new', '--repo', project, '--sprint', 'S07', '--goal', 'Adjusters file without a phone call',
      '--start', '2026-09-28', '--target', '3', '--mix', 'HIGH:1,MEDIUM:1,LOW:1', '--by', 'Priya N.',
    ])
    py([join(SCRIPTS_DIR, 'sprint.py'), 'slate', '--repo', project, '--sprint', 'S07', ...specIds.flatMap((id) => ['--spec', id]), '--by', 'Priya N.'])

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'constellation project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    page.on('pageerror', (err) => pageErrors.push(String(err)))
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('constellation project').click()
    await expect(page.getByText('Documents').first()).toBeVisible({ timeout: 30_000 })
    await openBuildView(page, 'Sprint')
    await expect(page.getByTestId('sprint-slate')).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/observatory-constellation.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch {
      // A leftover temp directory is untidy, not a failure worth reddening a green run.
    }
  })

  test('Sprint shows the figure on its table surface by default, with the honesty caption', async () => {
    const figure = page.getByTestId('constellation-sprint')
    // Wave 3 guard — see the file comment. Remove once the scene is registered.
    test.skip((await figure.count()) === 0, 'constellation-sprint is not registered yet (Wave 3 registers the scene)')
    await expect(figure).toBeVisible()
    await expect(figure).toHaveAttribute('data-surface', 'table')
    await expect(figure.locator('figcaption')).toHaveText(LEGEND)
    // The slate IS the table: no second table, one NOT READY per slated spec.
    await expect(page.getByText('NOT READY')).toHaveCount(3)
    await expect(figure.locator('canvas')).toHaveCount(0)
  })

  test('toggling to Graph gives a canvas or the WebGL notice, and never a page error', async () => {
    const figure = page.getByTestId('constellation-sprint')
    test.skip((await figure.count()) === 0, 'constellation-sprint is not registered yet (Wave 3 registers the scene)')
    await figure.getByRole('button', { name: /^Graph/ }).click()
    await expect
      .poll(async () => (await figure.locator('canvas').count()) > 0 || (await figure.getByText(WEBGL_NOTICE).count()) > 0, { timeout: 30_000 })
      .toBe(true)
    // A plate, when the graph drew, is a real button named "Spec NNNN: title", never a bare id.
    const plates = figure.locator('[data-plate-id] button')
    if ((await plates.count()) > 0) {
      await expect(plates.first()).toHaveAttribute('aria-label', /^Spec \d{4}: /)
      await expect(figure.getByRole('button', { name: specIds[1], exact: true })).toHaveCount(0)
    }
    expect(pageErrors).toEqual([])
  })

  test('toggling back to Table shows the slate again', async () => {
    const figure = page.getByTestId('constellation-sprint')
    test.skip((await figure.count()) === 0, 'constellation-sprint is not registered yet (Wave 3 registers the scene)')
    await figure.getByRole('button', { name: /^Table/ }).click()
    await expect(figure).toHaveAttribute('data-surface', 'table')
    await expect(page.getByTestId('sprint-slate')).toBeVisible()
    await expect(figure.locator('canvas')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })

  test('the sprint board still offers exactly Planning page / Refresh / Review page', async () => {
    const buttons = await page.getByTestId('sprint-board').getByRole('button').allTextContents()
    const names = buttons.filter((b) => !specIds.includes(b.trim()))
    expect(names.sort()).toEqual(['Planning page', 'Refresh', 'Review page'])
    // The surface toggle sits outside the board.
    await expect(page.getByTestId('sprint-board').getByTestId('surface-toggle')).toHaveCount(0)
  })
})
