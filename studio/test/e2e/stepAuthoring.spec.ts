/** Spec 0018's window, driven for real: the step-scoped document panel and chat.
 *
 * The unit/component tests (ChatPanel.test.tsx, workflowDocumentPanel.test.tsx,
 * StageReadinessContext.test.tsx) pin the logic against a mocked `window.studio` — this file
 * proves the acceptance checks that are statements about the REAL window: the chat header
 * actually naming the real current document once a real readiness subprocess answers,
 * Previous/Next/Edit/Back actually moving between real documents and the real structured
 * editor, and the panels actually stacking at phone width.
 *
 * Reuses workflow.spec.ts's exact fixture shape (three of four documents ready, epics.md not)
 * deliberately — that scenario is already proven to make epics.md the current step, in declared
 * order, by that file's own passing assertions; inventing a different one here was this file's
 * own first bug (see git history) and cost two wrong guesses before matching it exactly.
 *
 * Skipped when no plugin checkout is beside this repository, same convention as
 * documents.spec.ts / workflow.spec.ts / chatAuthoring.spec.ts.
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
const FIXTURES = join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents')

const REQUIREMENTS = '.sdlc/artifacts/01-requirements/requirements.md'
const NON_FUNCTIONAL = '.sdlc/artifacts/01-requirements/non-functional-requirements.md'
const PHASE2_HANDOFF = '.sdlc/artifacts/01-requirements/phase2-handoff.md'
// epics.md (3rd in declared order) is deliberately never written — the not-ready document that
// makes it, not requirements.md and not Sign-off, this stage's current step.

/** Same fixture repair workflow.spec.ts already needed (FR-002's deliberate Dependencies gap). */
function readRequirementsMadeReady(): string {
  const text = readFileSync(join(FIXTURES, 'requirements.md'), 'utf-8')
  const marker = '### FR-002: Persist the first submission'
  const idx = text.indexOf(marker)
  if (idx === -1) throw new Error('fixture requirements.md no longer has FR-002 — update this test')
  const rest = text.slice(idx)
  const m = rest.match(/\r?\n\r?\n---/)
  if (!m || m.index === undefined) throw new Error('could not find the end of FR-002 to add Dependencies')
  const acceptanceEnd = idx + m.index
  return `${text.slice(0, acceptanceEnd)}\r\n\r\n**Dependencies:** none${text.slice(acceptanceEnd)}`
}

function setCurrentPhase(project: string, phase: string, name: string) {
  const statePath = join(project, '.sdlc', 'state.yaml')
  writeFileSync(
    statePath,
    readFileSync(statePath, 'utf-8')
      .replace(/^current_phase:.*$/m, `current_phase: "${phase}"`)
      .replace(/^phase_name:.*$/m, `phase_name: "${name}"`),
    'utf-8',
  )
}

function seedSettings(userData: string, projectPath: string, label: string) {
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    recentProjects: [{ path: projectPath, name: label, lastOpenedAt: new Date().toISOString() }],
    pluginScriptsPathOverride: SCRIPTS_DIR,
  }, null, 2))
}

test.describe('[spec 0018] the step-authoring panel, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-step-authoring-'))
    const project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
    writeFileSync(join(project, REQUIREMENTS), readRequirementsMadeReady())
    writeFileSync(join(project, NON_FUNCTIONAL), readFileSync(join(FIXTURES, 'non-functional-requirements.md'), 'utf-8'))
    writeFileSync(join(project, PHASE2_HANDOFF), readFileSync(join(FIXTURES, 'phase2-handoff.md'), 'utf-8'))
    // epics.md deliberately absent.
    setCurrentPhase(project, '1', 'requirements')

    const userData = join(workspace, 'userData')
    seedSettings(userData, project, 'step authoring e2e project')

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('step authoring e2e project').click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(30_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0018-step-authoring.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try { if (workspace) rmSync(workspace, { recursive: true, force: true }) } catch { /* not a failed test */ }
  })

  test('the chat header names the real current document (epics.md), not the generic "Can see" line', async () => {
    await expect(page.locator('aside').filter({ hasText: 'Chat' }).getByText(/Helping with: epics\.md/))
      .toBeVisible({ timeout: 30_000 })
  })

  test('the document panel header has Back/Previous/Next/Edit, and Next moves to the real next document in declared order', async () => {
    await expect(page.getByRole('button', { name: /Back to Workflow/i })).toBeVisible()
    await expect(page.getByText('epics.md').first()).toBeVisible()

    const next = page.getByRole('button', { name: /^Next/i }).or(page.locator('[aria-label="Next"]')).first()
    await next.click()
    // phase2-handoff.md is next after epics.md in declared order (4th of 4).
    await expect(page.getByText('phase2-handoff.md').first()).toBeVisible({ timeout: 10_000 })

    const previous = page.getByRole('button', { name: /^Previous/i }).or(page.locator('[aria-label="Previous"]')).first()
    await previous.click()
    await expect(page.getByText('epics.md').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Edit opens the real structured editor for the document currently showing', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click()
    // DocumentView's own back control, proving this really navigated to the structured editor
    // (documents.spec.ts's own screen) rather than just toggling a class in place.
    await expect(page.getByText(/Back to the stage/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('epics.md').first()).toBeVisible()
    await page.getByText(/Back to the stage/i).click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 10_000 })
  })

  test('at 400px, the document panel and the chat panel both stack into one column with no horizontal overflow', async () => {
    await page.setViewportSize({ width: 400, height: 800 })
    try {
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      expect(overflows, 'document.documentElement should not scroll horizontally at 400px').toBe(false)

      // Sidebar, the document panel, and the chat panel all genuinely stacked (Frame.tsx's
      // flex-col at this breakpoint) — not just narrowed side by side.
      const sidebarBox = await page.locator('aside').first().boundingBox()
      // Re-recorded (round 3, togo-command-center.md §8 (6)): this read `aside` filtered by the text
      // "Chat". The shell band — the FIRST aside — now carries the owner-required Chat toggle, a
      // band button whose visually hidden label IS the word "Chat", so the text filter resolved to
      // both asides (strict-mode violation). The chat is the SECOND aside by a11y.spec's own pin
      // ("two asides, sidebar-then-chat"), so it is addressed by position; the assertion is unchanged.
      const chatBox = await page.locator('aside').nth(1).boundingBox()
      if (sidebarBox && chatBox) {
        expect(chatBox.y).toBeGreaterThanOrEqual(sidebarBox.y + sidebarBox.height - 1)
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 })
    }
  })
})
