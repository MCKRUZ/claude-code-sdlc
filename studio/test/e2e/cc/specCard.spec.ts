/** The spec card, opened in place (togo-command-center.md §3.3, §7 P7).
 *
 * Two promises only the real window can make. The disabled Hand off button's reason IS the
 * plugin's sentence — `handoff.py`'s own `not_ready` message for this spec, compared here
 * against what the script prints for the same spec and developer (it refuses before any git
 * operation, so the fixture is untouched by asking). And Escape returns focus to the control
 * that opened the card, so a keyboard user is never dropped at the top of the page.
 *
 * Fixture: Build phase, a roster that knows @sam-k, sprint S07 open, the three specs UNslated
 * so they sit in Refining; spec one names @sam-k as developer (the only frontmatter line the
 * fixture sets — `handoffCheck` runs only when a developer is named). Nothing scaffolded passes
 * the DoR, which is the plugin's verdict and exactly what makes the Hand off reason real. */

import { existsSync } from 'node:fs'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  enterBuildLoop, newProject, newSprint, PLUGIN_ROOT, pyJson, pyResult, ROSTER_HANDLE, script, setFrontmatter, VENV_PYTHON,
  writeRoster, type Fixture,
} from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openProject, SEL, seedSettings, sprintHomeVisible, TEXT } from './shell'

interface Refusal { ok: false; refusal: { kind: string; message: string } }
interface Readiness { ready: boolean; blocking: { check: string; message: string }[]; ladder?: { tier: string; touches_gated_path: boolean; rungs: string[] } }

test.describe('[command center P7] the spec card in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture
  let spec = ''
  let refusal: Refusal
  let readiness: Readiness

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-spec-card')
    enterBuildLoop(fx.project)
    writeRoster(fx.project)
    newSprint(fx.project)
    spec = fx.specIds[0]
    setFrontmatter(fx.specPath[spec], 'developer', ROSTER_HANDLE)
    // The plugin's own words for this spec: exit 1, `not_ready`, repository untouched.
    const live = pyResult([script('handoff.py'), '--repo', fx.project, '--spec', fx.specPath[spec], '--developer', ROSTER_HANDLE, '--json'])
    expect(live.code).toBe(1)
    refusal = JSON.parse(live.stdout) as Refusal
    expect(refusal.refusal.kind).toBe('not_ready')
    readiness = pyJson<Readiness>([script('spec_readiness.py'), '--spec', fx.specPath[spec], '--json'])
    expect(readiness.ready).toBe(false)
    seedSettings(fx.userData, fx.project, 'spec card project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'spec card project')
    await ensureActor(page, fx.project)
    await sprintHomeVisible(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-spec-card')
  })

  test('"refine in place →" on a Refining row opens the card over the lanes, naming the spec and its path', async () => {
    const row = page.locator(ASSUMED.refining).locator(`[data-spec="${spec}"]`)
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('button', { name: TEXT.refineInPlace }).click()
    const card = page.locator(ASSUMED.specCard)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card).toHaveAttribute('data-spec', spec)
    await expect(card).toContainText(`specs/${spec}-duplicate-claim-409.md`)
    await expect(card).toContainText('no PR yet')
    await expect(card).toContainText('no channel bound')
    // board.spec:189's standard inside the card: no inputs on a read.
    await expect(card.locator('input')).toHaveCount(0)
  })

  test('the DoR block carries check_spec\'s blocking messages verbatim, grouped under Still needed', async () => {
    const card = page.locator(ASSUMED.specCard)
    const needed = card.getByRole('region', { name: 'Still needed' })
    await expect(needed).toBeVisible()
    expect(readiness.blocking.length).toBeGreaterThan(0)
    for (const finding of readiness.blocking) await expect(needed).toContainText(finding.message)
  })

  test('the checking ladder is the plugin\'s rungs; no rung is green without a host conclusion', async () => {
    const card = page.locator(ASSUMED.specCard)
    const ladder = card.getByRole('list', { name: /checking ladder/i })
    await expect(ladder).toBeVisible()
    if (readiness.ladder) {
      expect(readiness.ladder.tier).toBe('HIGH')
      for (const rung of readiness.ladder.rungs) await expect(ladder).toContainText(rung)
    }
    // With no PR, no host and no gated-path declaration, nothing passes and nothing is invented.
    await expect(ladder.locator('[data-state="pass"]')).toHaveCount(0)
    await expect(ladder.locator('li').filter({ hasText: /^correctness/ })).toContainText('no data')
    await expect(card).toContainText('gated path: not declared')
    await expect(card).toContainText(TEXT.tierRule)
  })

  test('Hand off is disabled, and its reason is handoff.py\'s own not_ready sentence, character for character', async () => {
    const card = page.locator(ASSUMED.specCard)
    const handOff = card.getByRole('button', { name: /^Hand off/ })
    await expect(handOff).toBeDisabled()
    const describedBy = await handOff.getAttribute('aria-describedby')
    expect(describedBy, 'a disabled control always carries its reason').toBeTruthy()
    await expect(page.locator(`#${describedBy}`)).toHaveText(refusal.refusal.message)
    await expect(card).toContainText(TEXT.oneSpec)
  })

  test('Escape returns focus to the "refine in place →" control that opened the card', async () => {
    await page.keyboard.press('Escape')
    await expect(page.locator(ASSUMED.specCard)).toHaveCount(0)
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return { text: el?.textContent?.trim() ?? '', spec: el?.closest('[data-spec]')?.getAttribute('data-spec') ?? '' }
    })
    expect(focused.text).toBe(TEXT.refineInPlace)
    expect(focused.spec).toBe(spec)
  })
})
