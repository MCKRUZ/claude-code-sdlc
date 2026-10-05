/** Everything the smoke run saw, written where a person (or Claude) can read it afterwards.
 *
 * `test/screenshots/smoke/` is already ignored by git. Three things land there: a screenshot per
 * screen per window size, `observations.json` (every finding, visit and click, as data) and
 * `report.md` (the same, written to be read). The report is a starting point for the human-eye
 * review, which looks at the pictures for what no rule can see: a layout that is technically
 * valid and still confusing, a step that takes too many clicks, a screen that says nothing useful.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { judge, type Finding, type ScreenMeasure, type Severity } from './findings'
import { knownIssueFor, type KnownIssue } from './knownIssues'
import { measureScreen } from './measure'

export interface Visit {
  screen: string
  size: string
  shot: string
  headings: string[]
  interactive: number
}

export interface Click {
  screen: string
  control: string
  outcome: 'clicked' | 'skipped'
  note?: string
}

export class SmokeRun {
  readonly findings: Finding[] = []
  readonly visits: Visit[] = []
  readonly clicks: Click[] = []
  readonly runtimeErrors: { where: string; text: string }[] = []
  private current = 'startup'

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true })
    // Last run's pictures would be read as this run's. Files one by one, and a locked one (a viewer
    // or a sync client holding it) is left behind rather than failing the whole run.
    for (const name of readdirSync(dir)) {
      try { rmSync(join(dir, name), { force: true }) } catch { /* overwritten by this run if it matters */ }
    }
  }

  /** Where in the app a console error or an uncaught exception happened. */
  at(screen: string): void {
    this.current = screen
  }

  watch(page: Page): void {
    page.on('pageerror', (err) => this.runtimeErrors.push({ where: this.current, text: `uncaught: ${err.message}` }))
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      // Chromium reports the failure to load a missing favicon-style resource as a console error
      // with no bearing on the app; anything the app itself logged is kept.
      if (/Failed to load resource/.test(text)) return
      this.runtimeErrors.push({ where: this.current, text })
    })
  }

  /** Photograph the screen, measure it, and judge it. Returns the findings so a caller can react. */
  async look(page: Page, screen: string, size: string): Promise<{ measure: ScreenMeasure; found: Finding[] }> {
    this.at(screen)
    const shot = `${slug(screen)}__${size}.png`
    await page.screenshot({ path: join(this.dir, shot) })
    // The main panel scrolls inside the window, so a screenshot shows only its top. When there is
    // more below, photograph that too; what a person finds by scrolling is part of the screen.
    if (size.startsWith('1280') && !screen.includes(' › after ')) {
      const scrolled = await page.evaluate(() => {
        const main = document.querySelector('main')
        if (!main || main.scrollHeight <= main.clientHeight + 40) return false
        main.scrollTo(0, main.scrollHeight)
        return true
      })
      if (scrolled) {
        await page.waitForTimeout(150)
        await page.screenshot({ path: join(this.dir, shot.replace('.png', '__scrolled.png')) })
        await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0))
      }
    }
    const measure = await measureScreen(page)
    const found = judge(screen, size, measure)
    this.findings.push(...found)
    this.visits.push({ screen, size, shot, headings: measure.headings, interactive: measure.interactive })
    return { measure, found }
  }

  click(screen: string, control: string, outcome: Click['outcome'], note?: string): void {
    this.clicks.push({ screen, control, outcome, note })
  }

  /** Bugs nobody has written down yet. These, and only these, fail the run. */
  bugs(): Finding[] {
    return this.findings.filter((f) => f.severity === 'bug' && !knownIssueFor(f))
  }

  /** Bugs already on the known list, each with how many screens it showed on. */
  knownBugs(): { issue: KnownIssue; screens: number }[] {
    const tally = new Map<KnownIssue, Set<string>>()
    for (const f of this.findings) {
      const issue = knownIssueFor(f)
      if (!issue) continue
      tally.set(issue, (tally.get(issue) ?? new Set()).add(f.screen))
    }
    return Array.from(tally, ([issue, screens]) => ({ issue, screens: screens.size }))
  }

  write(): void {
    writeFileSync(join(this.dir, 'observations.json'), JSON.stringify({
      findings: this.findings, visits: this.visits, clicks: this.clicks, runtimeErrors: this.runtimeErrors,
    }, null, 2))
    writeFileSync(join(this.dir, 'report.md'), this.report())
  }

  private report(): string {
    // Counted as distinct problems, not as sightings: one sidebar message on 160 screens is one problem.
    const distinct = (rows: Finding[]) => dedupe(rows).length
    const fresh = this.bugs()
    const known = this.knownBugs()
    const of = (s: Severity) => this.findings.filter((f) => f.severity === s)
    const lines: string[] = [
      '# Studio smoke run',
      '',
      `${this.visits.length} screen views across ${new Set(this.visits.map((v) => v.screen)).size} screens and ${new Set(this.visits.map((v) => v.size)).size} window sizes.`,
      `New bugs: ${distinct(fresh)}. Known, not yet fixed: ${known.length}. Warnings: ${distinct(of('warn'))}. Wording notes: ${distinct(of('note'))}. Runtime errors: ${this.runtimeErrors.length}.`,
      '',
    ]
    if (this.runtimeErrors.length) {
      lines.push('## Runtime errors (console and uncaught)', '', ...this.runtimeErrors.map((e) => `- **${e.where}**: ${e.text}`), '')
    }
    if (known.length) {
      lines.push('## Known, not yet fixed', '', '| Problem | Shown on | What fixing it looks like |', '|---|---|---|')
      for (const { issue, screens } of known) lines.push(`| ${issue.problem} | ${screens} screen${screens === 1 ? '' : 's'} | ${issue.fix} |`)
      lines.push('')
    }
    for (const [title, rows] of [['New bugs', fresh], ['Warnings', of('warn')], ['Wording for non-developers', of('note')]] as const) {
      if (!rows.length) continue
      lines.push(`## ${title}`, '', '| Screen | Size | Kind | Detail |', '|---|---|---|---|')
      for (const f of dedupe(rows)) lines.push(`| ${f.screen} | ${f.size} | ${f.kind} | ${f.detail.replace(/\|/g, '\\|')} |`)
      lines.push('')
    }
    const skipped = this.clicks.filter((c) => c.outcome === 'skipped')
    lines.push(
      '## Controls',
      '',
      `${this.clicks.filter((c) => c.outcome === 'clicked').length} read-only controls were clicked.`,
      `${skipped.length} were deliberately NOT clicked because they change something (sign-off, lock, keep, build, hand-off...). Those are covered, with their own fixtures, by the other specs in test/e2e/.`,
      '',
    )
    if (skipped.length) {
      lines.push('| Screen | Control not clicked |', '|---|---|', ...skipped.map((c) => `| ${c.screen} | ${c.control} |`), '')
    }
    lines.push('## Screens to look at', '', ...this.visits.filter((v) => v.size.startsWith('1280')).map((v) => `- ${v.shot} — ${v.screen}${v.headings.length ? ` (${v.headings.slice(0, 3).join(' / ')})` : ''}`), '')
    return lines.join('\n')
  }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

/** One problem is one row, however many screens or sizes it shows on: a sidebar message that appears
 * on every screen is a single finding with a count, not two hundred. */
function dedupe(rows: Finding[]): Finding[] {
  const seen = new Map<string, { first: Finding; screens: Set<string>; sizes: Set<string> }>()
  for (const f of rows) {
    const key = `${f.kind}|${f.detail}`
    const prior = seen.get(key)
    if (prior) { prior.screens.add(f.screen); prior.sizes.add(f.size) }
    else seen.set(key, { first: f, screens: new Set([f.screen]), sizes: new Set([f.size]) })
  }
  return Array.from(seen.values()).map(({ first, screens, sizes }) => {
    const names = Array.from(screens)
    const where = names.length === 1 ? names[0] : `${names.length} screens, e.g. ${names.slice(0, 2).join('; ')}`
    return { ...first, screen: where, size: Array.from(sizes).join(', ') }
  })
}
