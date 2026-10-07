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
 * The scene is registered, so the figure is WAITED for, never skipped: the old Wave 3 guard
 * (`test.skip` when the slot had not rendered yet) fired on timing and let three stale
 * assertions pass vacuously for several waves. The window is widened to 1440 px first — the
 * graph needs a host ≥ `MIN_GRAPH_WIDTH` (640 px), and the default 1280 px window leaves
 * `<main>` ≈ 564 px beside the `w-72` sidebar and the 380 px chat, where the figure honestly
 * says "Widen the window…" and offers no Graph at all.
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

const LEGEND = "Bodies are specs sized by risk tier; edges are depends_on as declared; x follows the plugin's build order and the thin accent path joins the slate in that order; y and z carry no meaning."
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
    await page.setViewportSize({ width: 1440, height: 900 })
    page.on('pageerror', (err) => pageErrors.push(String(err)))
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('constellation project').click()
    // Recorded pin changes (togo-command-center.md §1, §3.1, §8): the strip's navigation is the
    // landing fact (the Build station expands only on click), and the Sprint view is now "Home".
    // The slate constellation stays behind SceneShell's toggle with `sprint-slate` as its Table
    // twin, so every assertion below is unchanged.
    await expect(page.getByRole('navigation', { name: 'Project' })).toBeVisible({ timeout: 30_000 })
    await openBuildView(page, 'Home')
    await expect(page.getByTestId('sprint-slate')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('constellation-sprint')).toBeVisible({ timeout: 60_000 })
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
    await expect(figure).toBeVisible()
    await expect(figure).toHaveAttribute('data-surface', 'table')
    await expect(figure.locator('figcaption')).toHaveText(LEGEND)
    // The slate IS the table: no second table, one NOT READY per slated spec. Counted INSIDE the
    // slate, exactly as sprint.spec does: the readiness card below carries the plugin's own gap
    // lines ("status is draft, not ready"), which Playwright's case-insensitive substring match
    // also counts — the same fact in the plugin's words, not a fourth row. (This assertion had
    // never run before round 2: the Wave 3 guard skipped it, and it was already false page-wide.)
    await expect(page.getByTestId('sprint-slate').getByText('NOT READY')).toHaveCount(3)
    await expect(figure.locator('canvas')).toHaveCount(0)
  })

  test('toggling to Graph gives a canvas or the WebGL notice, and never a page error', async () => {
    const figure = page.getByTestId('constellation-sprint')
    const graph = figure.getByRole('button', { name: /^Graph/ })
    // On a runner without hardware graphics (the ubuntu job under xvfb) or in a window under
    // MIN_GRAPH_WIDTH, the shell disables the toggle and says why in its title — the honest
    // refusal IS the expected outcome there, so the test reads the reason instead of clicking.
    if (await graph.isDisabled()) {
      expect(await graph.getAttribute('title')).toMatch(/Graphics are not available|Widen the window/)
      await expect(figure).toHaveAttribute('data-surface', 'table')
      await expect(figure.locator('canvas')).toHaveCount(0)
      expect(pageErrors).toEqual([])
      return
    }
    await graph.click()
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
    const table = figure.getByRole('button', { name: /^Table/ })
    // Without hardware graphics (the ubuntu runner) the whole toggle is disabled and the figure
    // never left the table — nothing to click, the assertions below still hold.
    if (!(await table.isDisabled())) await table.click()
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
