/** Spec 0029's window, driven for real: summarising and analysing the reference documents, and the
 * registry button, against the real plugin — up to the point where a model would be started.
 *
 * No automated test calls a live model, and the real `claude` CLI is spawned by name so a stand-in
 * cannot be swapped in through the window, so the runs themselves are proven in the main process
 * (draftBatch*.test.ts, against the real plugin scripts and a stand-in executable). What only the real
 * window can prove: the controls are on the real Discovery stage, they are gated on the catalogue being
 * locked, the confirmation lists the documents and starts nothing until Start, the main process refuses
 * what it should, and the registry button really writes the registry through the real script.
 * Skipped when no plugin checkout is beside this repository.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python

test.describe('[spec 0029] the batch model jobs, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''
  let project = ''
  const intakeDir = () => join(project, '.sdlc', 'context', 'intake')
  const intake = (...args: string[]) =>
    execFileSync(VENV_PYTHON, [join(SCRIPTS_DIR, 'intake_documents.py'), '--state', join(project, '.sdlc', 'state.yaml'), ...args], { cwd: SCRIPTS_DIR })

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-batch-jobs-'))
    project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    const docs = join(project, 'docs', 'intake')
    mkdirSync(docs, { recursive: true })
    for (const name of ['rfp.md', 'api-notes.md', 'policy.md']) writeFileSync(join(docs, name), `# ${name}\n\nReference text for ${name}.\n`)
    const profilePath = join(project, '.sdlc', 'profile.yaml')
    writeFileSync(profilePath, `${readFileSync(profilePath, 'utf-8')}\ndocumentation:\n  intake_path: "docs/intake"\n  types: [markdown]\n`)
    intake() // catalogue, but do NOT lock yet: the first test is about the locked gate

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'batch jobs e2e project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('batch jobs e2e project').click()
    await expect(page.getByTestId('activities-panel')).toBeVisible({ timeout: 30_000 })
    // F11 (Observatory): the intake panel renders in the main slot once its row is opened.
    await page.locator('[data-testid="activity-row"][data-activity-id="intake"]').getByRole('button', { name: 'Open' }).click()
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0029-batch-jobs.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  const panel = () => page.locator('[data-testid="focused-activity-host"][data-activity-id="intake"]').getByTestId('intake-panel')
  const summaries = () => readdirSync(intakeDir()).filter((f) => /^DOC-\d+-.+\.md$/.test(f))

  test('before the ids are locked the screen says to lock them, and offers no model button', async () => {
    await panel().getByRole('button', { name: 'Catalogue the documents' }).click()
    await expect(panel().getByTestId('intake-row')).toHaveCount(3, { timeout: 60_000 })
    await expect(panel()).toContainText('Lock the document ids to summarise them.')
    await expect(panel().getByRole('button', { name: 'Summarise the documents' })).toHaveCount(0)
  })

  test('once locked, the model buttons appear, say they use Claude, and nothing has run', async () => {
    await panel().getByRole('button', { name: 'Lock these ids' }).click()
    await panel().getByRole('button', { name: 'Yes, lock them' }).click()
    await expect(panel().getByRole('button', { name: 'Summarise the documents' })).toBeVisible({ timeout: 60_000 })
    await expect(panel().getByRole('button', { name: 'Analyse the documents' })).toBeVisible()
    await expect(panel()).toContainText('Uses Claude.')
    expect(summaries()).toEqual([])
  })

  test('Summarise lists every document and asks first; cancelling starts nothing and writes nothing', async () => {
    await panel().getByRole('button', { name: 'Summarise the documents' }).click()
    const confirm = panel().getByTestId('batch-confirm')
    await expect(confirm).toContainText('Claude runs once for each of these 3 documents.', { timeout: 30_000 })
    for (const line of ['DOC-001 · ', 'DOC-002 · ', 'DOC-003 · ']) await expect(confirm).toContainText(line)
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toHaveCount(0)
    const state = await page.evaluate((p) => window.studio.getBatchState(p), project)
    expect(state).toEqual({ job: null, candidates: [] })
    expect(summaries()).toEqual([])
  })

  test('Analyse is refused by the main process until at least two documents have summaries', async () => {
    await panel().getByRole('button', { name: 'Analyse the documents' }).click()
    await expect(panel().getByRole('alert')).toContainText('Summarise at least two documents first', { timeout: 30_000 })
    expect(await page.evaluate((p) => window.studio.getBatchState(p), project)).toEqual({ job: null, candidates: [] })
  })

  test('a request the main process cannot trust starts no batch', async () => {
    const result = await page.evaluate((p) => window.studio.startBatch(p, 'delete-everything' as never), project)
    expect(result.ok).toBe(false)
    expect(summaries()).toEqual([])
  })

  test('Write the registry and index runs the real script and writes both files', async () => {
    const registry = join(project, '.sdlc', 'artifacts', '00-discovery', 'document-registry.md')
    const index = join(intakeDir(), 'index.md')
    expect(existsSync(registry) || existsSync(index)).toBe(false)
    await panel().getByRole('button', { name: 'Write the registry and index' }).click()
    const result = panel().getByTestId('registry-result')
    await expect(result).toContainText('3 documents, 0 summarised', { timeout: 60_000 })
    await expect(result).toContainText('Not yet summarised: DOC-001, DOC-002, DOC-003')
    expect(existsSync(registry) && existsSync(index)).toBe(true)
    expect(readFileSync(registry, 'utf-8')).toContain('(not yet summarised)')
  })
})
