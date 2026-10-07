/** Studio, looked at the way a person would look at it: every screen, three window sizes.
 *
 * Two journeys through the real window against the real plugin:
 *   1. A first-time user: the empty welcome screen, New project, the setup wizard, a fresh project.
 *   2. A team a few days in: every stage and tab, the Build board, a document and its history, a
 *      spec and its hand-off form, Settings and the Console, then the same again at a laptop width
 *      and a narrow window. At the main size every read-only control is clicked too.
 *
 * It fails on defects any user would hit (see test/smoke/findings.ts): leaked internals, a control
 * with no name, a screen that scrolls sideways, an error nobody expected, a blank screen, any
 * uncaught exception or console error. Cosmetic and wording observations never fail it; they go in
 * the report. Everything it saw is written to test/screenshots/smoke/ (screenshots, observations.json
 * and report.md) so the pictures can be reviewed for what no rule can judge.
 *
 * It changes nothing it looks at and starts no model: controls that change something are listed in
 * the report as not clicked. Those are exercised, with their own fixtures, by the other specs here.
 * Skipped when no plugin checkout is beside this repository.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'
import { crawlControls, pushLongText, resize, settle } from '../smoke/crawl'
import { SmokeRun } from '../smoke/evidence'
import { switchOffLiveModel } from '../smoke/noLiveModel'
import { buildFirstRunUserData, buildSmokeProject } from '../smoke/fixture'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const OUT = join(root, 'test', 'screenshots', 'smoke')
const SIZES: [number, number][] = [[1280, 800], [1024, 700], [640, 800]]

const run = new SmokeRun(OUT)

async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development' },
  })
  // Before anything opens: a stage with an unstarted document greets with a live model call by itself.
  await switchOffLiveModel(app)
  const page = await app.firstWindow()
  run.watch(page)
  await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
  return { app, page }
}

async function closeQuickly(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 15_000))])
}

function tidy(workspace: string): void {
  try { rmSync(workspace, { recursive: true, force: true }) } catch { /* a leftover temp directory is not a failed test */ }
}

test.describe('[smoke] a first-time user starts a project', () => {
  test.skip(!PLUGIN.root || !existsSync(PLUGIN.python), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let first: ReturnType<typeof buildFirstRunUserData>

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    first = buildFirstRunUserData(PLUGIN.scriptsDir)
    ;({ app, page } = await launch(first.userData))
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as unknown as typeof dialog.showOpenDialog
    }, first.location)
  })

  test.afterAll(async () => {
    test.setTimeout(60_000)
    await closeQuickly(app)
    tidy(first.workspace)
  })

  test('the empty welcome screen tells a new person what to do', async () => {
    await expect(page.getByRole('button', { name: 'New project…' })).toBeVisible({ timeout: 30_000 })
    for (const [w, h] of SIZES) {
      const size = await resize(app, page, w, h)
      await run.look(page, 'First run › Welcome', size)
    }
    await resize(app, page, ...SIZES[0])
  })

  test('New project: the form, then a real project is created', async () => {
    await page.getByRole('button', { name: 'New project…' }).click()
    await expect(page.getByRole('button', { name: 'Create project' })).toBeDisabled()
    await run.look(page, 'First run › New project (empty)', '1280x800')
    await page.getByLabel('Project name').fill('Claims Portal')
    await page.getByRole('button', { name: 'Choose location…' }).click()
    await expect(page.getByRole('button', { name: 'Create project' })).toBeEnabled()
    await run.look(page, 'First run › New project (filled)', '1280x800')
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { name: 'Set up a project here' })).toBeVisible({ timeout: 60_000 })
  })

  test('the setup wizard shows what it will create, and finishing it lands in the first stage', async () => {
    test.setTimeout(240_000)
    await settle(page)
    await run.look(page, 'First run › Setup wizard', '1280x800')
    const profile = page.getByRole('combobox').first()
    if ((await profile.inputValue()) === '') await profile.selectOption({ index: 1 })
    const confirm = page.getByRole('button', { name: 'Set up project' })
    await expect(confirm).toBeEnabled({ timeout: 30_000 })
    await run.look(page, 'First run › Setup wizard (ready)', '1280x800')
    await confirm.click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 90_000 })
    await settle(page)
    for (const [w, h] of SIZES) {
      const size = await resize(app, page, w, h)
      await run.look(page, 'First run › the new project (first stage)', size)
    }
    await resize(app, page, ...SIZES[0])
    await crawlControls(page, run, 'First run › the new project (first stage)', '1280x800', async () => { await page.locator('nav[aria-label="Project"] ol > li > button').first().click(); await settle(page); await page.getByRole('tab', { name: 'Workflow' }).click() })
  })
})

test.describe('[smoke] a team a few days in, every screen', () => {
  test.skip(!PLUGIN.root || !existsSync(PLUGIN.python), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let workspace = ''

  const stageRows = () => page.locator('nav[aria-label="Project"] ol > li > button')
  const stageCount = () => stageRows().count()
  const stageLabel = async (i: number) => (await stageRows().nth(i).getAttribute('aria-label')) ?? `stage ${i}`
  const isBuild = (label: string) => /^Build Loop/.test(label)

  async function openStage(i: number): Promise<void> {
    await stageRows().nth(i).click()
    await settle(page)
  }
  async function openBuildView(view: string): Promise<void> {
    await page.getByRole('button', { name: /^Build Loop/ }).click()
    await page.getByRole('button', { name: view, exact: true }).click()
    await settle(page)
  }
  async function openTab(name: 'Workflow' | 'Documents' | 'Guide'): Promise<void> {
    await page.getByRole('tab', { name }).click()
    await settle(page)
  }

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    mkdirSync(OUT, { recursive: true })
    const built = buildSmokeProject(PLUGIN.root!, PLUGIN.scriptsDir, PLUGIN.python, 'smoke project')
    workspace = built.workspace
    ;({ app, page } = await launch(built.userData))
    await page.getByText('smoke project').click()
    await expect(page.getByRole('tab', { name: 'Workflow' })).toBeVisible({ timeout: 60_000 })
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    run.write()
    await closeQuickly(app)
    tidy(workspace)
  })

  /** One pass over every screen at the current window size. `interact` also clicks what is safe. */
  async function sweep(size: string, interact: boolean): Promise<void> {
    const stages = await stageCount()
    for (let i = 0; i < stages; i++) {
      const label = await stageLabel(i)
      const name = label.replace(/\.\s.*$/, '')
      if (isBuild(label)) {
        for (const view of ['Board', 'Issues', 'How it is going', 'Closing', 'Documents']) {
          await openBuildView(view)
          await run.look(page, `${name} › ${view}`, size)
          if (interact) await crawlControls(page, run, `${name} › ${view}`, size, async () => { await openBuildView(view) })
        }
        continue
      }
      for (const tab of ['Workflow', 'Documents', 'Guide'] as const) {
        await openStage(i)
        await openTab(tab)
        await run.look(page, `${name} › ${tab}`, size)
        if (interact) {
          await crawlControls(page, run, `${name} › ${tab}`, size, async () => { await openStage(i); await openTab(tab) })
          if (tab === 'Workflow') await pushLongText(page, run, `${name} › ${tab}`, size)
        }
      }
    }
  }

  for (const [w, h] of SIZES) {
    test(`every stage, tab and Build screen at ${w}x${h}`, async () => {
      test.setTimeout(900_000)
      const size = await resize(app, page, w, h)
      await sweep(size, w === SIZES[0][0])
    })
  }

  test('a document opens, shows its history, and the way back works', async () => {
    test.setTimeout(180_000)
    await resize(app, page, ...SIZES[0])
    for (const stage of [0, 1]) {
      await openStage(stage)
      await openTab('Documents')
      const doc = page.locator('main h3:has-text("Documents") + ul button:not([disabled])').first()
      if ((await doc.count()) === 0) { run.click(`stage ${stage}`, 'no document to open', 'skipped', 'none exists yet'); continue }
      await doc.click()
      await settle(page)
      await run.look(page, `Document view (stage ${stage})`, '1280x800')
      await crawlControls(page, run, `Document view (stage ${stage})`, '1280x800', async () => {
        await openStage(stage); await openTab('Documents'); await doc.click(); await settle(page)
      })
      const history = page.getByRole('button', { name: 'History', exact: true })
      if (await history.count()) {
        await history.click()
        await settle(page)
        await run.look(page, `Document history (stage ${stage})`, '1280x800')
        await openStage(stage)
      } else {
        await openStage(stage)
      }
    }
  })

  test('a spec opens from the board, and its hand-off form opens and closes without handing anything off', async () => {
    test.setTimeout(180_000)
    await openBuildView('Board')
    // The board opens on "Needs me", which is empty for a person who owns nothing, so the specs are
    // behind the Everything filter. (Noted in the report: a new user sees "0 shown".)
    await page.getByRole('button', { name: 'Everything', exact: true }).click()
    const row = page.getByRole('button', { name: /^0003 Sample change/ })
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.click()
    await settle(page)
    await run.look(page, 'Build › a spec', '1280x800')
    const handOff = page.getByRole('button', { name: /^hand.?off/i }).first()
    if (await handOff.count()) {
      await handOff.click()
      await settle(page)
      await run.look(page, 'Build › hand-off form', '1280x800')
      await page.getByRole('button', { name: 'Back to the board' }).click()
    } else {
      run.click('Build › a spec', 'Hand off', 'skipped', 'not offered for this spec')
    }
  })

  test('Settings, the Console and the chat panel are reachable from anywhere', async () => {
    test.setTimeout(120_000)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await settle(page)
    for (const [w, h] of SIZES) await run.look(page, 'Settings', await resize(app, page, w, h))
    await resize(app, page, ...SIZES[0])
    await crawlControls(page, run, 'Settings', '1280x800', async () => { await page.getByRole('button', { name: 'Settings', exact: true }).click(); await settle(page) })

    await page.getByRole('button', { name: 'Console', exact: true }).click()
    await run.look(page, 'Console open', '1280x800')
    // What failed, exactly: a red line in the Console says a command failed, not which one.
    run.failedCommands.push(...await page.evaluate(async () => {
      type Entry = { ok: boolean; command: string; args: string[]; exitCode: number | null }
      const bridge = (window as unknown as { studio: { getConsoleLog(): Promise<Entry[]> } }).studio
      return (await bridge.getConsoleLog()).filter((e) => !e.ok).map((e) => `${e.command} ${e.args.join(' ').slice(0, 160)} (exit ${e.exitCode})`)
    }))
    await page.getByRole('button', { name: 'Console', exact: true }).click()

    await openStage(0)
    await expect(page.getByTestId('chat-composer-input')).toBeVisible()
    await run.look(page, 'Chat panel (idle, nothing sent)', '1280x800')
  })

  test('the smoke run found no bugs and raised no runtime errors', async () => {
    run.write()
    const bugs = run.bugs().map((f) => `[${f.screen} @ ${f.size}] ${f.kind}: ${f.detail}`)
    const runtime = run.runtimeErrors.map((e) => `[${e.where}] ${e.text}`)
    expect.soft(runtime, `runtime errors (see ${OUT}/report.md)`).toEqual([])
    expect(bugs, `bugs (see ${OUT}/report.md)`).toEqual([])
  })
})
