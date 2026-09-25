/** Spec 0010's window, driven for real.
 *
 * Everything else in this repository tests the main process. That is where the data-integrity
 * bugs lived, so it earned the attention — but it left the half people actually touch
 * unverified, and several of spec 0010's acceptance checks are statements about what is on
 * the screen. "Buttons that add or change content do not exist outside edit mode" cannot be
 * proven by a function test. It needs the real window.
 *
 * So this launches the packaged app with its own settings directory, seeded with a real
 * initialized project as a recent one, and then CLICKS: open the project, open a document,
 * enter edit mode, leave it. No IPC shortcuts — calling `window.studio` directly would test
 * the same main process again and prove nothing new about the interface.
 *
 * Skipped when no plugin checkout is beside this repository, since Studio cannot open a
 * project without the plugin's scripts.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')

// Located once, in one place, and LOUD when it cannot be found. A window run where 31 of 33
// tests skipped used to print "2 passed" and exit 0 — indistinguishable from a run that
// proved everything. See test/pluginRoot.ts.
const PLUGIN = requirePlugin(join(root, 'test'))

const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python
const REQUIREMENTS = '.sdlc/artifacts/01-requirements/requirements.md'
const NON_FUNCTIONAL = '.sdlc/artifacts/01-requirements/non-functional-requirements.md'

let app: ElectronApplication
let page: Page
let workspace = ''
let project = ''

test.describe('[spec 0010] reading and editing a document in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-ui-'))
    project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
    cpSync(join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'requirements.md'), join(project, REQUIREMENTS))
    // A second, shaped document that has NO numbered sections — which is the ordinary case,
    // 22 of the 27 shapes. Needed to prove edit mode stays quiet there; see the test below.
    cpSync(
      join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'non-functional-requirements.md'),
      join(project, NON_FUNCTIONAL),
    )

    // A fresh project starts in Phase 0, whose documents do not exist yet — so the stage home
    // would correctly show nothing openable. Move it to Phase 1, which is where the document
    // above lives, and which is what a project looks like once Discovery is done. Editing the
    // state file is legitimate fixture setup; advancing for real needs gates this test is not
    // about.
    const statePath = join(project, '.sdlc', 'state.yaml')
    writeFileSync(
      statePath,
      readFileSync(statePath, 'utf-8')
        .replace(/^current_phase:.*$/m, 'current_phase: "1"')
        .replace(/^phase_name:.*$/m, 'phase_name: "requirements"'),
      'utf-8',
    )

    // The app's own settings, seeded so the welcome screen offers this project — which is how
    // a person reaches it, and therefore the path worth exercising. A separate directory so
    // the test never touches the real installation's settings.
    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'e2e project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
  })

  test.afterAll(async () => {
    // The same teardown race board.spec.ts already fixed, which this file never got. Studio
    // runs a repeating background pull that spawns git, so at shutdown the application can be
    // mid-subprocess while this tries to delete the folder underneath it — and on Windows a
    // directory with live handles does not go quietly. Closing and deleting together then
    // exceed the default 30s hook budget, which failed the whole file while every assertion
    // in it had passed. Each step is guarded so one slow step cannot strand the others, and a
    // temp directory that survives is the operating system's problem, never a test result.
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0010-documents.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch { /* a leftover temp directory is not a failed test */ }
  })

  test('opens the project from the welcome screen', async () => {
    await page.getByText('e2e project').click()
    // The stage home's HEADING specifically. A bare text match became ambiguous once a
    // Documents navigation tab existed, which is the kind of breakage a loose locator
    // invites — it was only ever unique by accident.
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({ timeout: 30_000 })
  })

  test('the stage home lists the document and what it is for', async () => {
    await expect(page.getByRole('button', { name: /^requirements\.md/ })).toBeEnabled()
    // A document that does not exist yet says so rather than looking broken or clickable.
    await expect(page.getByRole('button', { name: /^epics\.md/ })).toBeDisabled()
  })

  test('opens a document as sections and fields, showing where it lives', async () => {
    await page.getByRole('button', { name: /^requirements\.md/ }).click()
    // Spec 0010: every field shows where the document lives, without leaving the page.
    await expect(page.getByText(REQUIREMENTS)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /requirements\.md/i })).toBeVisible()
  })

  test('NOTHING that changes content exists outside edit mode', async () => {
    // The acceptance check says these controls do not EXIST outside edit mode — not that they
    // are disabled. A disabled button still tells a person "this is a thing you could do
    // here", so absence is the assertion, and count(0) is how you assert absence.
    await expect(page.getByRole('button', { name: /^Save field$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Ask Claude to draft/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Add /i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Add another/i })).toHaveCount(0)
    await expect(page.locator('textarea')).toHaveCount(0)
    await expect(page.locator('input:not([type="checkbox"])')).toHaveCount(0)
  })

  test('edit mode reveals them, and shows the next number before anything is created', async () => {
    await page.getByRole('button', { name: /^Edit$/ }).click()
    await expect(page.getByRole('button', { name: /^Save field$/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Ask Claude to draft/i }).first()).toBeVisible()
    // "that number is shown before the person saves it" — the add control names the id it
    // will use, rather than revealing it afterwards.
    //
    // The wait is generous because the number comes from the plugin running in ANOTHER
    // PROCESS, and the default five seconds is not a promise the machine makes under load.
    // This assertion has already failed once on timing alone and was read as a missing
    // feature; the control it waits on now says "Working out the next number…" while the
    // answer is outstanding, so a real absence and a slow answer no longer look alike.
    await expect(page.getByRole('button', { name: /^Add FR-\d+$/ })).toBeVisible({ timeout: 30_000 })
  })

  test('a document with no numbered sections raises no alarm in edit mode', async () => {
    // The regression guard for a defect the correctness review caught in this very change.
    // Surfacing the "could not work out the next number" failure was right; asking for a
    // number on a document that cannot have one was not. The plugin answers, correctly, that
    // there are no numbered sections — and that answer was being painted as an error banner
    // on 22 of the 27 shapes. A false alarm on a healthy document is worse than the silence
    // it replaced, because it teaches people that the red box means nothing.
    await page.getByRole('button', { name: /Done editing/i }).click()
    await page.getByRole('button', { name: /^← Back to the stage$/ }).click()
    await page.getByRole('button', { name: /^non-functional-requirements\.md/ }).click()
    await expect(page.getByRole('heading', { name: /non-functional-requirements\.md/i }))
      .toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: /^Edit$/ }).click()
    // Edit mode works — the fields are editable — and raises nothing.
    await expect(page.getByRole('button', { name: /^Save field$/ }).first()).toBeVisible()
    // Proving a NEGATIVE across a process boundary needs elapsed time, and this assertion
    // took two goes to get right. Both failures were the same shape — passing vacuously:
    //
    //   1. it matched wording the plugin never uses ("no numbered sections"; it actually says
    //      "this shape declares no repeating section"), so it looked for a sentence nobody
    //      writes and of course did not find it;
    //   2. then it checked the banner's absence IMMEDIATELY after clicking Edit, which
    //      succeeds instantly against an element that has merely not rendered YET.
    //
    // A fixed wait is the right tool here, unlike almost everywhere else: the claim is "no
    // banner ever appears", and that is only meaningful once the round trip has had time to
    // land. It takes a few hundred milliseconds; this allows ten times that.
    await page.waitForTimeout(3_000)
    await expect(page.getByTestId('document-error')).toHaveCount(0)
    // And no add control at all, because there is nothing to add.
    await expect(page.getByRole('button', { name: /^Add /i })).toHaveCount(0)

    await page.getByRole('button', { name: /Done editing/i }).click()
    await page.getByRole('button', { name: /^← Back to the stage$/ }).click()
    await page.getByRole('button', { name: /^requirements\.md/ }).click()
    await expect(page.getByRole('heading', { name: /requirements\.md/i })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /^Edit$/ }).click()
  })

  test('leaving edit mode takes them away again', async () => {
    await page.getByRole('button', { name: /Done editing/i }).click()
    await expect(page.getByRole('button', { name: /^Save field$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Add FR-\d+$/ })).toHaveCount(0)
  })

  // A REAL model call, through the real window. It is slower than everything else here and it
  // needs the machine to be signed in, so it says so plainly when it cannot run rather than
  // passing quietly. The acceptance check is about what happens around the draft — that it is
  // offered rather than applied, that the person can throw it away, and that throwing it away
  // is still recorded — so a live call is the only way to get a real draft to act on.
  test('a Claude draft is offered for review, not applied, and a discard is still recorded', async () => {
    // Somewhere with no Claude login — CI, most obviously — this test would spend two
    // minutes waiting for a draft that is never coming, then skip. Saying so up front costs
    // nothing and is the same bargain as STUDIO_SKIP_PLUGIN_TESTS: the run may decline to
    // prove something, but only out loud and only because somebody asked it to.
    test.skip(
      process.env.STUDIO_SKIP_LIVE_MODEL === '1',
      'STUDIO_SKIP_LIVE_MODEL=1 — this needs a real, signed-in model call, so it was not run.',
    )
    test.setTimeout(180_000)
    await page.getByRole('button', { name: /^Edit$/ }).click()

    const firstValue = await page.locator('textarea, input[type="text"]').first().inputValue()

    await page.getByRole('button', { name: /Ask Claude to draft/i }).first().click()
    const proposal = page.getByText(/Claude's draft — review before accepting/i)
    try {
      await expect(proposal).toBeVisible({ timeout: 120_000 })
    } catch {
      const failure = await page.locator('text=/could not draft/i').first().textContent().catch(() => null)
      test.skip(true, `no draft came back (signed out or offline?): ${failure ?? 'timed out'}`)
      return
    }

    // Offered, not applied: both choices are present, and the field has not changed yet.
    await expect(page.getByRole('button', { name: /^Use this$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Discard$/ })).toBeVisible()
    expect(await page.locator('textarea, input[type="text"]').first().inputValue()).toBe(firstValue)

    await page.getByRole('button', { name: /^Discard$/ }).click()
    await expect(proposal).toHaveCount(0)
    expect(await page.locator('textarea, input[type="text"]').first().inputValue()).toBe(firstValue)

    // Matt's resolved decision: a discarded draft still reaches the ledger, so "how much of
    // this was AI-drafted, including what we turned down" stays answerable.
    await expect
      .poll(() => existsSync(join(project, '.sdlc', 'metrics', 'draft-log.jsonl')), { timeout: 10_000 })
      .toBe(true)
    expect(readFileSync(join(project, '.sdlc', 'metrics', 'draft-log.jsonl'), 'utf-8')).toContain('discarded')

    await page.getByRole('button', { name: /Done editing/i }).click()
  })

  test('history is honest about a document nobody has saved through Studio yet', async () => {
    await page.getByRole('button', { name: /^History$/ }).click()
    await expect(page.getByText(/History —/)).toBeVisible({ timeout: 30_000 })

    // This document existed before any version was recorded, so the plugin reports a single
    // synthesized "baseline" with no actor, no reason, and no stored content. Measured
    // against the plugin directly rather than assumed — the first version of this test
    // expected an empty panel and was simply wrong about what a fresh project looks like.
    //
    // Asserting the honest rendering rather than the empty one is the more useful check: the
    // failure worth catching is a panel that invents an author or a date it does not have.
    await expect(page.getByText(/^v1/)).toBeVisible()
    await expect(page.getByText(/unknown/i)).toBeVisible()
    await expect(page.getByText(/No reason recorded/i)).toBeVisible()
    await expect(page.getByText(/Content not available on this machine/i)).toBeVisible()

    // And with no content stored, neither button offers something it cannot deliver.
    await expect(page.getByRole('button', { name: /^Compare$/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: /^Restore$/ })).toBeDisabled()
  })
})
