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

  /** v13 fixer round: a committee screen pages cleanly. At rest no tile straddles the fold (the
   * v13 shot cut the Delivery titles at y ≈ 866 on a 900 px window); the pages container is the
   * one scroller and a scroll of one room-height snaps the Delivery page's top to the top, with
   * no tile straddling the fold there either; <main> itself never scrolls. */
  test('the room pages cleanly: at rest and after one page down, no tile straddles the fold and <main> never scrolls', async () => {
    const steering = page.locator(ASSUMED.steering)
    await expect(steering.locator('[data-steer-pages]')).toBeVisible({ timeout: 60_000 })
    const measure = () => page.evaluate(() => {
      const vh = window.innerHeight
      const pages = document.querySelector('[data-steer-pages]') as HTMLElement
      const tiles = Array.from(document.querySelectorAll('[data-steer-tile]')).map((t) => t.getBoundingClientRect())
      const straddling = tiles.filter((r) => r.top < vh - 1 && r.bottom > vh + 1).length
      const main = document.getElementById('main')
      const delivery = document.querySelector('[data-steer-page="delivery"]')!.getBoundingClientRect()
      return { vh, straddling, tiles: tiles.length, mainScrollTop: main?.scrollTop ?? 0, mainOverflows: (main?.scrollHeight ?? 0) > (main?.clientHeight ?? 0) + 1, pagesTop: pages.getBoundingClientRect().top, deliveryTop: delivery.top, pagesHeight: pages.clientHeight }
    })
    const atRest = await measure()
    expect(atRest.tiles).toBeGreaterThanOrEqual(10)
    expect(atRest.straddling, `tiles straddling the fold at rest: ${atRest.straddling}`).toBe(0)
    expect(atRest.mainScrollTop).toBe(0)
    expect(atRest.mainOverflows, '<main> has nothing to scroll in steering — the pages container scrolls').toBe(false)
    // The Delivery page begins at or under the fold: nothing of it shows under the first page.
    expect(atRest.deliveryTop).toBeGreaterThanOrEqual(atRest.vh - 1)
    await page.evaluate(() => { const pages = document.querySelector('[data-steer-pages]') as HTMLElement; pages.scrollTo({ top: pages.clientHeight, behavior: 'auto' }) })
    await page.waitForTimeout(400)
    const pagedDown = await measure()
    expect(Math.abs(pagedDown.deliveryTop - pagedDown.pagesTop), `Delivery page top ${Math.round(pagedDown.deliveryTop)} vs pages top ${Math.round(pagedDown.pagesTop)}`).toBeLessThanOrEqual(1.5)
    expect(pagedDown.straddling, `tiles straddling the fold on page 2: ${pagedDown.straddling}`).toBe(0)
    expect(pagedDown.mainScrollTop).toBe(0)
    await page.evaluate(() => { (document.querySelector('[data-steer-pages]') as HTMLElement).scrollTo({ top: 0, behavior: 'auto' }) })
    await page.waitForTimeout(300)
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
