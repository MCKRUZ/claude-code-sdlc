/** The lifecycle home in the real window (togo-command-center.md §1, §3.4, §7 P7).
 *
 * A project outside the Build loop lands HERE (`homeFor` → 'lifecycle'), under the strip that
 * replaced the sidebar: nine stations, the viewed one carrying `data-viewing` (never
 * `aria-current` — a11y.spec keeps exactly one of those), `[` / `]` leaning into the previous
 * and next station. The Today column's decisions group reads the plugin's absence honestly:
 * "no data — no decision-log", never an empty list styled as zero.
 *
 * Fixture: the plugin's init_project.py with `current_phase` moved to "1" — the same edit
 * documents.spec and chatLook.spec make. No sprint, no roster, no decision-log: the empty
 * fixture §8's honesty checks are written against. */

import { existsSync } from 'node:fs'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { newProject, PLUGIN_ROOT, setCurrentPhase, VENV_PYTHON, type Fixture } from './fixture'
import { ASSUMED, closeApp, launch, openProject, SEL, seedSettings, TEXT } from './shell'

/** The registry's nine stations, in order (phase-registry.yaml; spineModel STAGE_SHORT_LABEL). */
const STATIONS = ['0', '1', '2', '3', 'build', '7', '8', '9', 'close']

/** The station carrying `data-viewing` is the button; its `<li>` carries the stage id. */
async function viewingStage(page: Page): Promise<string> {
  const viewing = page.locator(SEL.viewingStation)
  await expect(viewing).toHaveCount(1)
  return (await page.locator(`${SEL.projectNav} li:has([data-viewing])`).getAttribute('data-stage-id')) ?? ''
}

test.describe('[command center P7] the lifecycle home in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-lifecycle')
    setCurrentPhase(fx.project, '1', 'Requirements')
    seedSettings(fx.userData, fx.project, 'lifecycle project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'lifecycle project')
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-lifecycle-home')
  })

  test('a Phase-1 project lands on the lifecycle home, with the stage home\'s heading inside <main>', async () => {
    await expect(page.locator(ASSUMED.lifecycleHome)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(SEL.sprintHome)).toHaveCount(0)
    await expect(page.locator('main#main').getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 })
    // The strip is the first <aside>; the chat the second — a11y.spec:76 verbatim.
    const asides = page.locator('aside')
    await expect(asides).toHaveCount(2)
    await expect(asides.nth(0).locator(SEL.projectNav)).toBeVisible()
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
  })

  test('the strip holds the nine stations in registry order as SVG, with no canvas and no aria-current inside', async () => {
    const nav = page.locator(SEL.projectNav)
    const ids = await nav.locator('[data-stage-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-stage-id')))
    expect(ids).toEqual(STATIONS)
    await expect(nav.locator('canvas')).toHaveCount(0)
    await expect(nav.locator('svg [aria-current]')).toHaveCount(0)
    // The Build station's name starts "Build Loop" (the openBuildView helpers match /^Build Loop/);
    // with no sprint it is exactly that, no id and no ordinal invented.
    await expect(nav.getByRole('button', { name: /^Build Loop/ })).toHaveAccessibleName(/^Build Loop$/)
  })

  test('] and [ move the viewed station; the current station is Phase 1', async () => {
    expect(await viewingStage(page)).toBe('1')
    await page.locator('main#main').focus()
    await page.keyboard.press(']')
    expect(await viewingStage(page)).toBe('2')
    await page.keyboard.press(']')
    expect(await viewingStage(page)).toBe('3')
    await page.keyboard.press('[')
    await page.keyboard.press('[')
    expect(await viewingStage(page)).toBe('1')
    // Leaning in never changes the current page: still one aria-current.
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
  })

  test('the Today column reads the plugin\'s absence honestly: no decision-log, nothing needs you', async () => {
    const today = page.locator(ASSUMED.today)
    await expect(today).toBeVisible()
    await expect(today).toContainText(TEXT.noDecisionLog)
    // No actor on a bare runner → the sentence; an identified person → "nothing needs you".
    await expect(today).toContainText(/nothing needs you|Sign in or type your name/)
    // No fabricated zero anywhere in a stat on the empty fixture (§8 honesty check 2).
    const stats = await page.locator(SEL.stat).allTextContents()
    for (const text of stats) expect(text).not.toMatch(/\b0\b/)
    await expect(page.locator('main').getByText(/\b0 of 0\b/)).toHaveCount(0)
  })

  test('the Build station\'s lean-in offers the sprint home, and g l comes back here', async () => {
    await page.getByRole('button', { name: /^Build Loop/ }).click()
    await expect(page.getByRole('button', { name: /^Build Loop/ })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.locator(SEL.sprintHome)).toBeVisible({ timeout: 60_000 })
    await page.locator('main#main').focus()
    await page.keyboard.press('g')
    await page.keyboard.press('l')
    await expect(page.locator(ASSUMED.lifecycleHome)).toBeVisible({ timeout: 30_000 })
  })
})
