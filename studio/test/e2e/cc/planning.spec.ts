/** Sprint planning in the real window (togo-command-center.md §3.2, §7 P7).
 *
 * Three promises. A NOT READY candidate is still listed and offers "refine in place →" (the
 * plugin, not the UI, decides what may be slated — `SLATEABLE_STATUSES` admits drafts). "Apply
 * proposal" writes the plugin's deterministic `slate --json proposal[]` through ONE `slate`
 * verb: `sprint:` lands on every proposed spec and the ledger shows the `slated` events the
 * plugin writes (one per spec — sprint.py:866-924 — the plan's "one slated line" is one
 * invocation, not one row). And "Commit the sprint" stops at the first non-zero exit, showing
 * `ready`'s gaps in the plugin's own words — compared here against what `sprint.py ready`
 * itself prints for the same slate.
 *
 * Fixture: Build phase, a roster, sprint S07 open, the three scaffolded specs UNslated so they
 * are the candidates. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  enterBuildLoop, ledgerEvents, newProject, newSprint, PLUGIN_ROOT, pyJson, pyResult, script, specFrontmatter, SPRINT_ID,
  VENV_PYTHON, writeRoster, type Fixture,
} from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openBuildView, openProject, SEL, seedSettings, TEXT } from './shell'

/** `sprint.py slate --json`: `proposal[]` is the plugin's ROWS (id, name, risk, dor…), `candidates` a count. */
interface Proposal { proposal: Array<{ id: string }>; candidates: number; target: number }

test.describe('[command center P7] sprint planning in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let fx: Fixture
  let proposal: Proposal

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fx = newProject('cc-planning')
    enterBuildLoop(fx.project)
    writeRoster(fx.project)
    newSprint(fx.project)
    proposal = pyJson<Proposal>([script('sprint.py'), 'slate', '--repo', fx.project, '--sprint', SPRINT_ID, '--json'])
    seedSettings(fx.userData, fx.project, 'planning project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'planning project')
    await ensureActor(page, fx.project)
    await openBuildView(page, 'Planning')
    await expect(page.locator(ASSUMED.backlogColumn)).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-planning')
  })

  test('every candidate is listed; a NOT READY one offers "refine in place →" and is still slateable', async () => {
    const backlog = page.locator(ASSUMED.backlogColumn)
    expect(proposal.candidates).toBe(fx.specIds.length)
    for (const id of fx.specIds) {
      const row = backlog.locator(`[data-spec="${id}"]`)
      await expect(row).toBeVisible()
      await expect(row).toContainText('NOT READY')
      await expect(row.getByRole('button', { name: TEXT.refineInPlace })).toBeVisible()
      // "Add to slate" never refuses on the UI's own count — the plugin lists gaps at `ready`.
      await expect(row.getByRole('button', { name: 'Add to slate' })).toBeEnabled()
    }
    // Planning is the lit Build view; exactly one thing is current.
    await expect(page.getByRole('button', { name: 'Planning', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
  })

  test('"The plugin proposes" is the deterministic proposal, labelled, and the slate is empty until it is applied', async () => {
    const says = page.locator(ASSUMED.pluginSays)
    await expect(says).toContainText(/id-order|in id order/)
    for (const { id } of proposal.proposal) await expect(says).toContainText(id)
    await expect(page.locator(ASSUMED.slateColumn).locator('[data-spec]')).toHaveCount(0)
    // The reasoned proposal is a named agent run; this build shows the plugin's (§2.7).
    const reasoned = says.getByRole('button', { name: /reason/i })
    if (await reasoned.count()) {
      await expect(reasoned).toBeDisabled()
      const describedBy = await reasoned.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      await expect(page.locator(`#${describedBy}`)).toContainText('a reasoned proposal is a named agent run')
    }
  })

  test('Apply proposal runs ONE slate verb: sprint: on every proposed spec, one slated event per spec', async () => {
    await page.locator(ASSUMED.pluginSays).getByRole('button', { name: 'Apply proposal' }).click()
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    // The dialog shows the exact argv before anything runs — one `slate`, every proposed id.
    await expect(dialog).toContainText('sprint.py slate')
    for (const { id } of proposal.proposal) await expect(dialog).toContainText(`--spec ${id}`)
    expect(ledgerEvents(fx.project, 'slated')).toHaveLength(0)
    await dialog.locator(SEL.writeControl).click()
    const result = page.locator(ASSUMED.verbResult)
    await expect(result).toContainText(TEXT.done, { timeout: 60_000 })
    await expect(result).toContainText(`Slated into ${SPRINT_ID}`)
    for (const { id } of proposal.proposal) expect(specFrontmatter(fx.specPath[id], 'sprint')).toBe(SPRINT_ID)
    const slated = ledgerEvents(fx.project, 'slated')
    expect(slated.map((e) => e.spec).sort()).toEqual(proposal.proposal.map((r) => r.id).sort())
    await page.keyboard.press('Escape')
    // The screen re-read AFTER the exit code: the slate column now holds the rows.
    await expect(page.locator(ASSUMED.slateColumn).locator('[data-spec]')).toHaveCount(proposal.proposal.length, { timeout: 30_000 })
  })

  test('Commit the sprint stops at ready\'s exit 1 and shows the gaps in sprint.py\'s own words', async () => {
    await page.getByRole('button', { name: 'Commit the sprint' }).click()
    const dialog = page.locator(ASSUMED.verbDialog)
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.locator(SEL.writeControl).click()
    const steps = page.locator(ASSUMED.commitStep)
    const readyStep = steps.filter({ hasText: 'ready' }).first()
    await expect(readyStep).toContainText(TEXT.notDone, { timeout: 60_000 })
    // Verbatim: the same slate asked of the plugin directly prints these lines (exit 1, idempotent).
    const plugin = pyResult([script('sprint.py'), 'ready', '--repo', fx.project, '--sprint', SPRINT_ID, '--by', 'Priya N.'])
    expect(plugin.code).toBe(1)
    const lines = (plugin.stdout + plugin.stderr).split('\n').map((l) => l.trim()).filter(Boolean)
    expect(lines[0]).toMatch(/^Sprint S07 is NOT ready/)
    for (const line of lines) await expect(readyStep).toContainText(line)
    // Stopped: no plan step ran, so no planning page was written.
    await expect(steps.filter({ hasText: 'plan' }).filter({ hasText: TEXT.done })).toHaveCount(0)
    expect(existsSync(join(fx.project, '.sdlc', 'reports', `sprint-${SPRINT_ID}-planning.html`))).toBe(false)
    await page.keyboard.press('Escape')
  })

  test('the slate column names the plugin\'s HIGH line and leaves Security signer disabled with its reason', async () => {
    const slateCol = page.locator(ASSUMED.slateColumn)
    // Recorded pin change (togo-command-center.md §8, fixer pass, finding 11): a slate row is ONE
    // line — numeral, id + name, chips, Builder / Checker — and the HIGH line, the people and the
    // Security signer live behind the row's own disclosure ("More on this row"). A closed
    // `<details>` keeps its text in the DOM but out of the accessibility tree, so the signer's
    // `combobox` is only reachable once the row is opened; the assertions below are unchanged.
    const rowMore = slateCol.locator('[data-testid="slate-row-more"]:not([open]) > summary')
    for (let i = await rowMore.count(); i > 0; i -= 1) await rowMore.first().click()
    await expect(slateCol.locator('[data-testid="slate-row-more"]:not([open])')).toHaveCount(0)
    await expect(slateCol).toContainText('security pass — blocks')
    await expect(slateCol).toContainText('named human sign-off in the PR')
    // The signer slot is a picker (a native select, `combobox`), disabled with its reason — as the Builder / Checker slots are pickers.
    const signer = slateCol.getByRole('combobox', { name: /security signer/i }).first()
    await expect(signer).toBeDisabled()
    const describedBy = await signer.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`#${describedBy}`)).toContainText('No frontmatter field for a security signer')
  })
})
