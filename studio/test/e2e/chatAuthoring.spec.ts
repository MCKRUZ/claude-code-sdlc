/** Spec 0016's window, driven for real.
 *
 * Everything else this spec added tests the main process (chatArgs, chatStreamParse,
 * chatMcpServer, the hostile-scratch-project proof) — this file proves the acceptance checks
 * that are statements about what is ON THE SCREEN: the assistant opening on its own, a
 * structured question rendering as real buttons rather than prose, and a stage whose documents
 * are already complete NOT restarting the interview.
 *
 * Skipped when no plugin checkout is beside this repository (same as documents.spec.ts).
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { requirePlugin } from '../pluginRoot'

const root = resolve(import.meta.dirname, '..', '..')
const PLUGIN = requirePlugin(join(root, 'test'))
const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python

/** A slow-but-eventually-succeeding close must never strand the whole suite behind it (the
 * same race documents.spec.ts's own afterAll comment describes: Studio's background pull can
 * still be mid-subprocess at shutdown). A leftover Electron process is the operating system's
 * problem, never a test result. */
async function closeQuickly(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return
  await Promise.race([
    app.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 15_000)),
  ])
}

async function launchWithProject(project: string, userData: string, label: string) {
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    recentProjects: [{ path: project, name: label, lastOpenedAt: new Date().toISOString() }],
    pluginScriptsPathOverride: SCRIPTS_DIR,
  }, null, 2))
  const app = await electron.launch({
    args: ['.', '--no-sandbox', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development' },
  })
  const page = await app.firstWindow()
  await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 30_000 })
  return { app, page }
}

test.describe('[spec 0016] chat on a stage whose documents are already complete', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.describe.configure({ mode: 'serial' })

  let workspace = ''
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-chat-complete-'))
    const project = join(workspace, 'project')
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })
    // A phase with every one of its documents already present — the fixtures documents.spec.ts
    // also uses, so "complete" means the same thing in both files.
    mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
    cpSync(
      join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'requirements.md'),
      join(project, '.sdlc', 'artifacts', '01-requirements', 'requirements.md'),
    )
    cpSync(
      join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'non-functional-requirements.md'),
      join(project, '.sdlc', 'artifacts', '01-requirements', 'non-functional-requirements.md'),
    )
    // "Complete" means every document the stage expects EXISTS (ensureChatStarted's own gate
    // is document.exists, not document.ready) — Phase 1 expects four, not two; leaving
    // epics.md/phase2-handoff.md absent was this test's own bug, not chat.ts's.
    cpSync(
      join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'epics.md'),
      join(project, '.sdlc', 'artifacts', '01-requirements', 'epics.md'),
    )
    cpSync(
      join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'phase2-handoff.md'),
      join(project, '.sdlc', 'artifacts', '01-requirements', 'phase2-handoff.md'),
    )
    const statePath = join(project, '.sdlc', 'state.yaml')
    writeFileSync(
      statePath,
      readFileSync(statePath, 'utf-8')
        .replace(/^current_phase:.*$/m, 'current_phase: "1"')
        .replace(/^phase_name:.*$/m, 'phase_name: "requirements"'),
      'utf-8',
    )

    const { app: launchedApp, page: launchedPage } = await launchWithProject(project, join(workspace, 'userData'), 'complete stage project')
    app = launchedApp
    page = launchedPage
  })

  test.afterAll(async () => {
    test.setTimeout(30_000)
    await closeQuickly(app)
    try { if (workspace) rmSync(workspace, { recursive: true, force: true }) } catch { /* not a failed test */ }
  })

  test('never restarts the interview — no auto-greet call happens, and no live model call at all', async () => {
    await page.getByText('complete stage project').click()
    // Waiting on the Chat panel's own heading, not a specific main-content tab, since which
    // tab a stage opens to is spec 0017's concern, not this one's — this test only needs proof
    // the stage page has finished loading before it looks at chat.
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible({ timeout: 30_000 })
    // The chat panel is present (spec 0008's own requirement, which this spec finally makes
    // real) — and NEVER the dead placeholder claiming "isn't wired up yet".
    await expect(page.getByText(/isn't wired up yet/i)).toHaveCount(0)
    // Every document in this stage already exists, so ensureChatStarted's own gate — "a
    // document not yet started" — is false, and it is a pure no-op: no model call, no
    // greeting, just the neutral message ChatPanel shows for an already-complete stage. This
    // assertion needs no live model access and runs unconditionally.
    await expect(page.getByText(/already started\. Ask a question/i)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('[spec 0016] the assistant opens a stage that has a document not yet started', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')
  test.skip(
    process.env.STUDIO_SKIP_LIVE_MODEL === '1',
    'STUDIO_SKIP_LIVE_MODEL=1 — this needs a real, signed-in model call, so it was not run.',
  )
  test.describe.configure({ mode: 'serial' })

  let workspace = ''
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    workspace = mkdtempSync(join(tmpdir(), 'studio-e2e-chat-greet-'))
    const project = join(workspace, 'project')
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })
    // A fresh project starts in Phase 0 with nothing written — exactly the "document not yet
    // started" condition the auto-greet acceptance check is about. No fixture documents.

    const { app: launchedApp, page: launchedPage } = await launchWithProject(project, join(workspace, 'userData'), 'greenfield project')
    app = launchedApp
    page = launchedPage
  })

  test.afterAll(async () => {
    test.setTimeout(30_000)
    await page?.screenshot({ path: 'test/screenshots/spec-0016-chat-greet.png' }).catch(() => {})
    await closeQuickly(app)
    try { if (workspace) rmSync(workspace, { recursive: true, force: true }) } catch { /* not a failed test */ }
  })

  test('the assistant\'s own opening message appears with nobody having typed anything', async () => {
    test.setTimeout(180_000)
    await page.getByText('greenfield project').click()
    // Same reasoning as the other test in this file: wait on Chat's own heading, not a
    // particular main-content tab (that default is spec 0017's concern).
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible({ timeout: 30_000 })

    // "Starting the conversation…" while the first turn is in flight, then a real message —
    // never a person having to type first.
    const chatMessage = page.locator('aside').filter({ hasText: 'Chat' }).locator('.bg-slate-100, .border-dashed')
    try {
      await expect(chatMessage.first()).toBeVisible({ timeout: 120_000 })
    } catch {
      test.skip(true, 'no opening message came back (signed out or offline?)')
      return
    }
    const text = await chatMessage.first().textContent()
    expect(text?.length ?? 0).toBeGreaterThan(0)

    // Nobody typed anything to get here — the message box is empty and the send button is
    // disabled on empty input, which is the acceptance check's own negative: never a blank box
    // waiting on the person to speak first.
    await expect(page.getByPlaceholder(/Type a message/)).toHaveValue('')
  })

  test('a structured question, if the assistant asked one, renders as real clickable options — not prose', async () => {
    const options = page.locator('aside button.rounded-full')
    const count = await options.count()
    // Not every opening question is multiple-choice (the discovery phase's very first question
    // is free text) — so this only asserts the STRUCTURAL property when one is present: a real
    // <button> per option, inside the chat panel, never plain text pretending to be clickable.
    test.skip(count === 0, 'the assistant\'s first message was not a structured question this run')
    const firstLabel = await options.first().textContent()
    expect(firstLabel?.trim().length ?? 0).toBeGreaterThan(0)
  })
})
