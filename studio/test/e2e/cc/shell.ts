/** The new shell, as the plan names it (togo-command-center.md §1, §3) — one place for the
 * selectors the command-center specs lean on, so a renamed test id is one edit, not seven.
 *
 * Written BEFORE P4–P6 landed, against the plan's test-id and text contracts. Every selector
 * the plan does not name explicitly is listed under `ASSUMED` with the plan section it was read
 * from; the P7 report names them so the owning package can match or correct them. P8 reconciled
 * them against the screens as built (2026-10-06): every `ASSUMED` id below now exists in the
 * renderer, so the list is a record of where each came from, not a guess.
 *
 * The signed-in person is whatever the main process resolves (`actor.ts`): a code-host login on
 * a signed-in machine, nobody on a bare runner. The tests never assume which — `ensureActor`
 * reads the connection through the bridge and, only when nobody is identified, signs in as a
 * typed name through the Settings form exactly as a person would. */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { root, SCRIPTS_DIR } from './fixture'

/** The name typed when the host cannot say who is signed in (a named human; never AI-looking). */
export const TYPED_NAME = 'Priya N.'

/** Plan-named selectors (§1, §3.1, §3.3, §3.6, §8). */
export const SEL = {
  sprintHome: '[data-testid="sprint-home"]',
  sprintHeader: '[data-testid="sprint-header"]',
  sprintBoard: '[data-testid="sprint-board"]',
  sprintSlate: '[data-testid="sprint-slate"]',
  laneScope: '[data-shortcut-scope="lanes"]',
  writeControl: 'button[data-write]',
  projectNav: 'nav[aria-label="Project"]',
  viewingStation: 'nav[aria-label="Project"] [data-viewing]',
  litCard: '[data-lit]',
  personChip: '[data-person]',
  stat: '[data-stat]',
  palette: '[data-testid="command-palette"]',
  paletteInput: '[data-testid="command-palette"] input[role="combobox"]',
  paletteOption: '[data-testid="command-palette"] [role="option"]',
} as const

/** Selectors the plan implies but does not spell; each names the section it was read from. */
export const ASSUMED = {
  /** §3.1 four lanes: one card per board row, carrying its spec id. */
  laneCard: '[data-testid="lane-card"]',
  /** §3.1 the baton on the Building→Checking edge. */
  baton: '[data-testid="baton"]',
  /** §1 TopBand needs-you chip ("needs you · N"). */
  needsYouChip: '[data-testid="needs-you-chip"]',
  /** §1 the omnibar trigger: a <button> styled as a field, never an <input> at rest. */
  omnibarTrigger: '[data-testid="omnibar-trigger"]',
  /** §3.6 VerbDialog and its result pane (stdout/stderr verbatim under the exit heading). */
  verbDialog: '[data-testid="verb-dialog"]',
  verbResult: '[data-testid="verb-result"]',
  /** §3.3 the spec card opened in place, carrying the spec id. */
  specCard: '[data-testid="spec-card"]',
  /** §3.1 Refining column; its rows carry `data-spec`. */
  refining: '[data-testid="refining"]',
  /** §3.1 Today column. */
  today: '[data-testid="today"]',
  /** §3.4 the lifecycle home root. */
  lifecycleHome: '[data-testid="lifecycle-home"]',
  /** §3.2 planning columns. */
  backlogColumn: '[data-testid="planning-backlog"]',
  slateColumn: '[data-testid="planning-slate"]',
  pluginSays: '[data-testid="planning-plugin-says"]',
  /** §3.2 Commit the sprint: one step row per verb, each showing its exit. */
  commitStep: '[data-testid="commit-step"]',
  /** §3.5 the close screen and its per-spec decision rows. */
  closeScreen: '[data-testid="sprint-close"]',
  closeRow: '[data-testid="close-row"]',
  /** §3.5 steering mode root. */
  steering: '[data-testid="steering-mode"]',
  /** §6 the one-time "What moved where" overlay built on OpeningOverlay. */
  movedWhere: '[data-testid="moved-where"]',
} as const

export const TEXT = {
  refused: 'Refused by the plugin',
  done: 'Done',
  notDone: 'Not done',
  omnibarHint: /(⌘|Ctrl)K · a spec id, a verb, or a place/, // the keycap follows the platform: ⌘ on macOS, Ctrl on the Linux and Windows runners
  refineInPlace: 'refine in place →',
  noDecisionLog: 'no data — no decision-log',
  backToBoard: '← Back to the board',
  tierRule: 'Raising a tier adds rungs for free; lowering is recorded against whoever decided',
  oneSpec: 'one spec · one branch · one PR',
} as const

export function seedSettings(userData: string, projectPath: string, label: string): void {
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    recentProjects: [{ path: projectPath, name: label, lastOpenedAt: new Date().toISOString() }],
    pluginScriptsPathOverride: SCRIPTS_DIR,
  }, null, 2))
}

export interface Launched { app: ElectronApplication; page: Page }

/** The same launch every e2e spec uses. `env` adds the test hook a describe needs (sprintHome's
 * refused verdict sets `STUDIO_TEST_FORCE_BY`, read by `actor.ts` outside production only). */
export async function launch(userData: string, env: Record<string, string> = {}): Promise<Launched> {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', ...env },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
  return { app, page }
}

/** Open the seeded project and wait for the shell. The strip is the first <aside>, holding
 * `nav[aria-label=Project]` (§1) — the one landing fact that holds on both homes. */
export async function openProject(page: Page, label: string): Promise<void> {
  await page.getByText(label).click()
  await expect(page.locator(SEL.projectNav)).toBeVisible({ timeout: 60_000 })
  await dismissMovedWhere(page)
}

/** §6: the one-time overlay, dismissed if it showed — a first open on a fresh userData shows it. */
export async function dismissMovedWhere(page: Page): Promise<void> {
  const overlay = page.locator(ASSUMED.movedWhere)
  if ((await overlay.count()) === 0) return
  const close = overlay.getByRole('button').first()
  if (await close.count()) await close.click()
  await expect(overlay).toHaveCount(0, { timeout: 10_000 })
}

/** Build Loop's own views sit under its station (§1): the stage, then the view. Unchanged shape
 * from sprint.spec / board.spec / constellation.spec; the station's name starts "Build Loop". */
export async function openBuildView(page: Page, view: string): Promise<void> {
  await page.getByRole('button', { name: /^Build Loop/ }).click()
  await page.getByRole('button', { name: view, exact: true }).click()
}

export async function sprintHomeVisible(page: Page): Promise<void> {
  await expect(page.locator(SEL.sprintHome)).toBeVisible({ timeout: 60_000 })
}

/** The identity the main process resolved, read through the bridge the renderer itself uses. */
export async function connectionAccount(page: Page, projectPath: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    const info = await window.studio.getConnectionInfo(p)
    return info.account ?? null
  }, projectPath)
}

/** The signed-in person, or — when the host cannot say — a typed name, signed in through the
 * Settings form exactly as a person would (⌘, → "Sign in as a typed name" → "Use this name").
 * Returns the name every `--by` / owner match in the fixture must use. */
export async function ensureActor(page: Page, projectPath: string): Promise<string> {
  const account = await connectionAccount(page, projectPath)
  if (account) return account
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
  const form = page.getByRole('form', { name: 'Sign in as a typed name' })
  await expect(form).toBeVisible({ timeout: 30_000 })
  await form.getByLabel('Your name').fill(TYPED_NAME)
  await form.getByRole('button', { name: 'Use this name' }).click()
  await expect(form).toHaveCount(0, { timeout: 30_000 })
  const typed = await connectionAccount(page, projectPath)
  if (typed !== TYPED_NAME) throw new Error(`typed name did not become the actor (got ${String(typed)})`)
  // Settings is a screen, not a dialog: `g s` returns to the sprint home (every caller is a
  // Build-loop fixture) so the test resumes where the project opened.
  await sequence(page, 'g', 's')
  await expect(page.locator(SEL.sprintHome)).toBeVisible({ timeout: 60_000 })
  return TYPED_NAME
}

export async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
  await expect(page.locator(SEL.paletteInput)).toBeVisible({ timeout: 10_000 })
}

/** "Refresh this screen" — the palette's P-class re-read (paletteActions.ts). After a fixture
 * write made outside the window, this is how the screen learns of it without a timer. */
export async function refreshScreen(page: Page): Promise<void> {
  await openPalette(page)
  await page.locator(SEL.paletteInput).fill('Refresh this screen')
  await page.locator(SEL.paletteOption).filter({ hasText: 'Refresh this screen' }).first().click()
  await expect(page.locator(SEL.palette)).toHaveCount(0, { timeout: 10_000 })
}

/** Two-key sequences (`g s`, `g l`, `g p`, `g t`) with the gap the listener allows. */
export async function sequence(page: Page, first: string, second: string): Promise<void> {
  await page.locator('main#main').focus().catch(() => {})
  await page.keyboard.press(first)
  await page.keyboard.press(second)
}

export async function closeApp(app: ElectronApplication | undefined, page: Page | undefined, shot: string): Promise<void> {
  await page?.screenshot({ path: `test/screenshots/${shot}.png`, timeout: 15_000 }).catch(() => {})
  // A close that does not return in 20 s is not waited on twice: the process is killed, or
  // Playwright's worker teardown waits on the same app and times out after every test passed
  // (the ubuntu job, twice).
  const closed = await Promise.race([app?.close().then(() => true).catch(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))])
  if (!closed) { try { app?.process().kill('SIGKILL') } catch { /* already gone */ } }
}
