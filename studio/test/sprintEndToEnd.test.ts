/** The Sprint view against the REAL plugin scripts in a project init_project.py made — not canned
 * JSON: a sprint `sprint.py new` created, three specs `new_spec.py` scaffolded and `sprint.py slate`
 * slated, one verdict recorded, then `getSprintStatus` read through the same adapter the window
 * uses. The last describe is the read-only promise: reading the sprint changes nothing under
 * .sdlc/ or specs/, and writing a page changes exactly the page (and the reports index). */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openReport } from '../electron/main/activityRuns'
import { getSprintStatus, renderSprintReport } from '../electron/main/sprint'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)

function py(args: string[], cwd: string): string {
  return execFileSync(PLUGIN.python, args, { cwd, encoding: 'utf-8' })
}

/** relative path (posix) -> SHA-256, for every file under the project's .sdlc/ and specs/ */
function snapshot(project: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else out.set(relative(project, full).replace(/\\/g, '/'), createHash('sha256').update(readFileSync(full)).digest('hex'))
    }
  }
  walk(join(project, '.sdlc'))
  walk(join(project, 'specs'))
  return out
}

function differences(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()])
  return [...paths].filter((p) => before.get(p) !== after.get(p)).sort()
}

describe.skipIf(!PLUGIN.available)('the Sprint view against the real plugin scripts', () => {
  let project = ''
  let specIds: string[] = []

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'studio-sprint-e2e-'))
    const scripts = PLUGIN.scriptsDir
    py([join(scripts, 'init_project.py'), '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project], scripts)
    for (const [name, risk] of [['duplicate claim 409', 'HIGH'], ['claim export', 'MEDIUM'], ['adjuster notes', 'LOW']]) {
      py([join(scripts, 'new_spec.py'), '--repo', project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'], scripts)
    }
    specIds = readdirSync(join(project, 'specs')).filter((f) => /^\d{4}-/.test(f)).map((f) => f.slice(0, 4)).sort()
    py([
      join(scripts, 'sprint.py'), 'new', '--repo', project, '--sprint', 'S07', '--goal', 'Adjusters file without a phone call',
      '--start', '2026-09-28', '--target', '3', '--mix', 'HIGH:1,MEDIUM:1,LOW:1', '--by', 'Priya N.',
    ], scripts)
    py([join(scripts, 'sprint.py'), 'slate', '--repo', project, '--sprint', 'S07', ...specIds.flatMap((id) => ['--spec', id]), '--by', 'Priya N.'], scripts)
    py([join(scripts, 'sprint.py'), 'verdict', '--repo', project, '--spec', specIds[0], '--lane', 'eng', '--verdict', 'accepted', '--by', 'Matt K.'], scripts)
  }, 120_000)

  afterAll(() => { if (project) rmSync(project, { recursive: true, force: true }) })

  it('scaffolded three specs to slate', () => {
    expect(specIds).toHaveLength(3)
  })

  it('reads the sprint the scripts made: the record, the slate, a verdict pending with its age, and no fabricated zero', async () => {
    const r = await getSprintStatus(project, PLUGIN.scriptsDir)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    if (!r.ok) return
    expect(r.sprint).toMatchObject({ id: 'S07', goal: 'Adjusters file without a phone call', start: '2026-09-28', state: 'planning', target: 3 })
    expect(r.sprint!.relPath).toBe('.sdlc/sprints/S07.md')
    expect(r.hasData).toBe(true)
    expect(r.slate.map((s) => s.id)).toEqual(specIds)
    expect(r.slate.map((s) => s.relPath)).toEqual(specIds.map((id) => readdirSync(join(project, 'specs')).find((f) => f.startsWith(id))).map((f) => `specs/${f}`))
    expect(r.slate.every((s) => s.sprint === 'S07')).toBe(true)
    // A fresh scaffold has placeholders, so the DoR says NOT READY — in the checker's words.
    expect(r.slate.every((s) => s.dor === 'NOT READY' && s.dorBlocking.length > 0)).toBe(true)
    expect(r.readiness).toMatchObject({ ready: 0, total: 3 })
    expect(r.readiness.gaps.map((g) => g.spec)).toEqual(specIds)
    // The eng verdict on the first spec was accepted; the other five lanes are pending and aged
    // from the `slated` ledger line, which is today — so 0 business days, a real count, not "no data".
    const first = r.slate.find((s) => s.id === specIds[0])!
    expect(first.engReview).toBe('accepted')
    expect(r.verdictsPending.map((v) => `${v.spec}:${v.lane}`)).toEqual([
      `${specIds[0]}:data`, `${specIds[1]}:eng`, `${specIds[1]}:data`, `${specIds[2]}:eng`, `${specIds[2]}:data`,
    ])
    expect(r.verdictsPending.every((v) => v.sinceBusinessDays !== null)).toBe(true)
    expect(r.handoffsOpen).toEqual([])
    expect(r.mix).toEqual({ HIGH: { target: 1, actual: 1 }, MEDIUM: { target: 1, actual: 1 }, LOW: { target: 1, actual: 1 } })
    expect(r.mixWarnings).toEqual([])
    // No cadence-plan.md states a cap: null, which the screen reads as "cap not set".
    expect(r.wip).toEqual({ inFlight: 0, cap: null })
    expect(r.buildOrder).toHaveLength(3)
    // Nothing is READY, so nothing is next — the plugin's null, not Studio's guess.
    expect(r.nextUp).toBeNull()
    expect(r.decisions).toBeNull()
    expect(r.carriedIn).toEqual([])
  })

  it('a named sprint that does not exist is the plugin\'s one JSON document with has_data false and a note', async () => {
    const r = await getSprintStatus(project, PLUGIN.scriptsDir, 'S99')
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    if (!r.ok) return
    expect(r.sprint).toBeNull()
    expect(r.slate).toEqual([])
    expect(r.hasData).toBe(false)
    expect(r.note).toEqual(expect.any(String))
  })

  it('runs in workflow mode here (the project has a state file) and in standalone mode without one', async () => {
    const standalone = mkdtempSync(join(tmpdir(), 'studio-sprint-standalone-'))
    try {
      const r = await getSprintStatus(standalone, PLUGIN.scriptsDir)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
      expect(r.ok && r.sprint).toBeNull()
      expect(r.ok && r.hasData).toBe(false)
    } finally {
      rmSync(standalone, { recursive: true, force: true })
    }
  })

  it('reading the sprint writes nothing', async () => {
    const before = snapshot(project)
    await getSprintStatus(project, PLUGIN.scriptsDir)
    await getSprintStatus(project, PLUGIN.scriptsDir, 'S07')
    await getSprintStatus(project, PLUGIN.scriptsDir, 'S99')
    expect(differences(before, snapshot(project))).toEqual([])
  })

  it('writes the planning page where it says, inside .sdlc/reports/, and opens it (through an injected opener)', async () => {
    const before = snapshot(project)
    const r = await renderSprintReport(project, PLUGIN.scriptsDir, 'S07', 'planning')
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    if (!r.ok) return
    expect(r.relOutput).toBe('.sdlc/reports/sprint-S07-planning.html')
    expect(readFileSync(join(project, r.relOutput), 'utf-8')).toContain('<html')
    const changed = differences(before, snapshot(project))
    expect(changed.every((p) => /^\.sdlc\/reports\/[^/]+\.html$/.test(p)), changed.join(', ')).toBe(true)
    expect(changed).toContain('.sdlc/reports/sprint-S07-planning.html')
    const opened: string[] = []
    expect(await openReport(project, r.relOutput, async (p) => { opened.push(p); return '' })).toEqual({ ok: true })
    expect(opened).toHaveLength(1)
  })

  it('writes the review page the same way', async () => {
    const r = await renderSprintReport(project, PLUGIN.scriptsDir, 'S07', 'review')
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    if (!r.ok) return
    expect(r.relOutput).toBe('.sdlc/reports/sprint-S07-review.html')
    expect(existsSync(join(project, r.relOutput))).toBe(true)
  })

  it('a page for a sprint that does not exist is the plugin\'s refusal in its words, and nothing is written', async () => {
    const before = snapshot(project)
    const r = await renderSprintReport(project, PLUGIN.scriptsDir, 'S99', 'planning')
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/S99/) })
    expect(differences(before, snapshot(project))).toEqual([])
  })
})
