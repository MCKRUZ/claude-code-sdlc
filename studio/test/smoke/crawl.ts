/** Clicking what is safe to click, and saying plainly what was left alone.
 *
 * A smoke run that clicked "Sign off" or "Lock these ids" would change the project it is looking
 * at, and one that clicked "Summarise" would start a paid model run. So controls are split by what
 * they DO. Anything whose label says it changes or sends something is listed in the report as not
 * clicked (the other specs in test/e2e/ exercise those, each with its own fixture). Everything
 * else is clicked, the screen is measured again, and the screen is re-opened so one click's
 * result never leaks into the next.
 */

import type { ElectronApplication, Page } from '@playwright/test'
import type { SmokeRun } from './evidence'

/** Labels that mean "this changes something, or sends something, or starts a model". */
export const CHANGES_SOMETHING = new RegExp(
  [
    'sign.?off', 'advance', 'lock', 'keep', 'discard', 'build the brief', 'hand.?off', 'create', 'start',
    'save', 'restore', 'roll.?back', 'delete', 'remove', 'apply', 'summaris', 'analys', 'draft', 'gather',
    'replace', 'registry', 'skip', 'send', 'accept', 'reject', 'install', 'generate', 'enhance', 'confirm',
    'add ', 'record', 'bind', 'open folder', 'new project', 'choose', 'submit', 'defer', 'mark', 'export',
    // These start or feed a model run (the smoke run also switches the live model off, as a second guard).
    'talk it through', 'run the review', 'ask ',
    'catalogue', 'write', 'set up', 'resolve', 'combine', 'pull', 'sync now', 'stop', 'cancel (the )?(run|job|batch)',
  ].join('|'),
  'i',
)

// A progress line: a verb, what it is working on, then an ellipsis ("Reading the specs…"). Ordinary
// prose containing the same verb is not a loading screen.
const SETTLING = /\b(Checking|Reading|Loading|Gathering|Working)\b[^\n]{0,60}…/

/** Waits for the screen to stop saying it is loading, then a beat for a late render. */
export async function settle(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      opening: document.querySelector('[data-testid="opening-overlay"]') !== null,
    })).catch(() => ({ text: '', opening: false }))
    if (!SETTLING.test(state.text) && !state.opening) break
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(250)
}

/** Resize the real window (Playwright cannot resize an Electron page itself), and report the size it got. */
export async function resize(app: ElectronApplication, page: Page, width: number, height: number): Promise<string> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(1, 1)
    win.setContentSize(size.width, size.height)
  }, { width, height })
  await page.waitForTimeout(300)
  const actual = await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`)
  return actual
}

/** The labels of the buttons and tabs in the main panel (not the sidebar, which the walk covers). */
async function mainControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return []
    const label = (el: Element) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()
    return Array.from(main.querySelectorAll('button, [role=tab]'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled
      })
      .map(label)
      .filter((l) => l.length > 0)
  })
}

export async function crawlControls(
  page: Page,
  run: SmokeRun,
  screen: string,
  size: string,
  reopen: () => Promise<void>,
  limit = 14,
): Promise<void> {
  const seen = new Set<string>()
  const names = (await mainControls(page)).filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
  let clicked = 0
  for (const name of names) {
    if (CHANGES_SOMETHING.test(name)) {
      run.click(screen, name, 'skipped')
      continue
    }
    if (clicked >= limit) break
    const asButton = page.locator('main').getByRole('button', { name, exact: true }).first()
    const asTab = page.locator('main').getByRole('tab', { name, exact: true }).first()
    const control = (await asTab.count()) > 0 ? asTab : asButton
    if ((await control.count()) === 0) continue
    clicked++
    run.at(`${screen} › clicked "${name}"`)
    try {
      await control.click({ timeout: 5_000 })
    } catch (err) {
      run.click(screen, name, 'skipped', `could not click: ${err instanceof Error ? err.message.split('\n')[0] : err}`)
      continue
    }
    await settle(page)
    run.click(screen, name, 'clicked')
    await run.look(page, `${screen} › after "${name}"`, size)
    await reopen()
  }
}

/** A long unbroken string in each ordinary text box, to see whether the layout holds. Nothing is submitted. */
export async function pushLongText(page: Page, run: SmokeRun, screen: string, size: string): Promise<void> {
  const boxes = page.locator('main input[type=text], main input:not([type]), main textarea')
  const count = Math.min(await boxes.count(), 6)
  if (count === 0) return
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i)
    if (!(await box.isVisible()) || !(await box.isEditable())) continue
    await box.fill('X'.repeat(300)).catch(() => {})
  }
  await run.look(page, `${screen} › long text in every box`, size)
}
