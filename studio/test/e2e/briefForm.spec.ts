/** Spec 0032's window, driven for real: the workshop brief form, against the real plugin and the
 * plugin's own shipped contradiction list, question list and document registry.
 *
 * The unit tests pin every rule against a mocked bridge and a stand-in runner. What only the real window
 * can prove: the form appears on the real Discovery stage once intake is locked, shows what the real
 * `candidates` verb reports, enforces the page's rules before Build, builds the real brief through the
 * real script, opens it, and refuses to replace it without confirmation. No model is involved.
 * Skipped when no plugin checkout is beside this repository.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python
const FIXTURES = join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents')

test.describe('[spec 0032] the workshop brief form, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''
  let project = ''
  const discovery = () => join(project, '.sdlc', 'artifacts', '00-discovery')
  const briefPath = () => join(discovery(), 'workshop-brief.md')

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-brief-form-'))
    project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    // The brief's activity needs intake done (the catalogue locked) and the analyst's output on disk.
    const docs = join(project, 'docs', 'intake')
    mkdirSync(docs, { recursive: true })
    for (const name of ['rfp.md', 'api-notes.md', 'policy.md']) writeFileSync(join(docs, name), `# ${name}\n\nReference text for ${name}.\n`)
    const profilePath = join(project, '.sdlc', 'profile.yaml')
    writeFileSync(profilePath, `${readFileSync(profilePath, 'utf-8')}\ndocumentation:\n  intake_path: "docs/intake"\n  types: [markdown]\n`)
    const state = join(project, '.sdlc', 'state.yaml')
    for (const args of [[], ['--lock']]) execFileSync(VENV_PYTHON, [join(SCRIPTS_DIR, 'intake_documents.py'), '--state', state, ...args], { cwd: SCRIPTS_DIR })
    mkdirSync(discovery(), { recursive: true })
    for (const name of ['contradiction-list.md', 'question-list.md', 'document-registry.md']) copyFileSync(join(FIXTURES, name), join(discovery(), name))

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'brief form e2e project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('brief form e2e project').click()
    await expect(page.getByTestId('activities-panel')).toBeVisible({ timeout: 60_000 })
    // F11 (Observatory): the brief form renders in the main slot once its row is opened.
    await page.locator('[data-testid="activity-row"][data-activity-id="brief"]').getByRole('button', { name: 'Open' }).click()
    await expect(page.getByTestId('brief-panel')).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0032-brief-form.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  const form = () => page.getByTestId('brief-form')
  const box = (name: string) => form().getByRole('checkbox', { name })
  const build = () => form().getByRole('button', { name: 'Build the brief' })

  test('the form shows what the real analysis found, with the recommended contradictions ticked', async () => {
    await expect(form()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('brief-contradictions-counter')).toHaveText('2 of 5')
    await expect(box('Include CON-01')).toBeChecked()
    await expect(box('Include CON-02')).toBeChecked()
    expect(existsSync(briefPath())).toBe(false)
  })

  test('questions follow their route: emailed ones are listed apart, interview ones cannot be ticked', async () => {
    await expect(form()).toContainText('Email these before the workshop')
    await expect(form()).toContainText('Neither in the room nor emailed.')
    await expect(box('Include Q-08')).toBeDisabled()
    await expect(box('Include Q-02')).toHaveCount(0)
    await expect(box('Include Q-01')).not.toBeChecked()
    await box('Include Q-01').check()
    await expect(page.getByTestId('brief-questions-counter')).toHaveText('1 of 12')
  })

  test('Build stays disabled, with the reason beside it, until the page is complete', async () => {
    await expect(build()).toBeDisabled()
    await expect(page.getByTestId('brief-build-reason')).toContainText('Choose at least 3 load-bearing documents')
    for (const id of ['DOC-001', 'DOC-002', 'DOC-003']) await box(`Load-bearing ${id}`).check()
    await expect(page.getByTestId('brief-build-reason')).toContainText('decision')
    await form().getByLabel('Decision text').fill('Is phone intake for large commercial losses in or out of the first release?')
    await form().getByRole('button', { name: 'Add decision' }).click()
    await expect(page.getByTestId('brief-build-reason')).toContainText('Client name is required')
  })

  test('with the logistics filled, Build writes the real brief and opens it', async () => {
    await form().getByLabel('Client name').fill('Acme Insurance')
    await form().getByLabel('Date, time and location').fill('2026-10-14 09:00, Acme HQ')
    await form().getByLabel('Duration').fill('3 hours')
    await form().getByLabel('Facilitator').fill('Sam Kruger (Pod Lead)')
    await form().getByLabel('Attendee 1 name').fill('Dana Ortiz')
    await form().getByLabel('Attendee 1 role').fill('VP Claims')
    await expect(build()).toBeEnabled()
    await build().click()
    // The window moves straight on to the brief in the editor, so the result lines are not on screen
    // long enough to read (the unit tests pin them); the evidence is the open document and the file.
    await expect(page.getByRole('heading', { name: 'workshop-brief.md', level: 2 })).toBeVisible({ timeout: 60_000 })
    const text = readFileSync(briefPath(), 'utf-8')
    for (const expected of ['Acme Insurance', 'Dana Ortiz', 'CON-01', 'Q-01', 'Is phone intake for large commercial losses']) expect(text).toContain(expected)
  })

  test('a brief that now exists is not replaced without an explicit confirmation', async () => {
    await page.getByRole('button', { name: '← Back to the stage' }).click()
    await expect(page.getByTestId('activities-panel')).toBeVisible({ timeout: 30_000 })
    // F11 (Observatory): the brief form renders in the main slot once its row is opened.
    await page.locator('[data-testid="activity-row"][data-activity-id="brief"]').getByRole('button', { name: 'Open' }).click()
    await expect(page.getByTestId('brief-panel')).toBeVisible({ timeout: 30_000 })
    const before = readFileSync(briefPath(), 'utf-8')
    await expect(page.getByTestId('brief-panel')).toContainText('A brief already exists.', { timeout: 60_000 })
    expect(readFileSync(briefPath(), 'utf-8')).toBe(before)
    await expect(page.getByRole('checkbox', { name: 'Replace the existing brief' })).not.toBeChecked()
  })
})
