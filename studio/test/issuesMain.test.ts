/** The Issues main-process module (electron/main/issues.ts) against the REAL plugin scripts in a
 * project `init_project.py` made — never canned JSON. What the plugin really prints becomes what the
 * renderer is handed: the question plan and its lifecycle words, the build facts written to a temp
 * file, the report write with its proposals (and the plugin's gaps on exit 1, refusal on exit 2),
 * the queue block with counts, one report with the actions the lifecycle allows and the plugin's
 * reasons for the refused ones, the screenshot read back under `.sdlc/issues/` only, and the
 * lifecycle verbs from triage to a promoted bugfix spec. The closed-set rules are proved too: a
 * screenshot path main never handed out is refused before any spawn. */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  fileCapture, getIssue, getIssueEnvironment, getIssueQuestions, ISSUE_TEMP_DIR, issuedPaths, listIssues, readIssueScreenshot, rememberIssued, reportIssue, runIssueVerb,
} from '../electron/main/issues'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { invalidateCommandCenter } from '../electron/main/commandCenter'
import type { IssueReportRequest } from '../shared/types'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)
const ACTOR = { name: 'Priya N.', source: 'typed' as const }
const REVIEWER = { name: 'Sam K', source: 'typed' as const }
const CAPS = ['issue-questions', 'issue-env', 'issue-report', 'issue-list', 'issue-show', 'issue-triage', 'issue-prioritize', 'issue-promote', 'issue-sync', 'issue-file']

/** A real 2×2 PNG — the plugin reads the bytes, not the name. */
function pngBytes(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.from([0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

let workspace: string
let project: string
let shot: string

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'studio-issues-'))
  project = join(workspace, 'project')
  execFileSync(PLUGIN.python, [join(PLUGIN.scriptsDir, 'init_project.py'), '--profile', join(PLUGIN.root, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project], { stdio: 'pipe' })
  shot = join(workspace, 'shot.png')
  writeFileSync(shot, pngBytes())
  invalidateCommandCenter(project, 'all')
})

afterEach(() => {
  try { rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) } catch { /* Windows: a handle may linger */ }
})

async function request(over: Partial<IssueReportRequest> = {}): Promise<IssueReportRequest> {
  const env = await getIssueEnvironment(project, PLUGIN.scriptsDir, { appVersion: '0.1.0' })
  if (!env.ok) throw new Error(env.error)
  const cap = fileCapture(shot)
  if (!cap.ok) throw new Error(cap.error)
  return {
    channel: 'web', title: 'Claim total doubles after adding a second line item',
    whatHappened: 'Adding a second line item shows the claim total as twice the sum of the two lines.',
    expected: 'The total is the sum of the line items', steps: ['open claim 1042', 'add a line item of 100'],
    environment: 'test', severity: 'degraded', frequency: 'always', dataImpact: 'wrong-shown', persona: 'a claims adjuster', reporterRole: 'checker',
    screenshots: [cap.path], noClientData: true, answers: { browser_device: 'Chrome 130 on Windows 11', last_action: 'clicked Add line item' },
    environmentPath: env.envPath, ...over,
  }
}

describe('reads', () => {
  it('the question plan is the plugin’s, with the channel’s follow-ups and the lifecycle words', async () => {
    const plan = await getIssueQuestions(project, PLUGIN.scriptsDir, 'api')
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.channel).toBe('api')
    expect(plan.plan.questions.map((q) => q.id)).toEqual(expect.arrayContaining(['channel', 'endpoint', 'status_code', 'title', 'environment', 'data_impact', 'persona', 'reporter_role', 'screenshot', 'no_client_data']))
    expect(plan.plan.questions.map((q) => q.id)).not.toContain('browser_device')
    expect(plan.plan.lifecycle.statuses).toEqual(['new', 'needs-info', 'triaged', 'prioritized', 'promoted', 'fixed', 'wont-fix', 'duplicate'])
    expect(plan.plan.lifecycle.priority_labels.P1).toMatch(/^P1 — fix now/)
  })

  it('the build facts are the plugin’s env document, written to a temp file main hands out', async () => {
    const env = await getIssueEnvironment(project, PLUGIN.scriptsDir, { appVersion: '0.1.0' })
    expect(env.ok).toBe(true)
    if (!env.ok) return
    expect(env.env.repo.host).toBe('none')
    expect(env.env.tooling.app_version).toBe('0.1.0')
    expect(JSON.parse(readFileSync(env.envPath, 'utf-8')).machine.os).toBe(env.env.machine.os)
  })

  it('an empty project lists no reports, with every count at zero and an empty queue', async () => {
    const list = await listIssues(project, PLUGIN.scriptsDir, CAPS)
    expect(list).toEqual({ ok: true, data: { issues: [], count: 0, counts: expect.any(Object), queue: [], dir: '.sdlc/issues' } })
    if (list.ok) expect(Object.values(list.data.counts).every((n) => n === 0)).toBe(true)
  })
})

describe('reportIssue', () => {
  it('refuses a screenshot path main never handed out, before any spawn', async () => {
    const req = await request({ screenshots: [shot + '.copy.png'] })
    const r = await reportIssue(project, PLUGIN.scriptsDir, req, ACTOR, CAPS)
    expect(r.exitCode).toBeNull()
    expect(r.stderr).toMatch(/not one Studio pasted, picked or captured/)
  })

  it('refuses without an actor and on an older plugin, naming the capability', async () => {
    const req = await request()
    expect((await reportIssue(project, PLUGIN.scriptsDir, req, null, CAPS)).stderr).toBe('Sign in or type your name — the plugin records who is accountable')
    expect((await reportIssue(project, PLUGIN.scriptsDir, req, ACTOR, ['sprint-status'])).stderr).toBe('arrives with a newer plugin: lacks issue-report')
  })

  it('writes the report with exit 0, the plugin’s proposals, and then the queue and show read it back', async () => {
    const r = await reportIssue(project, PLUGIN.scriptsDir, await request(), ACTOR, CAPS)
    expect(r.exitCode, r.stdout + r.stderr).toBe(0)
    expect(r.issue).toBe('ISS-0001')
    expect(r.path).toMatch(/^\.sdlc\/issues\/ISS-0001-/)
    expect(r.proposedPriority).toBe('P2')
    expect(r.proposedRisk).toBe('MEDIUM')
    expect(r.argv[0]).toBe('new')
    expect(r.argv).toContain('--state')
    const list = await listIssues(project, PLUGIN.scriptsDir, CAPS)
    expect(list.ok && list.data.queue).toEqual(['ISS-0001'])
    expect(list.ok && list.data.counts.new).toBe(1)
    const detail = await getIssue(project, PLUGIN.scriptsDir, 'ISS-0001')
    expect(detail.ok).toBe(true)
    if (!detail.ok) return
    expect(detail.data.status).toBe('new')
    expect(detail.data.sections['Steps to reproduce']).toBe('1. open claim 1042\n2. add a line item of 100')
    expect(detail.data.actions.triage.ok).toBe(true)
    expect(detail.data.actions.promote.ok).toBe(false)
    expect(detail.data.actions.promote.reason).toMatch(/review it first/)
    expect(detail.data.screenshot_paths).toEqual(['.sdlc/issues/ISS-0001/screenshot-1.png'])
    const img = readIssueScreenshot(project, detail.data.screenshot_paths[0])
    expect(img.ok && img.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('once the report is written the temp copies under our own folder go, owner-only while they live; a file the person picked stays', async () => {
    const env = await getIssueEnvironment(project, PLUGIN.scriptsDir, { appVersion: '0.1.0' })
    if (!env.ok) throw new Error(env.error)
    if (process.platform !== 'win32') expect(statSync(env.envPath).mode & 0o777).toBe(0o600)
    // A "pasted" screenshot: a file in the temp folder main hands out, as pasteScreenshot would.
    const pasted = join(ISSUE_TEMP_DIR, `pasted-test-${Date.now()}.png`)
    copyFileSync(shot, pasted)
    rememberIssued(pasted)
    const picked = fileCapture(shot)
    if (!picked.ok) throw new Error(picked.error)
    const req = await request({ screenshots: [pasted, picked.path], environmentPath: env.envPath })
    const r = await reportIssue(project, PLUGIN.scriptsDir, req, ACTOR, CAPS)
    expect(r.exitCode, r.stdout + r.stderr).toBe(0)
    expect(existsSync(pasted)).toBe(false)
    expect(existsSync(env.envPath)).toBe(false)
    expect(existsSync(shot)).toBe(true)
    expect(issuedPaths().has(pasted)).toBe(false)
    expect(issuedPaths().has(shot)).toBe(false)
    // The plugin has its own copies.
    expect(existsSync(join(project, '.sdlc', 'issues', 'ISS-0001', 'screenshot-1.png'))).toBe(true)
    expect(existsSync(join(project, '.sdlc', 'issues', 'ISS-0001', 'screenshot-2.png'))).toBe(true)
  })

  it('exit 1 hands back the plugin’s gaps by field; exit 2 the refusal — nothing written either way', async () => {
    const gaps = await reportIssue(project, PLUGIN.scriptsDir, await request({ whatHappened: 'it broke', answers: {} }), ACTOR, CAPS)
    expect(gaps.exitCode).toBe(1)
    expect(gaps.gaps).toEqual(expect.arrayContaining([expect.stringMatching(/^what_happened: /), expect.stringMatching(/^browser_device: /), expect.stringMatching(/^last_action: /)]))
    const refused = await reportIssue(project, PLUGIN.scriptsDir, await request({ whatHappened: 'the page printed ghp_abcdefghijklmnopqrstuvwxyz012345 in the error details column' }), ACTOR, CAPS)
    expect(refused.exitCode).toBe(2)
    expect(refused.refused).toBe(true)
    expect(refused.stdout).toMatch(/GitHub token/)
    const list = await listIssues(project, PLUGIN.scriptsDir, CAPS)
    expect(list.ok && list.data.count).toBe(0)
  })
})

describe('the lifecycle through runIssueVerb', () => {
  it('triage by the reporter is the plugin’s refusal; by someone else it moves to triaged; prioritize, then promote scaffolds the bugfix spec', async () => {
    expect((await reportIssue(project, PLUGIN.scriptsDir, await request(), ACTOR, CAPS)).exitCode).toBe(0)
    const own = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed' }, ACTOR, CAPS)
    expect(own.exitCode).toBe(1)
    expect(own.stdout).toMatch(/someone other than its reporter/)
    const triaged = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed', severity: 'blocks' }, REVIEWER, CAPS)
    expect(triaged.exitCode, triaged.stdout).toBe(0)
    expect(triaged.doc?.status).toBe('triaged')
    expect(triaged.argv.slice(0, 1)).toEqual(['triage'])
    const early = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'promote', issue: 'ISS-0001', risk: 'MEDIUM' }, REVIEWER, CAPS)
    expect(early.exitCode).toBe(1)
    expect(early.stdout).toMatch(/prioritize/)
    const prioritized = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'prioritize', issue: 'ISS-0001', priority: 'P1', targetSprint: 'S08' }, REVIEWER, CAPS)
    expect(prioritized.exitCode, prioritized.stdout).toBe(0)
    expect(prioritized.doc?.priority).toBe('P1')
    const promoted = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'promote', issue: 'ISS-0001', risk: 'HIGH', team: 'claims' }, REVIEWER, CAPS)
    expect(promoted.exitCode, promoted.stdout).toBe(0)
    expect(promoted.doc?.spec).toBe('0001')
    const spec = readFileSync(join(project, String(promoted.doc?.path)), 'utf-8')
    expect(spec).toMatch(/^type: bugfix/m)
    expect(spec).toMatch(/^source: "ISS-0001"/m)
    const detail = await getIssue(project, PLUGIN.scriptsDir, 'ISS-0001')
    expect(detail.ok && detail.data.status).toBe('promoted')
    expect(detail.ok && detail.data.bugfix_spec).toBe('0001')
    expect(detail.ok && detail.data.actions.promote.reason).toMatch(/already has a bugfix spec/)
    const sync = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'sync' }, null, CAPS)
    expect(sync.exitCode).toBe(0)
    expect(sync.doc?.waiting).toEqual([{ issue: 'ISS-0001', spec: '0001', spec_status: 'draft' }])
  })

  it('a verb the plugin lacks, no actor, and a bad shape are refused in Studio before any spawn', async () => {
    expect((await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'triage', issue: 'ISS-0001', verdict: 'confirmed' }, REVIEWER, ['issue-list'])).stderr).toBe('arrives with a newer plugin: lacks issue-triage')
    expect((await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'note', issue: 'ISS-0001', note: 'x' }, null, CAPS)).stderr).toBe('Sign in or type your name — the plugin records who is accountable')
    const shape = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'prioritize', issue: 'ISS-0001', priority: 'P9' as 'P1' }, REVIEWER, CAPS)
    expect(shape.exitCode).toBeNull()
    expect(shape.stderr).toMatch(/priority 'P9'/)
  })

  it('a filing dry run returns the exact command the plugin would run, and nothing is filed', async () => {
    expect((await reportIssue(project, PLUGIN.scriptsDir, await request(), ACTOR, CAPS)).exitCode).toBe(0)
    const dry = await runIssueVerb(project, PLUGIN.scriptsDir, { verb: 'file', issue: 'ISS-0001', dryRun: true, host: 'github' }, ACTOR, CAPS)
    expect(dry.exitCode, dry.stdout).toBe(0)
    expect(dry.doc?.dry_run).toBe(true)
    expect((dry.doc?.argv as string[]).slice(0, 3)).toEqual(['gh', 'issue', 'create'])
    const detail = await getIssue(project, PLUGIN.scriptsDir, 'ISS-0001')
    expect(detail.ok && detail.data.filed_url).toBeNull()
  })
})

describe('readIssueScreenshot', () => {
  it('reads only under the project’s own .sdlc/issues folder', () => {
    rememberIssued(shot)
    expect(readIssueScreenshot(project, '../shot.png').ok).toBe(false)
    expect(readIssueScreenshot(project, '.sdlc/state.yaml').ok).toBe(false)
    expect(readIssueScreenshot(project, '.sdlc/issues/ISS-0042/screenshot-1.png').ok).toBe(false)
  })
})
