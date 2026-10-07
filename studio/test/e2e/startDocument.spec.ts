/** "Start this document", in the real window (smoke review, bug 2).
 *
 * A document that does not exist yet used to show a blue Edit button that failed with "<path> does not
 * exist". It now shows "Start this document", which creates the file from the plugin's own template and
 * opens it. This drives that against a real project and the real plugin templates, and checks the file on disk.
 * The live model is switched off (opening a stage would otherwise greet with a real call).
 * Skipped when no plugin checkout is beside this repository.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'
import { switchOffLiveModel } from '../smoke/noLiveModel'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))

test.describe('[smoke bug 2] Start this document, in the real window', () => {
  test.skip(!PLUGIN.root || !existsSync(PLUGIN.python), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''
  let project = ''
  const constitution = () => join(project, '.sdlc', 'artifacts', '00-discovery', 'constitution.md')

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-start-doc-'))
    project = join(workspace, 'project')
    execFileSync(PLUGIN.python, [
      join(PLUGIN.scriptsDir, 'init_project.py'),
      '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: PLUGIN.scriptsDir })
    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'start document project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: PLUGIN.scriptsDir,
    }, null, 2))
    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    await switchOffLiveModel(app)
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('start document project').click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/start-document.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try { if (workspace) rmSync(workspace, { recursive: true, force: true }) } catch { /* not a failed test */ }
  })

  test('a document that is not there offers Start this document, and Edit is switched off', async () => {
    expect(existsSync(constitution())).toBe(false)
    await expect(page.getByRole('button', { name: 'Start this document' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled()
  })

  test('pressing it creates the file from the template and opens it for editing, with no error', async () => {
    await page.getByRole('button', { name: 'Start this document' }).click()
    await expect(page.getByRole('heading', { name: 'constitution.md', level: 2 })).toBeVisible({ timeout: 60_000 })
    expect(existsSync(constitution())).toBe(true)
    expect(readFileSync(constitution(), 'utf-8').length).toBeGreaterThan(50)
    await expect(page.getByText(/does not exist/)).toHaveCount(0)
  })

  test('back on the stage the started document is no longer offered for starting, and the next one is', async () => {
    await page.getByRole('button', { name: '← Back to the stage' }).click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 30_000 })
    const step = page.locator('[data-testid="workflow-step"][data-step-key$="constitution.md"]')
    await expect(step).toHaveAttribute('data-step-status', 'done')
    // The step panel moved on to the next document, which does not exist yet either.
    await expect(page.getByRole('heading', { name: 'problem-statement.md', level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start this document' })).toHaveCount(1)
  })
})
