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

  /** v15 (owner's note, recorded pin change — plan §8): the room is one board. At 1440×900 every
   * tile of Outcomes AND Delivery is fully above the fold at rest, nothing straddles it, the
   * Delivery row is on screen without a scroll, and <main> itself never scrolls (the pages
   * container is the one scroller). The v13 two-page assertion is retired with this evidence:
   * the second page left ~120 px of empty room under Outcomes and hid half the standard. */
  test('one board: Outcomes and Delivery both fully on screen at rest; <main> never scrolls', async () => {
    const steering = page.locator(ASSUMED.steering)
    await expect(steering.locator('[data-steer-pages]')).toBeVisible({ timeout: 60_000 })
    const atRest = await page.evaluate(() => {
      const vh = window.innerHeight
      const tiles = Array.from(document.querySelectorAll('[data-steer-tile]')).map((t) => t.getBoundingClientRect())
      const straddling = tiles.filter((r) => r.top < vh - 1 && r.bottom > vh + 1).length
      const below = tiles.filter((r) => r.bottom > vh + 1).length
      const main = document.getElementById('main')
      const delivery = document.querySelector('[data-steer-group="delivery"]')!.getBoundingClientRect()
      const actions = document.querySelector('[data-steer-actions]')!.getBoundingClientRect()
      return { vh, straddling, below, tiles: tiles.length, mainScrollTop: main?.scrollTop ?? 0, mainOverflows: (main?.scrollHeight ?? 0) > (main?.clientHeight ?? 0) + 1, deliveryTop: delivery.top, deliveryBottom: delivery.bottom, actionsBottom: actions.bottom }
    })
    expect(atRest.tiles).toBeGreaterThanOrEqual(10)
    expect(atRest.straddling, `tiles straddling the fold: ${atRest.straddling}`).toBe(0)
    expect(atRest.below, `tiles entirely below the fold: ${atRest.below}`).toBe(0)
    expect(atRest.deliveryTop).toBeLessThan(atRest.vh)
    expect(atRest.deliveryBottom).toBeLessThanOrEqual(atRest.vh + 1)
    // The actions (Open the review page, companions) are on the board too — whole, not at the fold.
    expect(atRest.actionsBottom, `actions bottom ${Math.round(atRest.actionsBottom)} vs viewport ${atRest.vh}`).toBeLessThanOrEqual(atRest.vh + 1)
    expect(atRest.mainScrollTop).toBe(0)
    expect(atRest.mainOverflows, '<main> has nothing to scroll in steering — the pages container scrolls').toBe(false)
  })

  test('Escape leaves steering mode and returns to the sprint home', async () => {
    await page.keyboard.press('Escape')
    await expect(page.locator(ASSUMED.steering)).toHaveCount(0)
    await sprintHomeVisible(page)
    // Re-recorded (owner's v12 critique item 1, togo-command-center.md §8): this line asserted
    // `heading[name=Chat]` visible after Esc. The sprint home now folds the chat to its 40 px
    // rail BY DEFAULT (chatStore: `sprint` and `planning` start collapsed; a11y.spec's 380 px
    // pin is taken on the lifecycle home, where nothing changed), so the fact that still proves
    // steering released the chat is: the second <aside> is back on screen as the rail with its
    // one "Open the chat" control, the band's Chat toggle is present and not pressed, and
    // pressing it brings the heading back. Evidence: `test/frameChat.test.tsx` holds the
    // fold-per-area contract; `observatory-v12-sprint-home.png` showed the chat eating 380 px of
    // a 1440 window while two lanes sat below the fold.
    const asides = page.locator('aside')
    await expect(asides).toHaveCount(2)
    await expect(asides.nth(1)).toBeVisible()
    await expect(asides.nth(1).getByRole('button', { name: 'Open the chat' })).toBeVisible()
    const chatToggle = asides.nth(0).getByRole('button', { name: 'Chat' })
    await expect(chatToggle).toHaveAttribute('aria-pressed', 'false')
    await chatToggle.click()
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible()
    await expect(chatToggle).toHaveAttribute('aria-pressed', 'true')
    // Back to the default for the specs that follow in this file's serial run.
    await chatToggle.click()
    await expect(page.getByRole('heading', { name: 'Chat' })).toHaveCount(0)
  })
})
