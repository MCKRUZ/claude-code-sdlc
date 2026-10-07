/** The persistent shell's accessibility invariants, in the real window (Observatory §8.3).
 *
 * These are the promises every other e2e spec leans on without saying so: the shell holds no
 * `<input>` (board.spec counts page-wide inputs), exactly two `<aside>`s in sidebar-then-chat
 * order (stepAuthoring reads `aside.first()`), one `aria-current` at a time, `<main>` renders the
 * screen root as its first child with no wrapper (workflow.spec measures it), the chat width is
 * the default 380 (chatLook's double-click pin), and the new footer buttons and console handle
 * carry the roles the design gives them.
 *
 * The fixture is the plugin's own init_project.py, the same launch harness as sprint.spec.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')

// Located once, in one place, and LOUD when it cannot be found. See test/pluginRoot.ts.
const PLUGIN = requirePlugin(join(root, 'test'))

const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python

let app: ElectronApplication
let page: Page
let workspace = ''

function py(args: string[]): void {
  execFileSync(VENV_PYTHON, args, { cwd: SCRIPTS_DIR })
}

test.describe('[observatory P1] the shell\'s accessibility invariants in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-a11y-'))
    const project = join(workspace, 'project')
    py([join(SCRIPTS_DIR, 'init_project.py'), '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project])

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'a11y project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('a11y project').click()
    await expect(page.getByRole('navigation', { name: 'Project' })).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/observatory-a11y.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch {
      // A leftover temp directory is untidy, not a failure worth reddening a green run.
    }
  })

  test('the shell holds no <input>, and exactly two <aside>s: the sidebar, then the chat', async () => {
    await expect(page.locator('input')).toHaveCount(0)
    const asides = page.locator('aside')
    await expect(asides).toHaveCount(2)
    await expect(asides.nth(0).getByRole('navigation', { name: 'Project' })).toBeVisible()
    await expect(asides.nth(1).getByRole('heading', { name: 'Chat' })).toBeVisible()
  })

  test('one thing is the current page, and <main> renders the screen root as its first child', async () => {
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
    const main = page.locator('main#main')
    await expect(main).toHaveAttribute('tabindex', '-1')
    // The stage home shows a `role="status"` skeleton (no heading yet) while the plugin reports
    // readiness; the one-shot evaluate below must run against the real screen, not the skeleton.
    await expect(main.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 })
    // No wrapper between <main> and the screen: the first element child contains the page heading.
    const firstChildHoldsHeading = await main.evaluate((el) => {
      const first = el.firstElementChild
      return first !== null && first.querySelector('h2') !== null && el.children.length === 1
    })
    expect(firstChildHoldsHeading).toBe(true)
  })

  test('the chat panel is still 380 wide and the skip link comes first', async () => {
    const width = await page.locator('aside').nth(1).evaluate((el) => Math.round(el.getBoundingClientRect().width))
    expect(width).toBe(380)
    const skip = page.locator('#root a[href="#main"]')
    await expect(skip).toHaveCount(1)
    const isFirst = await skip.evaluate((el) => el.parentElement?.firstElementChild === el || el.closest('#root')?.querySelector('a') === el)
    expect(isFirst).toBe(true)
  })

  test('the sidebar reports progress as a progressbar and offers Search and Appearance as buttons', async () => {
    const sidebar = page.locator('aside').first()
    await expect(sidebar.getByRole('progressbar', { name: 'stages done' })).toHaveCount(1)
    await expect(sidebar.getByRole('button', { name: /^Search/ })).toBeVisible()
    const appearance = sidebar.getByRole('button', { name: 'Appearance' })
    await expect(appearance).toHaveAttribute('aria-expanded', 'false')
    await appearance.click()
    await expect(appearance).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar.getByRole('group', { name: 'Theme' })).toBeVisible()
    // Preferences are buttons with aria-pressed; still no input anywhere on the page.
    await expect(sidebar.locator('[role="group"][aria-label="Theme"] button[aria-pressed="true"]')).toHaveCount(1)
    await expect(page.locator('input')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(appearance).toHaveAttribute('aria-expanded', 'false')
    await expect(sidebar.locator('[role="tab"]')).toHaveCount(0)
  })

  test('the console opens with a labelled resize handle and remembers its height', async () => {
    const consoleButton = page.locator('aside').first().getByRole('button', { name: 'Console' })
    await consoleButton.click()
    await expect(consoleButton).toHaveAttribute('aria-pressed', 'true')
    const handle = page.getByRole('separator', { name: 'Resize console' })
    await expect(handle).toBeVisible()
    await expect(page.getByRole('group', { name: 'Console view' }).getByRole('button', { name: 'Plain' })).toHaveAttribute('aria-pressed', 'true')
    await handle.focus()
    await page.keyboard.press('ArrowUp')
    const stored = await page.evaluate(() => localStorage.getItem('studio.consoleHeight'))
    expect(Number(stored)).toBeGreaterThan(256)
    await consoleButton.click()
    await expect(handle).toHaveCount(0)
  })
})
