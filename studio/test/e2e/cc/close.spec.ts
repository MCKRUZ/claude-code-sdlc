/** Sprint review / close in the real window (togo-command-center.md §3.5, §7 P7).
 *
 * The close screen mirrors `sprint.py close`'s rule and never greys the button on its own
 * count: an undecided open spec comes back as the plugin's exit-1 sentence naming it by id.
 * Carry + drop with reasons closes the sprint — the record is the plugin's `## Close` table in
 * the sprint file and the three ledger events `carried`, `dropped`, `closed`.
 *
 * Fixture: Build phase, S07 with the three specs slated, 0003 merged (kept), 0001 and 0002
 * open. S08 — the carry target — is created from the picker's "create S08 first →" through the
 * `new` dialog, because the plugin lists only existing sprints and the screen may not invent
 * one. (`active_sprint_id` is the highest non-closed sprint, so S08 is created only after the
 * screen is already on S07.) */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  enterBuildLoop, ledgerEvents, newProject, newSprint, PLUGIN_ROOT, setFrontmatter, slate, specFrontmatter, SPRINT_ID, VENV_PYTHON,
  writeRoster, type Fixture,
} from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openBuildView, openProject, SEL, seedSettings, TEXT } from './shell'

const CARRY_TO = 'S08'

test.describe('[command center P7] sprint close in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-close')
    enterBuildLoop(fx.project)
    writeRoster(fx.project)
    newSprint(fx.project)
    slate(fx.project, fx.specIds)
    // After the slate: `sprint.py slate` refuses a merged spec, so the merge comes once committed.
    setFrontmatter(fx.specPath[fx.specIds[2]], 'status', 'merged')
    seedSettings(fx.userData, fx.project, 'close project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'close project')
    await ensureActor(page, fx.project)
    await openBuildView(page, 'Closing')
    await expect(page.locator(ASSUMED.closeScreen)).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-close')
  })

  test('Kept is the merged spec; Open lists the rest, each needing a decision; Outcomes read "no data"', async () => {
    const screen = page.locator(ASSUMED.closeScreen)
    await expect(screen).toContainText(SPRINT_ID)
    const [a, b, merged] = fx.specIds
    await expect(screen.locator(`${ASSUMED.closeRow}[data-spec="${merged}"]`)).toHaveAttribute('data-kept', '')
    for (const id of [a, b]) await expect(screen.locator(`${ASSUMED.closeRow}[data-spec="${id}"]`).getByRole('button', { name: /^(Carry|Drop)/ })).toHaveCount(2)
    // The scorecard has no events: every outcome is two words, never a zero.
    const stats = await screen.locator(SEL.stat).allTextContents()
    for (const stat of stats) expect(stat).not.toMatch(/\b0\b/)
    await expect(screen).toContainText('no data')
  })

  test('an undecided open spec comes back as the plugin\'s exit-1 sentence, by id', async () => {
    const [a, b] = fx.specIds
    const rowA = page.locator(`${ASSUMED.closeRow}[data-spec="${a}"]`)
    await rowA.getByRole('button', { name: /^Drop/ }).click()
    await rowA.getByLabel(/reason/i).fill('superseded by the export rail')
    // The UI mirrors the rule but never enforces it on its own count: Close is offered.
    const close = page.getByRole('button', { name: 'Close the sprint' })
    await expect(close).toBeEnabled()
    await close.click()
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    // The argv is shown as a shell would take it: a value with spaces is quoted.
    await expect(dialog).toContainText(new RegExp(`--drop "?${a}=`))
    await dialog.locator(SEL.writeControl).click()
    const result = page.locator(ASSUMED.verbResult)
    await expect(result).toContainText(TEXT.notDone, { timeout: 60_000 })
    await expect(result).toContainText(`every open spec needs a decision — undecided: ${b}`)
    expect(ledgerEvents(fx.project, 'closed')).toHaveLength(0)
    await page.keyboard.press('Escape')
  })

  test('carry + drop with reasons closes the sprint: the ## Close table and three events are the record', async () => {
    const [a, b] = fx.specIds
    const rowB = page.locator(`${ASSUMED.closeRow}[data-spec="${b}"]`)
    await rowB.getByRole('button', { name: /^Carry/ }).click()
    // No open sprint to carry into yet: the picker says so and opens `new`.
    await rowB.getByRole('button', { name: `create ${CARRY_TO} first →` }).click()
    const newDialog = page.locator(ASSUMED.verbDialog)
    await expect(newDialog).toBeVisible({ timeout: 10_000 })
    await newDialog.getByLabel(/goal/i).fill('Carry what S07 could not finish')
    await newDialog.getByLabel(/start/i).fill('2026-10-12')
    await newDialog.getByLabel(/target/i).fill('3')
    await newDialog.locator(SEL.writeControl).click()
    await expect(page.locator(ASSUMED.verbResult)).toContainText(TEXT.done, { timeout: 60_000 })
    await page.keyboard.press('Escape')
    await rowB.getByLabel(/carry to/i).selectOption(CARRY_TO)
    await rowB.getByLabel(/reason/i).fill('blocked on the adjuster API')
    await page.getByRole('button', { name: 'Close the sprint' }).click()
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText(`--carry-to ${CARRY_TO}`)
    await expect(dialog).toContainText(new RegExp(`--carry "?${b}=`))
    await expect(dialog).toContainText(new RegExp(`--drop "?${a}=`))
    await dialog.locator(SEL.writeControl).click()
    await expect(page.locator(ASSUMED.verbResult)).toContainText(TEXT.done, { timeout: 60_000 })

    const record = readFileSync(join(fx.project, '.sdlc', 'sprints', `${SPRINT_ID}.md`), 'utf-8')
    expect(record).toMatch(/^state: closed/m)
    expect(record).toContain('## Close')
    expect(specFrontmatter(fx.specPath[b], 'sprint')).toBe(CARRY_TO)
    expect(specFrontmatter(fx.specPath[a], 'sprint')).toBe('')
    const events = ledgerEvents(fx.project).filter((e) => ['carried', 'dropped', 'closed'].includes(String(e.event)))
    expect(events.map((e) => e.event)).toEqual(['carried', 'dropped', 'closed'])
    expect(events[0]).toMatchObject({ spec: b, to_sprint: CARRY_TO, reason: 'blocked on the adjuster API' })
    expect(events[1]).toMatchObject({ spec: a, reason: 'superseded by the export rail' })
    // On exit 0 the review page is rendered and offered — reports stay on this computer.
    await expect(page.locator(ASSUMED.verbResult)).toContainText(`.sdlc/reports/sprint-${SPRINT_ID}-review.html`)
    expect(existsSync(join(fx.project, '.sdlc', 'reports', `sprint-${SPRINT_ID}-review.html`))).toBe(true)
  })
})
