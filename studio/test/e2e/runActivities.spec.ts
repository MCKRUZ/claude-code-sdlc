/** Spec 0026's window, driven for real: the four panels that need no model — phase report, reference
 * documents (intake), summary coverage and the review picture — against the real plugin.
 *
 * The unit tests pin every string and argv against a mocked bridge. What only the real window can
 * prove: that the plugin's scripts really run from these buttons, that the catalogue is not created
 * just by looking at the screen, that locking really freezes the controls, and that a report really
 * lands on disk. Skipped when no plugin checkout is beside this repository.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python

test.describe('[spec 0026] the run activities, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''
  let project = ''
  const catalog = () => join(project, '.sdlc', 'context', 'intake', 'catalog.json')

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-run-activities-'))
    project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    // Intake only exists for a project whose profile names a folder of reference documents.
    const intakeDir = join(project, 'docs', 'intake')
    mkdirSync(intakeDir, { recursive: true })
    for (const name of ['rfp.md', 'api-notes.md', 'policy.md']) {
      writeFileSync(join(intakeDir, name), `# ${name}\n\nSome reference text for ${name}.\n`)
    }
    const profilePath = join(project, '.sdlc', 'profile.yaml')
    writeFileSync(profilePath, `${readFileSync(profilePath, 'utf-8')}\ndocumentation:\n  intake_path: "docs/intake"\n  types: [markdown]\n`)

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'run activities e2e project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('run activities e2e project').click()
    await expect(page.getByTestId('activities-panel')).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0026-run-activities.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  const row = (id: string) => page.locator(`[data-testid="activity-row"][data-activity-id="${id}"]`)
  // F11 (Observatory): a panel activity's row offers "Open" and its panel renders in the main
  // slot's FocusedActivityHost, so a test opens the activity first and reads the panel there.
  // The panel's own testids are unchanged; only where it lives moved.
  const panel = (id: string) => page.locator(`[data-testid="focused-activity-host"][data-activity-id="${id}"]`)
  const open = async (id: string) => {
    const button = row(id).getByRole('button', { name: 'Open' })
    if (await button.count()) await button.click()
    await expect(panel(id)).toBeVisible({ timeout: 30_000 })
  }

  test('Discovery draws the four panel activities', async () => {
    for (const id of ['intake', 'enhance', 'review', 'phase-report']) await expect(row(id)).toHaveCount(1)
  })

  test('looking at the screen does not create the catalogue — only the button does', async () => {
    await open('intake')
    await expect(panel('intake').getByRole('button', { name: 'Catalogue the documents' })).toBeVisible()
    expect(existsSync(catalog())).toBe(false)
    await panel('intake').getByRole('button', { name: 'Catalogue the documents' }).click()
    await expect(panel('intake').getByTestId('intake-row')).toHaveCount(3, { timeout: 60_000 })
    expect(existsSync(catalog())).toBe(true)
    await expect(panel('intake').getByTestId('intake-row').first()).toContainText('DOC-001')
  })

  test('skipping a document is final here: its box is checked and disabled', async () => {
    await open('intake')
    const third = panel('intake').locator('[data-doc-id="DOC-003"]')
    // A click, not .check(): the box is controlled by the catalogue the script returns (no optimistic
    // state), so it only changes once the script has answered.
    await third.getByRole('checkbox', { name: 'Skip DOC-003' }).click()
    await expect(third.getByRole('checkbox', { name: 'Skip DOC-003' })).toBeDisabled({ timeout: 30_000 })
    await expect(third).toContainText('cannot be undone')
  })

  test('locking asks first, then freezes the controls', async () => {
    await open('intake')
    await panel('intake').getByRole('button', { name: 'Lock these ids' }).click()
    await expect(panel('intake').getByTestId('intake-lock-confirm')).toContainText('permanent')
    await panel('intake').getByRole('button', { name: 'Yes, lock them' }).click()
    await expect(panel('intake')).toContainText('These ids are frozen.', { timeout: 60_000 })
    await expect(panel('intake').getByRole('button', { name: 'Lock these ids' })).toHaveCount(0)
    expect(JSON.parse(readFileSync(catalog(), 'utf-8')).locked).toBe(true)
  })

  test('Export this stage\'s report writes the file and says how many documents it found', async () => {
    await open('phase-report')
    const report = join(project, '.sdlc', 'reports', '00-discovery-report.html')
    expect(existsSync(report)).toBe(false)
    await panel('phase-report').getByRole('button', { name: "Export this stage's report" }).click()
    const result = panel('phase-report').getByTestId('phase-report-result')
    await expect(result).toContainText('Report written: 0 of 5 documents present', { timeout: 60_000 })
    await expect(result).toContainText('Missing:')
    await expect(result).not.toContainText(/complete/i)
    expect(existsSync(report)).toBe(true)
    await expect(panel('phase-report')).toContainText('not shared with the team')
  })

  test('with no documents yet, the summary panel says so instead of "0 of 0"', async () => {
    await open('enhance')
    const summary = panel('enhance').getByTestId('narrative-panel')
    await expect(summary).toContainText('No documents in this stage yet', { timeout: 30_000 })
    await expect(summary).not.toContainText('0 of 0')
  })

  test('with nothing tracked, the review panel says so instead of a row of zeros', async () => {
    await open('review')
    await expect(panel('review').getByTestId('review-standing-panel')).toContainText('No review findings recorded yet', { timeout: 30_000 })
  })
})
