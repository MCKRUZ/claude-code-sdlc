/** Steering mode in the real window (togo-command-center.md §3.5, §7 P7).
 *
 * The committee's view is read-only by construction: `g t` hides the chat and the console,
 * holds no `<input>` and zero `button[data-write]`, names every number's field, and never
 * spells an activity metric. Escape leaves, back to the screen it was entered from. The
 * scorecard on an empty fixture is all "no data" — never a zero, never a tint. */

import { existsSync } from 'node:fs'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { enterBuildLoop, newProject, newSprint, PLUGIN_ROOT, slate, VENV_PYTHON, type Fixture } from './fixture'
import { ASSUMED, closeApp, launch, openProject, SEL, seedSettings, sequence, sprintHomeVisible } from './shell'

const FORBIDDEN = /velocity|story points|PR count|lines of code/i

test.describe('[command center P7] steering mode in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-steering')
    enterBuildLoop(fx.project)
    newSprint(fx.project)
    slate(fx.project, fx.specIds)
    seedSettings(fx.userData, fx.project, 'steering project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'steering project')
    await sprintHomeVisible(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-steering')
  })

  test('g t enters steering mode: no input, no write control, the chat aside hidden', async () => {
    await sequence(page, 'g', 't')
    const steering = page.locator(ASSUMED.steering)
    await expect(steering).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('input')).toHaveCount(0)
    await expect(page.locator(SEL.writeControl)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Chat' })).toHaveCount(0)
    await expect(page.getByRole('separator', { name: 'Resize console' })).toHaveCount(0)
  })

  test('every number names its field, "no data" stays two words, and no activity metric is spelled', async () => {
    const steering = page.locator(ASSUMED.steering)
    // The scorecard read lands first; the text is judged once the tiles are on screen.
    await expect(steering.locator('[data-testid="steering-tiles"]')).toBeVisible({ timeout: 60_000 })
    const text = (await steering.textContent()) ?? ''
    expect(text).not.toMatch(FORBIDDEN)
    expect(text).toMatch(/no data/)
    // The standard's numbers, each by its field name (ExplainScorecard).
    for (const field of ['accepted_as_is_rate', 'review_wait_median_hours', 'security_review_wait_median_hours', 'rework_revert_rate', 'bounce_back_rate']) {
      await expect(steering).toContainText(field)
    }
    const stats = await steering.locator(SEL.stat).allTextContents()
    for (const stat of stats) expect(stat).not.toMatch(/\b0\b/)
    await expect(steering).toContainText('window is a label only')
  })

  test('Escape leaves steering mode and returns to the sprint home', async () => {
    await page.keyboard.press('Escape')
    await expect(page.locator(ASSUMED.steering)).toHaveCount(0)
    await sprintHomeVisible(page)
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible()
  })
})
