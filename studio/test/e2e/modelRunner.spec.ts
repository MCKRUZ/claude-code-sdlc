/** Spec 0027's window, driven for real: the *Draft with Claude* controls — and, just as important, what
 * they do NOT do on their own.
 *
 * No automated test calls a live model, and the real `claude` CLI cannot be swapped for a stand-in
 * through the window (it is spawned by name, and a Windows stand-in cannot be a script), so the full
 * run is proven in the main process against the real plugin scripts and a stand-in executable
 * (draftEndToEnd.test.ts) and the screens against a mocked bridge. This file proves the part only a
 * real window can: the controls are on the real Workflow tab, read from the real plugin's
 * activities and coverage, and merely OPENING the screen starts no run and writes no file.
 * Skipped when no plugin checkout is beside this repository.
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

test.describe('[spec 0027] the model-run controls, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''
  let project = ''
  const discovery = () => join(project, '.sdlc', 'artifacts', '00-discovery')

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-model-runner-'))
    project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    mkdirSync(discovery(), { recursive: true })
    writeFileSync(join(discovery(), 'constitution.md'), '# Constitution\n\nThe project principles.\n')

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'model runner e2e project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('model runner e2e project').click()
    await expect(page.getByTestId('activities-panel')).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0027-model-runner.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  const row = (id: string) => page.locator(`[data-testid="activity-row"][data-activity-id="${id}"]`)
  // F11 (Observatory): a panel activity's row offers "Open" and its panel renders in the main
  // slot's FocusedActivityHost, so a test opens the activity first and reads the panel there.
  // The panel's own testids are unchanged; only where it lives moved.
  const panelOf = (id: string) => page.locator(`[data-testid="focused-activity-host"][data-activity-id="${id}"]`)
  const open = async (id: string) => {
    const button = row(id).getByRole('button', { name: 'Open' })
    if (await button.count()) await button.click()
    await expect(panelOf(id)).toBeVisible({ timeout: 30_000 })
  }

  test('a document with no summary gets a Draft with Claude button, and the screen says it uses Claude', async () => {
    await open('enhance')
    const panel = panelOf('enhance').getByTestId('narrative-panel')
    await expect(panel).toContainText('Uses Claude.', { timeout: 30_000 })
    await expect(panel.getByTestId('draft-row-constitution').getByRole('button', { name: 'Draft with Claude' })).toBeVisible()
    await expect(panel).toContainText('never mention velocity, story points')
  })

  test('the review offers its four modes, Council first, and a Run the review button', async () => {
    await open('review')
    const panel = panelOf('review').getByTestId('review-standing-panel')
    const group = panel.getByRole('radiogroup', { name: 'Review mode' })
    await expect(group.getByRole('radio')).toHaveCount(4)
    await expect(group.getByRole('radio').first()).toBeChecked()
    await expect(panel.getByRole('button', { name: 'Run the review' })).toBeVisible()
    await expect(panel).toContainText('Uses Claude.')
  })

  test('merely opening the screen starts no run and writes nothing', async () => {
    await expect(page.getByTestId('draft-running')).toHaveCount(0)
    await expect(page.getByTestId('candidate-view')).toHaveCount(0)
    expect(readdirSync(discovery()).sort()).toEqual(['constitution.md'])
    const state = await page.evaluate((p) => window.studio.getDraftState(p), project)
    expect(state).toEqual({ running: null, candidate: null })
  })

  test('cancelling when nothing is running is harmless', async () => {
    expect(await page.evaluate(() => window.studio.cancelDraft())).toEqual({ ok: true })
  })

  test('a request the main process cannot trust is refused before any process starts', async () => {
    const result = await page.evaluate((p) => window.studio.startDraft(p, {
      kind: 'enhance', stageId: '0', document: '../../outside.md',
    }), project)
    expect(result.ok).toBe(false)
    expect(readdirSync(discovery()).sort()).toEqual(['constitution.md'])
  })
})
