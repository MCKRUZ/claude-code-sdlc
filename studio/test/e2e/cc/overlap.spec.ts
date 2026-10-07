/** Landmark geometry in the real window (Q5 — cockpit QA; the owner's v12 critique, items 1, 6, 7).
 *
 * At 1280×800 and 1440×900, light and dark, on four screens — sprint home, planning, the spec
 * card, the lifecycle home — the shell's landmarks (band, strip, <main>, both <aside>s, the lane
 * board and each lane, Today, the sprint header, any dialog) must each sit INSIDE the viewport
 * with <main> at rest, no two may intersect unintentionally (containment is fine; lanes never
 * touch each other or Today; the chat aside never overlaps <main>; a dialog may overlay), and the
 * ROOT must never scroll — only <main> does. `measureLandmarks` is the in-page probe; its twin
 * lives in test/screenshots/capture-observatory-v2.mjs (SHOT_OVERLAP=1) — an .mjs cannot import
 * a .ts, so the two bodies are kept in step by hand.
 *
 * Fixture: the sprint home's (three slated cards, a hand-off, an overdue decision) plus one
 * UNslated draft so Refining has a "refine in place →" to open the spec card from. */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { enterBuildLoop, HANDOFF_TO, handoffTo, newProject, newSprint, openOverdueDecision, PLUGIN_ROOT, py, script, setFrontmatter, slate, VENV_PYTHON, verdict, writeRoster, type Fixture } from './fixture'
import { ASSUMED, closeApp, ensureActor, launch, openBuildView, openProject, refreshScreen, SEL, seedSettings, sprintHomeVisible, TEXT } from './shell'

const SIZES = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }] as const
const THEMES = ['Light', 'Dark'] as const
const SCREENS = ['sprint-home', 'planning', 'spec-card', 'lifecycle-home'] as const

interface Box { name: string; kind: string; el: Element; left: number; top: number; right: number; bottom: number }
export interface OverlapReport { viewport: string; theme: string; mainScrollTop: number; landmarks: string[]; violations: string[] }

/** Runs INSIDE the page (serialised by Playwright): no closure over anything in this module. */
export function measureLandmarks(): OverlapReport {
  const vw = window.innerWidth, vh = window.innerHeight, EPS = 1
  const boxes: Box[] = []
  const add = (kind: string, el: Element, name = kind) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') return // hidden / collapsed: not on screen
    if (boxes.some((b) => b.el === el)) return // one element, one box: `today-rail` and `today` may resolve to the same section
    boxes.push({ name, kind, el, left: r.left, top: r.top, right: r.right, bottom: r.bottom })
  }
  const one = (kind: string, sel: string) => { const el = document.querySelector(sel); if (el) add(kind, el) }
  const all = (kind: string, sel: string, name: (el: Element, i: number) => string) => document.querySelectorAll(sel).forEach((el, i) => add(kind, el, name(el, i)))
  one('top-band', '[data-testid="top-band"]')
  one('lifecycle-strip', '[data-testid="lifecycle-strip"]')
  one('shell-band', '[data-testid="shell-band"]')
  one('main', 'main#main')
  all('aside', 'aside', (el, i) => `aside[${i}]${el.getAttribute('data-testid') ? ` ${el.getAttribute('data-testid')}` : ''}`)
  one('lane-board', '[data-testid="lane-board"]')
  all('lane', '[data-testid^="lane-"][data-lane]:not([data-testid="lane-card"])', (el) => el.getAttribute('data-testid') ?? 'lane')
  one('today-rail', '[data-today-rail]')
  one('today', '[data-testid="today"]')
  one('sprint-header', '[data-testid="sprint-header"]')
  all('dialog', '[role="dialog"]', (_el, i) => `dialog[${i}]`)

  const fmt = (b: Box) => `${b.name} [${Math.round(b.left)},${Math.round(b.top)} → ${Math.round(b.right)},${Math.round(b.bottom)}]`
  const violations: string[] = []
  const main = document.getElementById('main')
  const mainScrollTop = main?.scrollTop ?? 0
  // A landmark inside a <main> that was scrolled on purpose is exempt from the viewport rule
  // (the walk scrolls to the slate and to "Declaring Build finished"); at rest, nothing is.
  for (const b of boxes) {
    const inScrolledMain = mainScrollTop > 0 && b.kind !== 'main' && b.kind !== 'aside' && b.kind !== 'shell-band' && b.kind !== 'top-band' && b.kind !== 'lifecycle-strip'
    if (inScrolledMain) continue
    if (b.left < -EPS || b.top < -EPS || b.right > vw + EPS || b.bottom > vh + EPS) violations.push(`outside the ${vw}×${vh} viewport: ${fmt(b)}`)
  }
  const contains = (a: Box, b: Box) => a.left <= b.left + EPS && a.top <= b.top + EPS && a.right >= b.right - EPS && a.bottom >= b.bottom - EPS
  const depth = (a: Box, b: Box) => Math.min(Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  /** Pairs where even containment is an intersection: lanes vs lanes / Today, the chat vs <main>. */
  const STRICT = new Set(['lane|lane', 'lane|today', 'lane|today-rail', 'aside|main'])
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i], b = boxes[j]
      if (a.kind === 'dialog' || b.kind === 'dialog') continue
      const d = depth(a, b)
      if (d <= EPS) continue
      const key = [a.kind, b.kind].sort().join('|')
      if (STRICT.has(key)) { violations.push(`intersect ${Math.round(d)} px: ${fmt(a)} ∩ ${fmt(b)}`); continue }
      // A DOM descendant spilling past its ancestor's box is overflow, already reported by the viewport rule above.
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      if (!contains(a, b) && !contains(b, a)) violations.push(`partial overlap ${Math.round(d)} px: ${fmt(a)} ∩ ${fmt(b)}`)
    }
  }
  const root = document.scrollingElement ?? document.documentElement
  if (root.scrollTop !== 0 || root.scrollLeft !== 0) violations.push(`the root is scrolled (top ${root.scrollTop}, left ${root.scrollLeft}) — only <main> may scroll`)
  if (root.scrollHeight > vh + EPS || root.scrollWidth > vw + EPS) {
    // Name what grows the document: elements reaching past the viewport with NO clipping or
    // scrolling ancestor below <html> (an ancestor that clips would have absorbed the overflow).
    // Only a SCROLLING ancestor absorbs overflow for this purpose: `overflow: hidden` on <body> or
    // #root does not stop an absolutely positioned portal child (containing block = the viewport)
    // from growing the document, and a zero-height box can still sit past the edge.
    const clips = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflow)
    const culprits: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.bottom <= vh + EPS && r.right <= vw + EPS) continue
      let p = el.parentElement, clipped = false
      while (p && p !== document.documentElement) { if (clips(p)) { clipped = true; break } p = p.parentElement }
      if (clipped) continue
      const pos = getComputedStyle(el).position
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join(' ')
      culprits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}${cls ? ` .${cls}` : ''} ${pos} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}] in ${el.parentElement?.tagName.toLowerCase()}${el.parentElement?.id ? `#${el.parentElement.id}` : ''}`)
      if (culprits.length >= 4) break
    }
    violations.push(`the root overflows its ${vw}×${vh} viewport (${root.scrollWidth}×${root.scrollHeight}) — the shell must never scroll${culprits.length ? `; unclipped past the edge: ${culprits.join(' · ')}` : ''}`)
  }
  const theme = document.documentElement.getAttribute('data-theme') ?? 'light'
  return { viewport: `${vw}x${vh}`, theme, mainScrollTop, landmarks: boxes.map(fmt), violations } // `el` never crosses the bridge
}

/** The cockpit's own rules (v13 fixer round; owner's v12 item 1), measured in the page. RAIL branch
 * (home ≥ 1240 px): the four wells and the Today rail end on ONE line, 24 px above the fold, and
 * the band below (Refining · How it is going) starts under the fold — nothing in it has its top
 * inside [fold − 24, fold], the slice the v13 shots showed. STRIP branch: every well ends on
 * screen. Runs INSIDE the page: no closure over this module. */
export function cockpitRules(): { facts: string[]; violations: string[] } {
  const vh = window.innerHeight, EPS = 1.5, PAD = 24
  const facts: string[] = [], violations: string[] = []
  const home = document.querySelector('[data-testid="sprint-home"]')
  const grid = document.querySelector('[data-home-grid]')
  const today = document.querySelector('[data-testid="today"]')
  const lanes = Array.from(document.querySelectorAll('[data-testid^="lane-"][data-lane]:not([data-testid="lane-card"])'))
  if (!home || !grid || !today || lanes.length !== 4) { violations.push(`cockpit not found (home ${Boolean(home)}, grid ${Boolean(grid)}, today ${Boolean(today)}, lanes ${lanes.length})`); return { facts, violations } }
  const rail = home.clientWidth >= 1240
  const bottoms = lanes.map((l) => l.getBoundingClientRect().bottom)
  const todayBottom = today.getBoundingClientRect().bottom
  facts.push(`home ${home.clientWidth} px → ${rail ? 'rail' : 'strip'}`, `lane bottoms ${bottoms.map((b) => Math.round(b)).join('/')}`, `today bottom ${Math.round(todayBottom)}`, `fold ${vh}`)
  for (const b of bottoms) if (b > vh + EPS) violations.push(`a well ends under the fold (${Math.round(b)} > ${vh})`)
  if (rail) {
    const spread = Math.max(...bottoms) - Math.min(...bottoms)
    if (spread > EPS) violations.push(`the wells end on different lines (spread ${Math.round(spread)} px)`)
    if (Math.abs(todayBottom - bottoms[0]) > EPS) violations.push(`the rail ends at ${Math.round(todayBottom)}, the wells at ${Math.round(bottoms[0])}`)
    if (Math.abs(bottoms[0] - (vh - PAD)) > EPS) violations.push(`the cockpit ends at ${Math.round(bottoms[0])}, not ${vh - PAD} (fold − main padding)`)
    const below = document.querySelector('[data-home-below]')
    if (!below) violations.push('no band below the cockpit')
    else {
      const top = below.getBoundingClientRect().top
      facts.push(`band top ${Math.round(top)}`)
      if (top < vh - EPS) violations.push(`the band below the cockpit starts above the fold (${Math.round(top)} < ${vh})`)
      for (const el of Array.from(below.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect()
        if (r.height > 0 && r.top >= vh - PAD - EPS && r.top < vh - EPS) { violations.push(`an element of the band has its top in [fold − 24, fold]: ${el.tagName.toLowerCase()} at ${Math.round(r.top)}`); break }
      }
    }
  }
  return { facts, violations }
}

/** The findings ledger's empty-state caption (v13 fixer round): its inline `<code>` chips must not
 * paint over the caption's own text on another line — no chip box intersects a text box (the
 * text is measured by `Range`, line by line), and no two chips intersect. */
export function captionRules(): { facts: string[]; violations: string[] } {
  const facts: string[] = [], violations: string[] = []
  const p = document.querySelector('[data-testid="findings-caption"]')
  if (!p) { facts.push('no empty-ledger caption on this card'); return { facts, violations } }
  const EPS = 0.5
  const rects: { what: string; r: DOMRect }[] = []
  for (const code of Array.from(p.querySelectorAll('code'))) rects.push({ what: `chip "${code.textContent}"`, r: code.getBoundingClientRect() })
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest('code') || !(n.textContent ?? '').trim()) continue
    const range = document.createRange(); range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects())) if (r.width > 0 && r.height > 0) rects.push({ what: `text "${(n.textContent ?? '').trim().slice(0, 18)}"`, r })
  }
  facts.push(`${rects.length} boxes in the caption`)
  const depth = (a: DOMRect, b: DOMRect) => Math.min(Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    if (!rects[i].what.startsWith('chip') && !rects[j].what.startsWith('chip')) continue
    const d = depth(rects[i].r, rects[j].r)
    if (d > EPS) violations.push(`${rects[i].what} ∩ ${rects[j].what} by ${Math.round(d)} px`)
  }
  return { facts, violations }
}

function overlapFixture(): Fixture {
  const fx = newProject('cc-overlap')
  enterBuildLoop(fx.project)
  writeRoster(fx.project)
  py([script('new_spec.py'), '--repo', fx.project, '--name', 'fraud score feed', '--risk', 'HIGH', '--owner', '@priya-n', '--team', 'claims'])
  const files = readdirSync(join(fx.project, 'specs')).filter((f) => /^\d{4}-/.test(f)).sort()
  fx.specIds = files.map((f) => f.slice(0, 4))
  fx.specPath = Object.fromEntries(files.map((f) => [f.slice(0, 4), join(fx.project, 'specs', f)]))
  const [a, b, c] = fx.specIds
  newSprint(fx.project)
  slate(fx.project, [a, b, c])
  setFrontmatter(fx.specPath[a], 'status', 'in-flight')
  setFrontmatter(fx.specPath[b], 'status', 'in-flight')
  setFrontmatter(fx.specPath[c], 'status', 'merged')
  verdict(fx.project, a, 'eng', 'accepted')
  verdict(fx.project, a, 'data', 'accepted')
  handoffTo(fx.project, b, HANDOFF_TO)
  return fx
}

/** The band's Appearance disclosure holds the kit's Theme group — the same control the capture script uses. */
async function setTheme(page: Page, label: (typeof THEMES)[number]): Promise<void> {
  const band = page.locator('aside').first()
  await band.getByRole('button', { name: 'Appearance' }).click()
  await band.getByRole('group', { name: 'Theme' }).getByRole('button', { name: label }).click()
  await band.getByRole('button', { name: 'Appearance' }).click()
  await page.mouse.move(720, 450)
  await page.waitForTimeout(400)
}

async function mainToTop(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('main')?.scrollTo({ top: 0 }))
  await page.waitForTimeout(250)
}

async function openScreen(page: Page, screen: (typeof SCREENS)[number], draftSpec: string): Promise<void> {
  if (await page.locator(ASSUMED.specCard).count()) { await page.keyboard.press('Escape'); await expect(page.locator(ASSUMED.specCard)).toHaveCount(0) }
  if (screen === 'planning') {
    await openBuildView(page, 'Planning')
    await expect(page.locator(ASSUMED.backlogColumn)).toBeVisible({ timeout: 60_000 })
  } else if (screen === 'lifecycle-home') {
    await page.locator(SEL.projectNav).getByRole('button', { name: /^Phase 0/ }).click()
    await expect(page.locator(ASSUMED.lifecycleHome)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(ASSUMED.today)).toBeVisible({ timeout: 60_000 })
  } else {
    await openBuildView(page, 'Home')
    await sprintHomeVisible(page)
    await expect(page.locator(ASSUMED.laneCard).first()).toBeVisible({ timeout: 60_000 })
    if (screen === 'spec-card') {
      const row = page.locator(ASSUMED.refining).locator(`[data-spec="${draftSpec}"]`)
      await row.scrollIntoViewIfNeeded()
      await row.getByRole('button', { name: TEXT.refineInPlace }).click()
      await expect(page.locator(ASSUMED.specCard)).toBeVisible({ timeout: 60_000 })
    }
  }
  await page.waitForTimeout(1_200) // the command-center read lands; lanes, Today and Refining fill
  await mainToTop(page)
}

test.describe('[cockpit QA] no landmark overlaps another, every one sits in the viewport, the root never scrolls', () => {
  test.skip(!PLUGIN_ROOT || !existsSync(VENV_PYTHON), 'needs a plugin checkout beside this repo')

  let app: ElectronApplication
  let page: Page
  let fx: Fixture

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    fx = overlapFixture()
    seedSettings(fx.userData, fx.project, 'overlap project')
    ;({ app, page } = await launch(fx.userData))
    await openProject(page, 'overlap project')
    const actor = await ensureActor(page, fx.project)
    openOverdueDecision(fx.project, actor, `Confirm risk tier for ${fx.specIds[3]} (proposed HIGH)`)
    await refreshScreen(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await closeApp(app, page, 'cc-overlap')
  })

  for (const size of SIZES) {
    for (const theme of THEMES) {
      test.describe(`${size.width}×${size.height} · ${theme.toLowerCase()}`, () => {
        test.beforeAll(async () => {
          await page.setViewportSize({ width: size.width, height: size.height })
          await page.waitForTimeout(400)
          await setTheme(page, theme)
        })
        for (const screen of SCREENS) {
          test(`${screen}`, async () => {
            test.setTimeout(120_000)
            await openScreen(page, screen, fx.specIds[3])
            const report = await page.evaluate(measureLandmarks)
            for (const line of report.violations) console.log(`PROBE OVERLAP ${screen} ${report.viewport} ${report.theme}: ${line}`)
            expect(report.viewport).toBe(`${size.width}x${size.height}`)
            expect(report.landmarks.length, 'the shell band, <main> and the chat aside are always landmarks').toBeGreaterThanOrEqual(3)
            expect(report.violations, `${screen} at ${report.viewport} (${report.theme}) — landmarks: ${report.landmarks.join(' · ')}`).toEqual([])
            if (screen === 'sprint-home') {
              const cockpit = await page.evaluate(cockpitRules)
              for (const line of cockpit.violations) console.log(`PROBE COCKPIT ${report.viewport} ${report.theme}: ${line}`)
              expect(cockpit.violations, `cockpit at ${report.viewport} (${report.theme}) — ${cockpit.facts.join(' · ')}`).toEqual([])
            }
            if (screen === 'spec-card') {
              const caption = await page.evaluate(captionRules)
              for (const line of caption.violations) console.log(`PROBE CAPTION ${report.viewport} ${report.theme}: ${line}`)
              expect(caption.violations, `findings caption at ${report.viewport} (${report.theme}) — ${caption.facts.join(' · ')}`).toEqual([])
            }
          })
        }
      })
    }
  }
})
