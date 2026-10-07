/** The omnibar in the real window (togo-command-center.md §1, §3.6, §7 P7).
 *
 * At rest the shell holds ZERO `<input>` — the trigger is a `<button>` styled as a field
 * (a11y.spec:76 stays green verbatim); the palette overlay owns the one input while open. Plain
 * words resolve ONLY against the board's rows and the roster: "hand 0002 to Sam" matches the
 * spec and shows Sam as an unresolved name (a visible gap, not a guess) because the roster
 * holds TWO Sams (the example's Sam Oduya and the fixture's Sam K) and the parser never picks
 * between candidates; Enter opens the VerbDialog and runs nothing — the ledger proves it; Escape closes
 * the dialog, then the palette (the pinned Escape behaviour).
 *
 * Fixture: Build phase, roster, S07 with the three specs slated, so every id is on the board. */

import { existsSync } from 'node:fs'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { enterBuildLoop, ledgerEvents, newProject, newSprint, PLUGIN_ROOT, slate, VENV_PYTHON, writeRoster, type Fixture } from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openPalette, openProject, SEL, seedSettings, sprintHomeVisible, TEXT } from './shell'

test.describe('[command center P7] the omnibar in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture
  let actor = ''

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-omnibar')
    enterBuildLoop(fx.project)
    writeRoster(fx.project)
    newSprint(fx.project)
    slate(fx.project, fx.specIds)
    seedSettings(fx.userData, fx.project, 'omnibar project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'omnibar project')
    actor = await ensureActor(page, fx.project)
    await sprintHomeVisible(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-omnibar')
  })

  test('at rest the shell holds no <input>; the trigger is a button that reads like a field', async () => {
    await expect(page.locator('input')).toHaveCount(0)
    const trigger = page.locator(ASSUMED.omnibarTrigger)
    await expect(trigger).toBeVisible()
    expect(await trigger.evaluate((el) => el.tagName)).toBe('BUTTON')
    await expect(trigger).toContainText(TEXT.omnibarHint)
  })

  test('⌘K opens the palette with exactly one input, and a verb phrase shows the exact argv it would run', async () => {
    await openPalette(page)
    await expect(page.locator('input')).toHaveCount(1)
    await page.locator(SEL.paletteInput).fill(`verdict ${fx.specIds[1]} accepted`)
    const first = page.locator(SEL.paletteOption).first()
    await expect(first).toContainText(`Run: sprint.py verdict --spec ${fx.specIds[1]} --lane eng --verdict accepted`)
    // The option shows the argv as it runs: a name with whitespace is quoted ("Priya N.").
    await expect(first).toContainText(`--by ${/\s/.test(actor) ? `"${actor}"` : actor}`)
    // The verbs group is the first group when a phrase matches.
    const groupLabel = page.locator(`${SEL.palette} [role="group"]`).first().locator('[role="presentation"]').first()
    await expect(groupLabel).toContainText(/verb/i)
    await page.keyboard.press('Escape')
    await expect(page.locator(SEL.palette)).toHaveCount(0)
  })

  test('"hand 0002 to Sam" shows Sam unresolved when two roster entries are Sams — a gap, never a guess', async () => {
    const spec = fx.specIds[1]
    await openPalette(page)
    await page.locator(SEL.paletteInput).fill(`hand ${spec} to Sam`)
    const first = page.locator(SEL.paletteOption).first()
    await expect(first).toContainText(`sprint.py handoff --spec ${spec}`)
    await expect(first).toContainText('Sam')
    await expect(first).toContainText(/not on the roster|not in the roster|unresolved/i)
    // Neither Sam is substituted for the typed one: the dialog asks.
    await expect(first).not.toContainText('@sam-k')
    await expect(first).not.toContainText('@sam-oduya')
  })

  test('Enter opens the VerbDialog and runs nothing; Escape closes the dialog, then the palette', async () => {
    const before = ledgerEvents(fx.project).length
    await page.keyboard.press('Enter')
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText('sprint.py handoff')
    await expect(dialog).toContainText(actor)
    await expect(dialog.locator(SEL.writeControl)).toHaveCount(1)
    expect(ledgerEvents(fx.project).length).toBe(before)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    if (await page.locator(SEL.palette).count()) await page.keyboard.press('Escape')
    await expect(page.locator(SEL.palette)).toHaveCount(0)
    await expect(page.locator('input')).toHaveCount(0)
    expect(ledgerEvents(fx.project).length).toBe(before)
  })

  test('a phrase that resolves nothing offers no verb row', async () => {
    await openPalette(page)
    await page.locator(SEL.paletteInput).fill('verdict 9999 accepted')
    await expect(page.locator(SEL.paletteOption).filter({ hasText: 'Run: sprint.py' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator(SEL.palette)).toHaveCount(0)
  })
})
