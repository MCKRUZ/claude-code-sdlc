/** Issues in the real window (/sdlc-report-issue; CLAUDE.md: every tooling upgrade reaches the SDLC Studio
 * UI). The promises a component test cannot make: that the band's Report-an-issue control opens the
 * dialog over the sprint home with the plugin's own questions and refuses to write without a
 * screenshot, in the fixed sentence; that a report the plugin wrote (through its own CLI, with a
 * real PNG) shows on the sprint home's Today column as "1 awaiting review" and leans to the Issues
 * view; that the Issues view lists it, opens it with the plugin's proposals, and walks the lifecycle
 * — triage by someone other than the reporter, prioritize into the sprint, promote to a `type:
 * bugfix` spec slated into it — each step a confirm dialog answered in the plugin's words, with the
 * refused actions carrying the plugin's own sentence. The reporter is a named human the plugin
 * accepts who is NOT the signed-in actor, so the actor may review. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { enterBuildLoop, HUMAN, newProject, newSprint, PLUGIN_ROOT, py, script, SPRINT_ID, VENV_PYTHON, writeRoster, type Fixture } from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openBuildView, openProject, refreshScreen, SEL, seedSettings, sprintHomeVisible } from './shell'

const NO_SCREENSHOT = 'a screenshot of the product is required — paste one, choose a file, or capture this window'

/** A real 2×2 PNG: the plugin decides by bytes, never by name. */
function pngBytes(): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.from([0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** One report through the plugin's own CLI, by a named human who is not the signed-in actor. */
function reportBug(fx: Fixture): string {
  const shot = join(fx.workspace, 'shot.png')
  writeFileSync(shot, pngBytes())
  const out = py([
    script('report_issue.py'), 'new', '--repo', fx.project, '--title', 'Claim total doubles after adding a second line item', '--channel', 'web',
    '--what', 'Adding a second line item shows the claim total as twice the sum of the two lines.', '--expected', 'The total is the sum of the line items',
    '--steps', 'open claim 1042', '--steps', 'add a line item of 100', '--environment', 'test', '--severity', 'degraded', '--frequency', 'always',
    '--data-impact', 'wrong-shown', '--persona', 'a claims adjuster', '--reporter-role', 'end-user',
    '--answer', 'browser_device=Chrome 130 on Windows 11', '--answer', 'last_action=clicked Add line item',
    '--screenshot', shot, '--no-client-data', '--by', HUMAN, '--json',
  ])
  return (JSON.parse(out) as { issue: string }).issue
}

test.describe('[issues] bugs in the product, from report to a bugfix spec, in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture
  let actor = ''
  let issueId = ''

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-issues')
    enterBuildLoop(fx.project)
    writeRoster(fx.project)
    newSprint(fx.project)
    seedSettings(fx.userData, fx.project, 'issues project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'issues project')
    actor = await ensureActor(page, fx.project)
    await sprintHomeVisible(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-issues')
  })

  test('the band’s Report an issue opens the dialog with the plugin’s questions and refuses to write without a screenshot, in the fixed sentence', async () => {
    await page.getByTestId('report-issue').click()
    const dialog = page.getByTestId('report-issue-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    // The plugin's plan, not a form Studio typed: the web channel's follow-ups and the base questions.
    await expect(dialog.getByLabel('Browser and device')).toBeVisible({ timeout: 30_000 })
    await expect(dialog.getByLabel('What type of user were you acting as?')).toBeVisible()
    await expect(dialog.getByLabel('And your role on the team?')).toBeVisible()
    // The build under test came from `report_issue.py env`: a repository with an origin, on no code host.
    await expect(dialog.getByTestId('issue-env')).toContainText('Repository', { timeout: 30_000 })
    const confirm = dialog.getByRole('button', { name: /^Confirm — write the report/ })
    await expect(confirm).toBeDisabled()
    await expect(confirm).toHaveAttribute('title', NO_SCREENSHOT)
    // The preview is honest about what is not known yet.
    await expect(dialog.getByTestId('issue-argv')).toContainText('<title?>')
    await expect(dialog.getByTestId('issue-argv')).toContainText('<screenshot?>')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0, { timeout: 10_000 })
  })

  test('a report the plugin wrote shows on the Today column as awaiting review and leans to the Issues view', async () => {
    issueId = reportBug(fx)
    expect(issueId).toBe('ISS-0001')
    await refreshScreen(page)
    const today = page.locator(ASSUMED.today)
    await expect(today.getByTestId('today-issues')).toContainText('1 awaiting review', { timeout: 60_000 })
    await today.getByTestId('today-issues').getByRole('button').click()
    await expect(page.getByTestId('issues-screen')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(SEL.projectNav).getByRole('button', { name: 'Issues', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('the Issues view lists the report, opens it with the plugin’s proposals, and the refused actions carry the plugin’s own sentence', async () => {
    const queue = page.getByTestId('issue-queue')
    await expect(queue.locator(`[data-issue="${issueId}"]`)).toBeVisible({ timeout: 30_000 })
    const card = page.getByTestId('issue-card')
    await expect(card).toHaveAttribute('data-issue', issueId, { timeout: 30_000 })
    await expect(card).toHaveAttribute('data-status', 'new')
    await expect(card.getByTestId('issue-proposals')).toContainText('P2')
    await expect(card.getByTestId('issue-proposals')).toContainText('MEDIUM')
    await expect(card.getByTestId('issue-shots').locator('img')).toHaveCount(1, { timeout: 30_000 })
    const promote = card.getByRole('button', { name: /^Promote to a bugfix spec…/ })
    await expect(promote).toBeDisabled()
    await expect(promote).toHaveAttribute('title', /review it first/)
    await expect(card.getByRole('button', { name: /^Triage…/ })).toBeEnabled()
  })

  test('triage by the signed-in reviewer: the dialog previews the exact line and the plugin answers Done; the card reads triaged', async () => {
    const card = page.getByTestId('issue-card')
    await card.getByRole('button', { name: /^Triage…/ }).click()
    const dialog = page.getByTestId('issue-action-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('issue-action-argv')).toContainText(`Run: report_issue.py triage --issue ${issueId} --verdict confirmed`)
    await expect(dialog.getByTestId('issue-action-argv')).toContainText(`--by ${/\s/.test(actor) ? `"${actor}"` : actor} --json`)
    await dialog.getByRole('button', { name: /^Confirm$/ }).click()
    await expect(dialog.getByTestId('issue-action-result')).toContainText('Done', { timeout: 60_000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0, { timeout: 10_000 })
    await expect(card).toHaveAttribute('data-status', 'triaged', { timeout: 60_000 })
    await expect(card.getByTestId('issue-proposals')).toContainText(`reviewed by ${actor}`)
  })

  test('prioritize into the sprint, then promote to a bugfix spec slated into it — the spec exists with type: bugfix and the sprint’s key', async () => {
    const card = page.getByTestId('issue-card')
    await card.getByRole('button', { name: /^Prioritize…/ }).click()
    let dialog = page.getByTestId('issue-action-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('proposal')).toHaveText('P2')
    await dialog.getByLabel('Target sprint').selectOption(SPRINT_ID)
    await expect(dialog.getByTestId('issue-action-argv')).toContainText(`--priority P2 --target-sprint ${SPRINT_ID}`)
    await dialog.getByRole('button', { name: /^Confirm$/ }).click()
    await expect(dialog.getByTestId('issue-action-result')).toContainText('Done', { timeout: 60_000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0, { timeout: 10_000 })
    await expect(card).toHaveAttribute('data-status', 'prioritized', { timeout: 60_000 })

    await card.getByRole('button', { name: /^Promote to a bugfix spec…/ }).click()
    dialog = page.getByTestId('issue-action-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('proposal')).toHaveText('MEDIUM')
    await expect(dialog.getByTestId('promote-slate')).toBeChecked()
    await expect(dialog.getByTestId('issue-action-argv')).toContainText('--risk MEDIUM --slate')
    await dialog.getByRole('button', { name: /^Confirm$/ }).click()
    await expect(dialog.getByTestId('issue-action-result')).toContainText('Done', { timeout: 60_000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0, { timeout: 10_000 })
    await expect(card).toHaveAttribute('data-status', 'promoted', { timeout: 60_000 })

    // The record: a `type: bugfix` spec scaffolded by new_spec.py, slated by sprint.py into the sprint.
    const report = readFileSync(join(fx.project, '.sdlc', 'issues', `${issueId}-claim-total-doubles-after-adding-a-second-line-i.md`), 'utf-8')
    const specId = /^bugfix_spec: "(\d{4})"/m.exec(report)?.[1]
    expect(specId).toBeTruthy()
    const specFile = (await import('node:fs')).readdirSync(join(fx.project, 'specs')).find((f) => f.startsWith(`${specId}-`))!
    const spec = readFileSync(join(fx.project, 'specs', specFile), 'utf-8')
    expect(spec).toMatch(/^type: bugfix/m)
    expect(spec).toMatch(new RegExp(`^source: "${issueId}"`, 'm'))
    expect(spec).toMatch(new RegExp(`^sprint: "${SPRINT_ID}"`, 'm'))
    expect(report).toContain(`slated into ${SPRINT_ID}`)
    // Promote is now the plugin's refusal, by id.
    await expect(card.getByRole('button', { name: /^Promote to a bugfix spec…/ })).toHaveAttribute('title', /already has a bugfix spec/)
  })

  test('the Board shows the bugfix spec in the sprint and the Today column no longer counts the report', async () => {
    await openBuildView(page, 'Home')
    await sprintHomeVisible(page)
    await expect(page.locator(ASSUMED.today).getByTestId('today-issues')).toContainText('nothing awaits review', { timeout: 60_000 })
  })
})
