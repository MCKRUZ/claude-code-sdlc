/** Spec 0017's window, driven for real: the Workflow tab.
 *
 * The unit tests (workflowSteps.test.ts, workflowTab.test.ts, documentsTab.test.ts) pin the
 * structure — one step per document plus Sign-off, in order; a locked or done row carries no
 * content; the shared-source math. What they cannot prove, because `renderToStaticMarkup` never
 * runs a `useEffect`, is anything that happens over time: the live panel's content actually
 * arriving and then actually changing, a real layout not scrolling at phone width, and a real
 * click switching tabs. That is what this file is for.
 *
 * Skipped when no plugin checkout is beside this repository, since Studio cannot open a
 * project without the plugin's scripts — same convention as documents.spec.ts.
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
const EPICS = '.sdlc/artifacts/01-requirements/epics.md'

/** requirements.md's own fixture has ONE deliberate gap (FR-002's Dependencies field, spec
 * 0010's own "what is missing" test target) — filled in here so this document reads as READY,
 * which is what this file's scenario needs: three of the stage's four documents ready, the
 * fourth (epics.md) not, to prove the current step is the first not-ready one in declared
 * order, not whichever was written to most recently. */
function readRequirementsMadeReady(): string {
  const text = readFileSync(join(FIXTURES, 'requirements.md'), 'utf-8')
  const marker = '### FR-002: Persist the first submission'
  const idx = text.indexOf(marker)
  if (idx === -1) throw new Error('fixture requirements.md no longer has FR-002 — update this test')
  // The fixture is CRLF (`\r\n`), so the separator between the acceptance criteria and the
  // section's closing `---` is `\r\n\r\n---`, not `\n\n---` — matched with a regex rather than
  // a literal `indexOf` so this does not silently find nothing and corrupt the file by
  // appending near its very end instead of inside FR-002.
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

test.describe('[spec 0017] the Workflow tab, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''
  let project = ''

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-workflow-'))
    project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
    // Three of the stage's four required documents, ready — deliberately NOT in "most recently
    // touched" order: phase2-handoff.md (the 4th in declared order) is written first, so if
    // anything in the app picked "current" by recency rather than declared order, it would
    // pick the wrong one from the very first write.
    writeFileSync(join(project, PHASE2_HANDOFF), readFileSync(join(FIXTURES, 'phase2-handoff.md'), 'utf-8'))
    writeFileSync(join(project, REQUIREMENTS), readRequirementsMadeReady())
    writeFileSync(join(project, NON_FUNCTIONAL), readFileSync(join(FIXTURES, 'non-functional-requirements.md'), 'utf-8'))
    // epics.md (3rd in declared order) is deliberately NOT created — the not-ready document
    // this whole file's "current step" scenario turns on.

    setCurrentPhase(project, '1', 'requirements')

    const userData = join(workspace, 'userData')
    seedSettings(userData, project, 'workflow e2e project')

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('workflow e2e project').click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0017-workflow.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  test('opening the stage lands on Workflow, not Documents', async () => {
    await expect(page.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'false')
    // The step sequence itself, not the flat list — proves this really is the Workflow tab's
    // own content and not a stale render of the other one.
    await expect(page.getByTestId('workflow-step')).toHaveCount(5) // 4 documents + Sign-off
  })

  test('three of four documents ready shows the not-ready one as current — never the one written to last', async () => {
    // `data-step-key` is the document's own PATH — the same repo-relative path
    // `getStageReadiness()` reports it by, not the bare filename.
    const step = (key: string) => page.locator(`[data-testid="workflow-step"][data-step-key="${key}"]`)

    await expect(step(PHASE2_HANDOFF)).toHaveAttribute('data-step-status', 'done')
    await expect(step(REQUIREMENTS)).toHaveAttribute('data-step-status', 'done')
    await expect(step(NON_FUNCTIONAL)).toHaveAttribute('data-step-status', 'done')
    // epics.md is 3rd in declared order and the only one not ready — current, even though
    // phase2-handoff.md (4th) was written to the disk FIRST in beforeAll.
    await expect(step(EPICS)).toHaveAttribute('data-step-status', 'current')
    await expect(step('sign-off')).toHaveAttribute('data-step-status', 'locked')
  })

  test('a locked or done step shows no document content and no control, only its title and description', async () => {
    const done = page.locator(`[data-testid="workflow-step"][data-step-key="${REQUIREMENTS}"]`)
    await expect(done).toContainText('requirements.md')
    await expect(done.getByRole('button')).toHaveCount(0)
    await expect(done.locator('textarea, input')).toHaveCount(0)

    const locked = page.locator('[data-testid="workflow-step"][data-step-key="sign-off"]')
    await expect(locked.getByRole('checkbox')).toHaveCount(0)
  })

  test('the current step shows it has not started yet, then shows its real content the moment the file appears — via polling, not a reload', async () => {
    await expect(page.getByText(/Not started yet/i)).toBeVisible({ timeout: 30_000 })

    // A real write from the TEST PROCESS, outside the app entirely — the same technique a
    // person editing through spec 0016's chat would produce. Nothing here reloads the page or
    // clicks anything; Playwright's own polling assertion is what proves the panel noticed.
    const marker = 'WORKFLOW LIVE REFRESH MARKER — written by the e2e test process'
    writeFileSync(join(project, EPICS), `# Epics\n\n${marker}\n`, 'utf-8')

    // One polling interval is 2s (WorkflowTab.tsx's POLL_MS); a generous multiple covers the
    // real subprocess round trip the poll itself makes.
    await expect(page.getByText(marker)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Not started yet/i)).toHaveCount(0)
  })

  test('stacks the steps above the file panel at 400px, and adds no horizontal overflow of its own', async () => {
    // MEASURED FIRST, as a control: `document.documentElement` already overflows horizontally
    // at 400px on the pre-existing, byte-for-byte-unchanged Documents tab too — Frame.tsx's
    // Sidebar (a fixed 288px `aside`) and ChatPanel do not collapse at phone width and squeeze
    // `main` down to ~33px of client width before StageHome renders a single pixel into it.
    // That is a real gap, but it is a Frame/Sidebar/ChatPanel defect — out of this spec's
    // Delegation Plan (`StageHome.tsx` and `WorkflowTab.tsx` only, no Frame/Sidebar/ChatPanel
    // changes) — and reworking shared app chrome used by every other screen is not a call this
    // spec gets to make unilaterally. What IS this spec's to prove, and what this asserts, is
    // narrower and true: the Workflow tab's own two-column layout collapses to one column and
    // does not make that pre-existing overflow any WORSE than the Documents tab already does —
    // proven by comparing the two tabs' own content width, not the whole document's.
    await page.setViewportSize({ width: 400, height: 800 })
    try {
      const contentWidth = async () => page.evaluate(() => {
        const stageHomeRoot = document.querySelector('main')?.firstElementChild as HTMLElement | null
        return stageHomeRoot?.scrollWidth ?? null
      })

      const workflowWidth = await contentWidth()

      await page.getByRole('tab', { name: 'Documents' }).click()
      const documentsWidth = await contentWidth()

      expect(workflowWidth, 'Workflow tab render width').not.toBeNull()
      expect(documentsWidth, 'Documents tab render width').not.toBeNull()
      // The claim spec 0017 owns: this tab's own content is no wider than the flat list's
      // already-shipped content, given the exact same squeezed space to render in.
      expect(workflowWidth).toBeLessThanOrEqual(documentsWidth!)

      await page.getByRole('tab', { name: 'Workflow' }).click()

      // "steps above the file": the step list's bounding box sits entirely above the file
      // panel's, rather than beside it, once collapsed — this holds regardless of the outer
      // chrome's own width, since it is about the ORDER of this tab's own two regions.
      const stepsBox = await page.locator('[data-testid="workflow-step"]').first().boundingBox()
      const panelBox = await page.locator('[data-testid="live-document-panel"]').boundingBox()
      if (stepsBox && panelBox) {
        expect(stepsBox.y).toBeLessThan(panelBox.y)
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 })
    }
  })
})

test.describe('[spec 0017] the Sign-off step, once every document is ready', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')

  let app: ElectronApplication
  let page: Page
  let workspace = ''

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-workflow-signoff-'))
    const project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
    writeFileSync(join(project, REQUIREMENTS), readRequirementsMadeReady())
    writeFileSync(join(project, NON_FUNCTIONAL), readFileSync(join(FIXTURES, 'non-functional-requirements.md'), 'utf-8'))
    writeFileSync(join(project, EPICS), readFileSync(join(FIXTURES, 'epics.md'), 'utf-8'))
    writeFileSync(join(project, PHASE2_HANDOFF), readFileSync(join(FIXTURES, 'phase2-handoff.md'), 'utf-8'))

    setCurrentPhase(project, '1', 'requirements')

    const userData = join(workspace, 'userData')
    seedSettings(userData, project, 'workflow signoff e2e project')

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('workflow signoff e2e project').click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0017-signoff.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  test('expands inline, showing the same sign-off questions the Documents tab shows — not a link elsewhere', async () => {
    const signOff = page.locator('[data-testid="workflow-step"][data-step-key="sign-off"]')
    await expect(signOff).toHaveAttribute('data-step-status', 'current', { timeout: 30_000 })

    // The real questions, rendered right here in the Workflow tab.
    await expect(page.getByRole('heading', { name: 'Questions for whoever signs this off' })).toBeVisible()
    const workflowCheckboxCount = await page.getByRole('checkbox').count()
    expect(workflowCheckboxCount).toBeGreaterThan(0)

    // The SAME count the Documents tab shows for the same stage — one shared source, proven
    // live rather than only by the pure-function test.
    await page.getByRole('tab', { name: 'Documents' }).click()
    await expect(page.getByRole('heading', { name: 'Questions for whoever signs this off' })).toBeVisible()
    const documentsCheckboxCount = await page.getByRole('checkbox').count()
    expect(documentsCheckboxCount).toBe(workflowCheckboxCount)
  })
})
