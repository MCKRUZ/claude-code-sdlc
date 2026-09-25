/** The Build board in the real window (spec 0011).
 *
 * The check that matters most here is the last one. Spec 0011 asks for a board of 200 specs
 * across 4 teams to open in under two seconds, and its Checking Plan tells the reviewer to
 * confirm that was MEASURED, not assumed. The data half is already measured — 1.2 seconds,
 * one code-host request regardless of spec count — but rendering two hundred rows was, until
 * this file, an untested assumption. So the fixture builds two hundred real specs and the
 * test times the real window.
 *
 * Everything else here is the read-only promise: the status view offers no control that
 * changes anything, which cannot be proven by a function test — only by looking at what is
 * on screen.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const root = resolve(import.meta.dirname, '..', '..')
const TEAMS = ['core', 'claims', 'payments', 'platform']
const SPEC_COUNT = 200

function findPluginRoot(): string | null {
  const candidates = [process.env.SDLC_PLUGIN_ROOT, resolve(root, '..', 'claude-code-sdlc')]
    .filter((c): c is string => Boolean(c))
  return candidates.find((c) => existsSync(join(c, 'scripts', 'spec_status.py'))) ?? null
}

const PLUGIN_ROOT = findPluginRoot()
const SCRIPTS_DIR = PLUGIN_ROOT ? join(PLUGIN_ROOT, 'scripts') : ''
const VENV_PYTHON = PLUGIN_ROOT ? join(SCRIPTS_DIR, '.venv', 'Scripts', 'python.exe') : ''

let app: ElectronApplication
let page: Page
let workspace = ''

/** Two hundred real spec files across four teams, with a spread of risk, status and people —
 * a board that only works at twenty is a demo, which is the spec's own phrasing. */
function writeSpecs(project: string): void {
  const specs = join(project, 'specs')
  mkdirSync(specs, { recursive: true })
  for (let i = 1; i <= SPEC_COUNT; i++) {
    const id = String(i).padStart(4, '0')
    const status = ['draft', 'ready', 'in-flight', 'merged'][i % 4]
    writeFileSync(join(specs, `${id}-synthetic-${i}.md`), `---
spec: "${id}"
name: "synthetic-${i}"
status: ${status}
type: feature
risk: ${['LOW', 'MEDIUM', 'HIGH'][i % 3]}
owner: "${i % 5 === 0 ? '@matt' : '@priya-n'}"
developer: "${i % 3 === 0 ? '@matt' : '@sam-k'}"
checker: "${i % 7 === 0 ? '@matt' : '@priya-n'}"
team: "${TEAMS[i % 4]}"
created: "2026-09-24"
---

# Spec ${id} — Synthetic board row ${i}

## Goal
A row on the board.
`, 'utf-8')
  }
}

test.describe('[spec 0011] the Build board in the real window', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-board-'))
    const project = join(workspace, 'project')

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })
    writeSpecs(project)

    const userData = join(workspace, 'userData')
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({
      recentProjects: [{ path: project, name: 'board project', lastOpenedAt: new Date().toISOString() }],
      pluginScriptsPathOverride: SCRIPTS_DIR,
    }, null, 2))

    app = await electron.launch({
      args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
    await page.getByText('board project').click()
    await expect(page.getByText('Documents').first()).toBeVisible({ timeout: 30_000 })
  })

  test.afterAll(async () => {
    // Closing Electron and deleting a 200-spec workspace together exceed the default 30s
    // hook budget on a cold filesystem — which failed the whole suite while every assertion
    // in it had passed. Each step is also guarded, so one slow step cannot strand the rest.
    test.setTimeout(120_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0011-board.png' }).catch(() => {})
    await app?.close().catch(() => {})
    try {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
    } catch {
      // A leftover temp directory is untidy, not a failure worth reddening a green run.
    }
  })

  test('opens on what needs the signed-in person', async () => {
    await page.getByRole('button', { name: 'Build', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Needs me' })).toBeVisible({ timeout: 60_000 })
    // It is the SELECTED view on arrival, not merely one of the options.
    await expect(page.getByRole('button', { name: 'Needs me' })).toHaveClass(/bg-brand-600/)
  })

  test(`shows all ${SPEC_COUNT} specs, and says so`, async () => {
    await page.getByRole('button', { name: 'Everything' }).click()
    await expect(page.getByText(`${SPEC_COUNT} specs`)).toBeVisible()
  })

  test('each team card shows its work in flight', async () => {
    for (const team of TEAMS) {
      await expect(page.getByText(team, { exact: true }).first()).toBeVisible()
    }
  })

  test('switching a role view does not re-read the repository', async () => {
    // The spec's own requirement, and the reason the board fetches once and filters in
    // memory. Measured as time, because that is the observable consequence: a view that
    // re-read would take as long as the first load did, every time.
    const started = Date.now()
    for (const view of ['I own', "I'm building", 'I check', 'Everything', 'Needs me']) {
      await page.getByRole('button', { name: view }).click()
      await expect(page.getByRole('button', { name: view })).toHaveClass(/bg-brand-600/)
    }
    const elapsed = Date.now() - started
    expect(elapsed, `five role switches took ${elapsed}ms — that looks like re-reading`).toBeLessThan(2000)
  })

  test(`a board of ${SPEC_COUNT} specs across ${TEAMS.length} teams opens in under two seconds`, async () => {
    // The acceptance check the reviewer is told to confirm was measured rather than assumed.
    // Timed from clicking Refresh to the board reporting its count, so it covers the fetch
    // AND the render — the half that was previously an untested assumption.
    await page.getByRole('button', { name: 'Everything' }).click()
    const started = Date.now()
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByText(`${SPEC_COUNT} specs`)).toBeVisible({ timeout: 10_000 })
    const elapsed = Date.now() - started
    console.log(`[measured] ${SPEC_COUNT} specs, ${TEAMS.length} teams: ${elapsed}ms`)
    expect(elapsed).toBeLessThan(2000)
  })

  test('search and filters narrow the list', async () => {
    await page.getByPlaceholder('Search').fill('synthetic board row 42')
    await expect(page.getByText('1 shown')).toBeVisible()
    await page.getByPlaceholder('Search').fill('')
  })

  test('the status view offers no control that changes anything', async () => {
    await page.getByRole('button', { name: 'Everything' }).click()
    // A merged spec — nothing about it should be actionable at all. Narrowed to exactly one
    // row first, then clicked by position: a row's accessible name includes its people, team
    // and risk as well as its title, so matching on the title alone never anchors cleanly.
    await page.getByPlaceholder('Search').fill('synthetic board row 43')
    await expect(page.getByText('1 shown')).toBeVisible()
    await page.locator('li button').first().click()
    await expect(page.getByText(/Owns it/)).toBeVisible({ timeout: 30_000 })

    // Absence, not disabled — the same standard spec 0010's edit mode is held to.
    await expect(page.getByRole('button', { name: /^Hand off$/ })).toHaveCount(0)
    await expect(page.locator('textarea')).toHaveCount(0)
    await expect(page.locator('input')).toHaveCount(0)
  })


  /** The settings screen (spec 0012), in the real window.
   *
   * Its two load-bearing promises are both about honesty rather than function, so neither can
   * be proven by a function test: every section must name the FILE its setting lives in, and a
   * setting nobody has configured must read as "not set up" rather than as an error. The
   * project this suite builds has configured none of them, which makes it the right fixture for
   * the second one.
   */
  test.describe('[spec 0012] the settings screen', () => {
    test('every section names the file its setting is stored in', async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 60_000 })

      // Named, even when the file does not exist yet — that is the point: a person has to know
      // where to go to create it.
      await expect(page.getByText('.sdlc/team.yaml')).toBeVisible()
      await expect(page.getByText('.sdlc/approval-settings.yaml')).toBeVisible()
      await expect(page.getByText(/cadence-plan\.md/)).toBeVisible()
    })

    test('an unconfigured setting reads as not set up, never as an error', async () => {
      // "You have not set this up" and "you set it up wrong" send a person to two different
      // places. This fixture has configured nothing, so every section should say the former.
      await expect(page.getByText(/has not set this up/).first()).toBeVisible()
      await expect(page.getByText(/could not be read cleanly/)).toHaveCount(0)
    })

    test('each fixed rule says where it is actually enforced', async () => {
      // A rule listed without that is a claim nobody can check — and spec 0012's own
      // acceptance check was amended because one of them was not enforced anywhere.
      await expect(page.getByText(/Nobody checks their own work/)).toBeVisible()
      await expect(page.getByText(/handoff\.py refuses a developer who is also/)).toBeVisible()
      await expect(page.getByText(/Lowering a risk tier is recorded against whoever decided it/)).toBeVisible()
      // The claim that was removed must not reappear.
      await expect(page.getByText(/only a team lead/i)).toHaveCount(0)
    })
  })
})
