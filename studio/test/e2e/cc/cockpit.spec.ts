/** The cockpit walked end to end in the real window against the real plugin (Q5 — cockpit QA;
 * togo-command-center.md §3, §8; the owner's v12 critique): land → open a card → hand off →
 * verdict → omnibar → spec card → planning → close → steering. NOT serial: each test re-anchors
 * itself (`settle`), so a gap in one beat is one red line, not a skipped walk. Every number is
 * read from the plugin at the moment of asserting (`sprintStatus`, `slate --json`, `ready`,
 * `handoff.py --json`) — a lane is right only when it agrees with the plugin's fresh read.
 *
 * Fixture: Build phase, roster (+ @sam-k), S07 target 5 (HIGH:2 MEDIUM:2 LOW:1); 0001 in-flight
 * + both verdicts, checker @sam-k (Building; `h`), 0002 in-flight, verdicts pending (Checking),
 * 0003 merged; two UNslated drafts 0004 (HIGH, developer @sam-k → a live handoff.py refusal on
 * the spec card) and 0005 (MEDIUM) as planning's candidates. */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  enterBuildLoop, HUMAN, ledgerEvents, newProject, openOverdueDecision, PLUGIN_ROOT, py, pyJson, pyResult, ROSTER_HANDLE, script,
  setFrontmatter, slate, SPRINT_ID, sprintStatus, VENV_PYTHON, verdict, writeRoster, type Fixture,
} from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openBuildView, openPalette, openProject, refreshScreen, SEL, seedSettings, sequence, sprintHomeVisible, TEXT } from './shell'

interface Status { slate: { id: string; eng_review: string }[]; verdicts_pending: { spec: string }[]; handoffs_open: { spec: string; to: string }[] }
type Proposal = { proposal: { id: string }[] }; type Refusal = { ok: false; refusal: { kind: string; message: string } }

/** VerbDialog's argv `<pre>` (§3.6) — not yet in shell.ts's ASSUMED list, so named here. */
const VERB_PREVIEW = '[data-testid="verb-preview"]'
const EXTRA: ReadonlyArray<readonly [string, string]> = [['fraud score feed', 'HIGH'], ['letters batch', 'MEDIUM']]

function cockpitFixture(): Fixture {
  const fx = newProject('cc-cockpit')
  enterBuildLoop(fx.project)
  writeRoster(fx.project)
  for (const [name, risk] of EXTRA) py([script('new_spec.py'), '--repo', fx.project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'])
  const files = readdirSync(join(fx.project, 'specs')).filter((f) => /^\d{4}-/.test(f)).sort()
  fx.specIds = files.map((f) => f.slice(0, 4))
  fx.specPath = Object.fromEntries(files.map((f) => [f.slice(0, 4), join(fx.project, 'specs', f)]))
  const [a, b, c, d] = fx.specIds
  py([script('sprint.py'), 'new', '--repo', fx.project, '--sprint', SPRINT_ID, '--goal', 'Adjusters file without a phone call', '--start', '2026-09-28', '--target', '5', '--mix', 'HIGH:2,MEDIUM:2,LOW:1', '--by', HUMAN])
  slate(fx.project, [a, b, c])
  setFrontmatter(fx.specPath[a], 'status', 'in-flight')
  setFrontmatter(fx.specPath[b], 'status', 'in-flight')
  setFrontmatter(fx.specPath[c], 'status', 'merged')
  py([script('spec_transition.py'), '--spec', fx.specPath[a], 'assign', '--checker', ROSTER_HANDLE, '--by', HUMAN])
  setFrontmatter(fx.specPath[d], 'developer', ROSTER_HANDLE)
  verdict(fx.project, a, 'eng', 'accepted')
  verdict(fx.project, a, 'data', 'accepted')
  return fx
}

test.describe('[cockpit QA] the command center walked end to end', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')

  let app: ElectronApplication
  let page: Page
  let fx: Fixture
  let actor = ''
  const card = (id: string) => page.locator(`${ASSUMED.laneCard}[data-spec="${id}"]`)

  /** Back to the lanes: dialogs closed, the sprint home showing. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3 && (await page.locator(`[role="dialog"], ${ASSUMED.specCard}`).count()); i += 1) await page.keyboard.press('Escape')
    if (!(await page.locator(SEL.sprintHome).count())) await sequence(page, 'g', 's')
    await sprintHomeVisible(page)
  }

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    fx = cockpitFixture()
    seedSettings(fx.userData, fx.project, 'cockpit project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'cockpit project')
    actor = await ensureActor(page, fx.project)
    openOverdueDecision(fx.project, actor, `Confirm risk tier for ${fx.specIds[3]} (proposed HIGH)`)
    await refreshScreen(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-cockpit')
  })

  test('open lands on the sprint home with needs-you addressed to me', async () => {
    await sprintHomeVisible(page)
    await expect(page.locator(SEL.sprintHeader)).toContainText(SPRINT_ID)
    await expect(page.locator(ASSUMED.needsYouChip)).toContainText(/needs you · 1\b/)
    await expect(page.locator(ASSUMED.today)).toContainText('DL-01')
    await expect(page.locator(ASSUMED.laneCard)).toHaveCount(3)
    for (const [id, lane] of [[fx.specIds[0], 'building'], [fx.specIds[1], 'checking'], [fx.specIds[2], 'merged']] as const) await expect(card(id)).toHaveAttribute('data-lane', lane)
  })

  test('j j ↵ opens the third card in place; Esc returns to the lanes', async () => {
    await settle()
    const third = (await page.locator(ASSUMED.laneCard).nth(2).getAttribute('data-spec')) ?? ''
    await page.locator(SEL.laneScope).focus()
    for (const key of ['j', 'j', 'Enter']) await page.keyboard.press(key)
    const specCard = page.locator(ASSUMED.specCard)
    await expect(specCard).toBeVisible({ timeout: 30_000 })
    await expect(specCard).toHaveAttribute('data-spec', third)
    await page.keyboard.press('Escape')
    await expect(specCard).toHaveCount(0)
    await expect(page.locator(SEL.laneScope)).toBeVisible()
  })

  test('h opens the hand-off with the checker prefilled; Confirm runs the plugin and the baton reads its row', async () => {
    await settle()
    const [a] = fx.specIds
    await card(a).focus()
    await page.keyboard.press('h')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText(a)
    await expect(dialog.locator(VERB_PREVIEW)).toContainText(`--to ${ROSTER_HANDLE}`)
    const confirm = dialog.locator(SEL.writeControl)
    await expect(confirm).toBeEnabled()
    await confirm.click()
    const result = dialog.locator(ASSUMED.verbResult)
    await expect(result).toContainText(TEXT.done, { timeout: 60_000 })
    await expect(result).toContainText(`Handoff recorded: ${a} → ${ROSTER_HANDLE}`)
    const [event] = ledgerEvents(fx.project, 'handoff')
    expect(event).toMatchObject({ spec: a, to: ROSTER_HANDLE, by: actor })
    await page.keyboard.press('Escape')
    const [row] = sprintStatus<Status>(fx.project).handoffs_open
    await expect(page.locator(ASSUMED.baton)).toContainText(`${row.spec} → ${row.to}`, { timeout: 30_000 })
  })

  test('v records a verdict; the lane changes only when the plugin\'s fresh read says so', async () => {
    await settle()
    const [, b] = fx.specIds
    await card(b).focus()
    await page.keyboard.press('v')
    const dialog = page.locator('[data-testid="verdict-dialog"]')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByText('accepted', { exact: true }).click()
    await dialog.locator(SEL.writeControl).click()
    await expect(dialog.locator(ASSUMED.verbResult)).toContainText(TEXT.done, { timeout: 60_000 })
    await page.keyboard.press('Escape')
    // eng accepted, data pending: the plugin keeps 0002 in verdicts_pending → still Checking.
    const view = sprintStatus<Status>(fx.project)
    expect(view.verdicts_pending.map((v) => v.spec)).toContain(b)
    expect(view.slate.find((r) => r.id === b)?.eng_review).toBe('accepted')
    await expect(card(b).locator('[data-review-chip="eng"]')).toContainText('accepted', { timeout: 30_000 })
    await expect(card(b)).toHaveAttribute('data-lane', 'checking')
  })

  test('the omnibar previews the exact argv, then runs it; the lane follows the refreshed read', async () => {
    await settle()
    const [, b] = fx.specIds
    await openPalette(page)
    await page.locator(SEL.paletteInput).fill(`verdict ${b} n-a data because no new data`)
    const line = `sprint.py verdict --spec ${b} --lane data --verdict n-a`
    await expect(page.locator(SEL.paletteOption).first()).toContainText(`Run: ${line}`)
    await page.keyboard.press('Enter')
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator(VERB_PREVIEW)).toContainText(line)
    // The preview shows the argv as it runs: a name with whitespace is quoted ("Priya N.").
    await expect(dialog.locator(VERB_PREVIEW)).toContainText(`--by ${/\s/.test(actor) ? `"${actor}"` : actor}`)
    await dialog.locator(SEL.writeControl).click()
    await expect(dialog.locator(ASSUMED.verbResult)).toContainText(TEXT.done, { timeout: 60_000 })
    await page.keyboard.press('Escape')
    if (await page.locator(SEL.palette).count()) await page.keyboard.press('Escape')
    const view = sprintStatus<Status>(fx.project)
    expect(view.verdicts_pending.map((v) => v.spec)).not.toContain(b)
    await expect(card(b)).toHaveAttribute('data-lane', 'building', { timeout: 30_000 })
  })

  test('the spec card: every ladder rung carries its source; Hand off is refused in handoff.py\'s words', async () => {
    await settle()
    const d = fx.specIds[3]
    const live = pyResult([script('handoff.py'), '--repo', fx.project, '--spec', fx.specPath[d], '--developer', ROSTER_HANDLE, '--json'])
    expect(live.code).toBe(1)
    const refusal = JSON.parse(live.stdout) as Refusal
    expect(refusal.refusal.kind).toBe('not_ready')
    const row = page.locator(ASSUMED.refining).locator(`[data-spec="${d}"]`)
    await row.scrollIntoViewIfNeeded()
    await row.getByRole('button', { name: TEXT.refineInPlace }).click()
    const specCard = page.locator(ASSUMED.specCard)
    await expect(specCard).toHaveAttribute('data-spec', d, { timeout: 30_000 })
    const rungs = specCard.locator('[data-testid="spec-ladder"] li[data-rung]')
    await expect(rungs.first()).toBeVisible({ timeout: 30_000 })
    for (let i = 0, n = await rungs.count(); i < n; i += 1) await expect(rungs.nth(i).locator('[aria-label="source"]')).not.toBeEmpty()
    const handOff = specCard.getByRole('button', { name: /^Hand off/ })
    await expect(handOff).toBeDisabled()
    const describedBy = await handOff.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`#${describedBy}`)).toHaveText(refusal.refusal.message)
    await page.keyboard.press('Escape')
    await expect(specCard).toHaveCount(0)
  })

  test('planning: Add to slate lands the plugin\'s sprint: line, then Apply proposal slates the rest', async () => {
    await settle()
    const [, , , d] = fx.specIds
    await openBuildView(page, 'Planning')
    const backlog = page.locator(ASSUMED.backlogColumn)
    await expect(backlog).toBeVisible({ timeout: 60_000 })
    await backlog.locator(`[data-spec="${d}"]`).getByRole('button', { name: 'Add to slate' }).click()
    await expect(page.locator(ASSUMED.slateColumn).locator(`[data-spec="${d}"]`)).toBeVisible({ timeout: 60_000 })
    expect(ledgerEvents(fx.project, 'slated').map((e) => e.spec)).toContain(d)
    const proposal = pyJson<Proposal>([script('sprint.py'), 'slate', '--repo', fx.project, '--sprint', SPRINT_ID, '--json']).proposal.map((r) => r.id)
    expect(proposal.length).toBeGreaterThan(0)
    await page.locator(ASSUMED.pluginSays).getByRole('button', { name: 'Apply proposal' }).click()
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    for (const id of proposal) await expect(dialog.locator(VERB_PREVIEW)).toContainText(`--spec ${id}`)
    await dialog.locator(SEL.writeControl).click()
    await expect(dialog.locator(ASSUMED.verbResult)).toContainText(TEXT.done, { timeout: 60_000 })
    await page.keyboard.press('Escape')
    for (const id of proposal) await expect(page.locator(ASSUMED.slateColumn).locator(`[data-spec="${id}"]`)).toBeVisible({ timeout: 30_000 })
  })

  test('planning: Commit stops at the first non-zero exit and shows the plugin\'s words', async () => {
    await settle()
    await openBuildView(page, 'Planning')
    await page.getByRole('button', { name: 'Commit the sprint' }).click()
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.locator(SEL.writeControl).click()
    const steps = page.locator(ASSUMED.commitStep)
    const ready = steps.filter({ hasText: 'ready' }).first()
    await expect(ready).toContainText(TEXT.notDone, { timeout: 60_000 })
    const plugin = pyResult([script('sprint.py'), 'ready', '--repo', fx.project, '--sprint', SPRINT_ID, '--by', HUMAN])
    expect(plugin.code).toBe(1)
    for (const l of (plugin.stdout + plugin.stderr).split('\n').map((s) => s.trim()).filter(Boolean)) await expect(ready).toContainText(l)
    await expect(steps.filter({ hasText: 'plan' }).filter({ hasText: TEXT.done })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('close sprint shows outcomes as the plugin reports them — "no data", never a zero', async () => {
    await settle()
    await openBuildView(page, 'Closing')
    const screen = page.locator(ASSUMED.closeScreen)
    await expect(screen).toBeVisible({ timeout: 60_000 })
    const outcomes = screen.locator('[data-testid="close-outcomes"]')
    await expect(outcomes).toBeVisible({ timeout: 60_000 })
    await expect(outcomes).toContainText('no data')
    for (const stat of await outcomes.locator(SEL.stat).allTextContents()) expect(stat).not.toMatch(/\b0\b/)
    await expect(screen.locator(ASSUMED.closeRow)).toHaveCount(sprintStatus<Status>(fx.project, SPRINT_ID).slate.length)
  })

  test('steering mode holds no write control; Esc returns to where it was entered', async () => {
    await settle()
    await sequence(page, 'g', 't')
    const steering = page.locator(ASSUMED.steering)
    await expect(steering).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(SEL.writeControl)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(steering).toHaveCount(0)
    await sprintHomeVisible(page)
  })
})
