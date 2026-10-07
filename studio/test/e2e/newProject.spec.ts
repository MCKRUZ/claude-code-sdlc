/** Starting a project from nothing, in the real window.
 *
 * "Open folder…" used to be the only way in, so someone with no folder yet had to leave the app to
 * make one. This proves the whole path: New project…, a name, a location, a real folder and a real
 * git repository on disk, and the same setup wizard an existing folder goes through.
 *
 * The native folder dialog cannot be driven by Playwright, so the main process's showOpenDialog is
 * replaced for this run with one that answers with a temp directory — everything else is real.
 * Skipped when no plugin checkout is beside this repository (the setup wizard needs its profiles).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))

async function closeQuickly(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return
  // A close that does not return is killed rather than left for Playwright's worker teardown to wait on.
  const closed = await Promise.race([app.close().then(() => true).catch(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 15_000))])
  if (!closed) { try { app.process().kill('SIGKILL') } catch { /* already gone */ } }
}

test.describe('[new project] create a project folder from the Welcome screen', () => {
  test.skip(!PLUGIN.root, 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let workspace = ''
  let location = ''
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-newproject-'))
    location = join(workspace, 'where-projects-live')
    mkdirSync(location)
    const userData = join(workspace, 'userData')
    mkdirSync(userData)
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ recentProjects: [], pluginScriptsPathOverride: PLUGIN.scriptsDir }))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    // The OS folder chooser is not drivable; answer it with the temp location.
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as unknown as typeof dialog.showOpenDialog
    }, location)
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(30_000)
    await page?.screenshot({ path: 'test/screenshots/new-project.png' }).catch(() => {})
    await closeQuickly(app)
    try { if (workspace) rmSync(workspace, { recursive: true, force: true }) } catch { /* not a failed test */ }
  })

  test('the Welcome screen offers New project… alongside Open folder…', async () => {
    await expect(page.getByRole('button', { name: 'New project…' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Open folder…' })).toBeVisible()
  })

  test('Create project stays disabled until there is a name and a location', async () => {
    await page.getByRole('button', { name: 'New project…' }).click()
    const create = page.getByRole('button', { name: 'Create project' })
    await expect(create).toBeDisabled()
    await page.getByLabel('Project name').fill('Claims Portal')
    await expect(create).toBeDisabled() // no location yet
    await page.getByRole('button', { name: 'Choose location…' }).click()
    await expect(create).toBeEnabled()
    await expect(page.getByTestId('new-project-target')).toContainText('Claims Portal')
    await page.screenshot({ path: 'test/screenshots/new-project-form.png' })
  })

  test('an unsafe name is refused in plain words and nothing is created', async () => {
    await page.getByLabel('Project name').fill('bad:name')
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('alert')).toContainText(/can't contain/i)
    expect(existsSync(join(location, 'bad:name'))).toBe(false)
    await page.getByLabel('Project name').fill('Claims Portal')
  })

  test('creating it makes a real folder with a real git repository, then continues into the setup wizard', async () => {
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { name: 'Set up a project here' })).toBeVisible({ timeout: 60_000 })
    expect(existsSync(join(location, 'Claims Portal'))).toBe(true)
    expect(existsSync(join(location, 'Claims Portal', '.git'))).toBe(true)
  })
})
