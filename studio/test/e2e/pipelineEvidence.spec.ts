/** The Foundation stage's "Gather pipeline evidence" button, in the real window.
 *
 * Runs the plugin's real pipeline_proof.py through the real app. A freshly initialised project
 * has no GitHub repository behind it, so the script cannot read any history — which makes this the
 * honest, hermetic case to prove here: the button must report that plainly, in the app, rather
 * than hang, crash or show an empty "everything fine" table. The success path (classification,
 * rendering, the document it writes) is covered against fixture GitHub data in the plugin's own
 * tests and against the real repository by hand.
 *
 * Skipped when no plugin checkout is beside this repository (same as chatAuthoring.spec.ts).
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python

async function closeQuickly(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return
  // A close that does not return is killed rather than left for Playwright's worker teardown to wait on.
  const closed = await Promise.race([app.close().then(() => true).catch(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 15_000))])
  if (!closed) { try { app.process().kill('SIGKILL') } catch { /* already gone */ } }
}

test.describe('[pipeline evidence] the Foundation stage button', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let workspace = ''
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-pipeline-'))
    const project = join(workspace, 'project')
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    // Every Foundation document present, so opening the stage makes no model call of its own.
    const dir = join(project, '.sdlc', 'artifacts', '03-foundation')
    mkdirSync(dir, { recursive: true })
    const fixtures = join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents')
    for (const name of ['foundation-report', 'risk-tier-map', 'cadence-plan', 'build-handoff']) {
      cpSync(join(fixtures, `${name}.md`), join(dir, `${name}.md`))
    }
    writeFileSync(join(dir, 'data-flow-brief.md'), '# Data Flow Brief\n\nHow data moves through the walking skeleton.\n')
    const statePath = join(project, '.sdlc', 'state.yaml')
    writeFileSync(
      statePath,
      readFileSync(statePath, 'utf-8')
        .replace(/^current_phase:.*$/m, 'current_phase: "3"')
        .replace(/^phase_name:.*$/m, 'phase_name: "foundation"'),
      'utf-8',
    )

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'pipeline evidence project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(30_000)
    await page?.screenshot({ path: 'test/screenshots/pipeline-evidence.png' }).catch(() => {})
    await closeQuickly(app)
    try { if (workspace) rmSync(workspace, { recursive: true, force: true }) } catch { /* not a failed test */ }
  })

  test('the Foundation stage offers the button, and nothing runs until it is pressed', async () => {
    await page.getByText('pipeline evidence project').click()
    await expect(page.getByRole('heading', { name: 'Pipeline evidence' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Gather pipeline evidence' })).toBeVisible()
    await expect(page.getByText(/nothing is opened, merged or changed/i)).toBeVisible()
  })

  test('with no code-host repository behind the project, it says so plainly instead of hanging or showing an empty table', async () => {
    await page.getByRole('button', { name: 'Gather pipeline evidence' }).click()
    // Either CLI's name, by the project's host (code-host providers §7.1): "GitHub CLI (gh)" or
    // "Azure CLI (az) with the azure-devops extension" — or the host-none sentence, which names both.
    const alert = page.getByRole('alert').filter({ hasText: /GitHub CLI|Azure CLI|not GitHub or Azure DevOps/ })
    await expect(alert).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId('pipeline-evidence-running')).toHaveCount(0)
    await expect(page.getByTestId('pipeline-rails')).toHaveCount(0) // no table of "fine" rails invented
    await expect(page.getByRole('button', { name: 'Gather pipeline evidence' })).toBeEnabled()
  })

  test('it wrote nothing: a failed read leaves no pipeline-proof.md behind', () => {
    const doc = join(workspace, 'project', '.sdlc', 'artifacts', '03-foundation', 'pipeline-proof.md')
    expect(existsSync(doc)).toBe(false)
  })
})
