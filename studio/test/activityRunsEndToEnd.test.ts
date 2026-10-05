/** The four run activities of spec 0026 against the REAL plugin scripts in a project that
 * init_project.py made, not against canned JSON: what the scripts really print, and what they
 * really write. The last describe is the spec's "no other writes" check: it hashes every file
 * under .sdlc/ around each action and allows exactly the generated reports and the intake
 * catalogue to differ. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  exportPhaseReport, getNarrativeCoverage, getReviewStanding, openReport, runIntake, runStrictReviewCheck,
} from '../electron/main/activityRuns'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)

// An OPEN finding and a FIXED claim on the same file hash: the plugin calls that a mismatch.
const LEDGER = [
  { id: 'F1', severity: 'HIGH', target: 'x.md', disposition: 'OPEN', fingerprint: 'fp1', target_sha: 'aaa' },
  { id: 'F1', severity: 'HIGH', target: 'x.md', disposition: 'FIXED', fingerprint: 'fp1', target_sha: 'aaa' },
  { id: 'F2', severity: 'HIGH', target: 'y.md', disposition: 'OPEN', fingerprint: 'fp2', target_sha: 'bbb' },
  { id: 'F3', severity: 'LOW', target: 'z.md', disposition: 'OPEN', fingerprint: 'fp3', target_sha: 'ccc' },
].map((e) => JSON.stringify({ timestamp: '2026-10-01T00:00:00+00:00', report: 'r.md', category: 'c', detail: 'd', ...e })).join('\n') + '\n'

/** relative path (posix) -> SHA-256, for every file under the project's .sdlc/ */
function snapshot(project: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else out.set(relative(project, full).replace(/\\/g, '/'), createHash('sha256').update(readFileSync(full)).digest('hex'))
    }
  }
  walk(join(project, '.sdlc'))
  return out
}

function differences(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()])
  return [...paths].filter((p) => before.get(p) !== after.get(p)).sort()
}

const ALLOWED_WRITE = /^(\.sdlc\/reports\/[^/]+\.html|\.sdlc\/context\/intake\/catalog\.json)$/

describe.skipIf(!PLUGIN.available)('the run activities against the real plugin scripts', () => {
  let project = ''

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'studio-runs-'))
    execFileSync(PLUGIN.python, [
      join(PLUGIN.scriptsDir, 'init_project.py'),
      '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: PLUGIN.scriptsDir })
  })

  afterEach(() => rmSync(project, { recursive: true, force: true }))

  const withIntakeFolder = (files: Record<string, string> = {
    'a.md': '# One\nhello world doc\n', 'b.txt': 'second text doc here\n', 'c.md': '# third\n',
  }) => {
    appendFileSync(join(project, '.sdlc', 'profile.yaml'),
      '\ndocumentation:\n  intake_path: "docs/intake"\n  types: [pdf, markdown, text]\n  max_documents: 50\n')
    mkdirSync(join(project, 'docs', 'intake'), { recursive: true })
    for (const [name, text] of Object.entries(files)) writeFileSync(join(project, 'docs', 'intake', name), text)
  }
  const withLedger = () => {
    mkdirSync(join(project, '.sdlc', 'metrics'), { recursive: true })
    writeFileSync(join(project, '.sdlc', 'metrics', 'findings-log.jsonl'), LEDGER)
  }
  const withNarratives = () => {
    const dir = join(project, '.sdlc', 'artifacts', '00-discovery')
    mkdirSync(dir, { recursive: true })
    for (const f of ['constitution.md', 'problem-statement.md', 'constraints.md']) writeFileSync(join(dir, f), `# ${f}\n`)
    writeFileSync(join(dir, 'constitution.narrative.md'), '# plain-language\n')
  }

  describe('phase report', () => {
    it('writes one stage report, names the documents it did not find, and returns an absolute path inside .sdlc/reports', async () => {
      const r = await exportPhaseReport(project, PLUGIN.scriptsDir, '0', false)
      expect(r.ok, r.error).toBe(true)
      expect(r.reports).toHaveLength(1)
      const [report] = r.reports
      expect(report).toMatchObject({ phase: '0', phaseName: 'Discovery', found: 0, missing: 5, total: 5 })
      expect(report.missingNames).toEqual([
        'constitution.md', 'problem-statement.md', 'success-criteria.md', 'constraints.md', 'phase1-handoff.md',
      ])
      expect(report.output.replace(/\\/g, '/')).toBe(join(project, '.sdlc', 'reports', '00-discovery-report.html').replace(/\\/g, '/'))
      expect(readFileSync(report.output, 'utf-8')).toContain('<html')
    })

    it('counts a document that exists', async () => {
      withNarratives()
      const r = await exportPhaseReport(project, PLUGIN.scriptsDir, '0', false)
      expect(r.reports[0]).toMatchObject({ found: 3, missing: 2, total: 5 })
      expect(r.reports[0].missingNames).toEqual(['success-criteria.md', 'phase1-handoff.md'])
    })

    it('writes every stage and the index with "all"', async () => {
      const r = await exportPhaseReport(project, PLUGIN.scriptsDir, '0', true)
      expect(r.ok, r.error).toBe(true)
      expect(r.reports.map((x) => x.phase)).toEqual(['0', '1', '2', '3', 'build', '7', '8', '9', 'close'])
      expect(r.index?.replace(/\\/g, '/')).toBe(join(project, '.sdlc', 'reports', 'index.html').replace(/\\/g, '/'))
    })

    it('answers an unknown stage with the plugin\'s own one-line refusal and no report', async () => {
      const r = await exportPhaseReport(project, PLUGIN.scriptsDir, 'zzz', false)
      expect(r).toEqual({ ok: false, error: expect.stringMatching(/invalid phase id/), reports: [] })
    })

    it('opens a report it wrote (through an injected opener) and nothing else', async () => {
      const [report] = (await exportPhaseReport(project, PLUGIN.scriptsDir, '0', false)).reports
      const opened: string[] = []
      const open = async (p: string) => { opened.push(p); return '' }
      expect(await openReport(project, report.output, open)).toEqual({ ok: true })
      expect(await openReport(project, join(project, '.sdlc', 'state.yaml'), open)).toMatchObject({ ok: false })
      expect(opened).toHaveLength(1)
    })
  })

  describe('intake', () => {
    it('catalogues a fresh folder: three documents, ids in order, nothing skipped or ordered', async () => {
      withIntakeFolder()
      const r = await runIntake(project, PLUGIN.scriptsDir)
      expect(r.ok, r.error).toBe(true)
      expect(r.documents.map((d) => [d.id, d.file, d.type, d.skipped, d.priority])).toEqual([
        ['DOC-001', 'docs/intake/a.md', 'markdown', false, null],
        ['DOC-002', 'docs/intake/b.txt', 'text', false, null],
        ['DOC-003', 'docs/intake/c.md', 'markdown', false, null],
      ])
      expect(r.documents.every((d) => d.tokens > 0)).toBe(true)
      expect(r.locked).toBe(false)
      expect(r.priorityOrder).toEqual([])
      expect(r.totals).toEqual({ documents: 3, estimatedTokens: r.documents.reduce((n, d) => n + d.tokens, 0), activeDocuments: 3 })
    })

    it('skips a document, then orders the rest, and the second call keeps the first change', async () => {
      withIntakeFolder()
      await runIntake(project, PLUGIN.scriptsDir)
      const skipped = await runIntake(project, PLUGIN.scriptsDir, { skip: ['DOC-003'] })
      expect(skipped.documents.find((d) => d.id === 'DOC-003')?.skipped).toBe(true)
      expect(skipped.totals.activeDocuments).toBe(2)

      const ordered = await runIntake(project, PLUGIN.scriptsDir, { priority: ['DOC-002', 'DOC-001'] })
      expect(ordered.priorityOrder).toEqual(['DOC-002', 'DOC-001'])
      expect(ordered.documents.map((d) => [d.id, d.priority, d.skipped])).toEqual([
        ['DOC-001', 2, false], ['DOC-002', 1, false], ['DOC-003', null, true],
      ])
    })

    it('an id the catalogue does not have is the script\'s own one-line refusal and no table', async () => {
      withIntakeFolder()
      await runIntake(project, PLUGIN.scriptsDir)
      const r = await runIntake(project, PLUGIN.scriptsDir, { skip: ['DOC-099'] })
      expect(r).toMatchObject({ ok: false, error: 'unknown document id(s): DOC-099', documents: [] })
    })

    it('locks the ids, keeps the choices, and then refuses further changes in the script\'s own words', async () => {
      withIntakeFolder()
      await runIntake(project, PLUGIN.scriptsDir)
      await runIntake(project, PLUGIN.scriptsDir, { skip: ['DOC-003'] })
      const locked = await runIntake(project, PLUGIN.scriptsDir, { lock: true })
      expect(locked.ok, locked.error).toBe(true)
      expect(locked.locked).toBe(true)
      expect(locked.documents.find((d) => d.id === 'DOC-003')?.skipped).toBe(true)

      const refused = await runIntake(project, PLUGIN.scriptsDir, { skip: ['DOC-001'] })
      expect(refused.ok).toBe(false)
      expect(refused.error).toMatch(/^catalog is locked; DOC-NNN ids are stable/)
      expect(refused.error).not.toContain('�')
      expect(refused.error).not.toContain('\n')
      expect(refused.documents).toEqual([])

      // Reading a locked catalogue is still fine.
      expect((await runIntake(project, PLUGIN.scriptsDir)).locked).toBe(true)
    })

    it('an empty intake folder is an empty catalogue (the script exits 2), not an error', async () => {
      withIntakeFolder({})
      expect(await runIntake(project, PLUGIN.scriptsDir)).toEqual({
        ok: true, documents: [], locked: false, priorityOrder: [],
        totals: { documents: 0, estimatedTokens: 0, activeDocuments: 0 },
      })
    })

    it('a profile with no documentation section is an empty catalogue (the script exits 0)', async () => {
      const r = await runIntake(project, PLUGIN.scriptsDir)
      expect(r).toMatchObject({ ok: true, documents: [] })
    })

    it('a configured intake folder that does not exist is the script\'s own one-line error', async () => {
      appendFileSync(join(project, '.sdlc', 'profile.yaml'), '\ndocumentation:\n  intake_path: "docs/missing"\n')
      const r = await runIntake(project, PLUGIN.scriptsDir)
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/^Intake path not found/)
      expect(r.error).not.toContain('\n')
    })
  })

  describe('narrative coverage', () => {
    it('counts documents with a summary and lists the ones without', async () => {
      withNarratives()
      const r = await getNarrativeCoverage(project, PLUGIN.scriptsDir, '0')
      expect(r.ok, r.error).toBe(true)
      expect(r).toMatchObject({ hasData: true, withNarrative: 1, total: 3 })
      expect(r.artifacts.map((a) => [a.name, a.status])).toEqual([
        ['constitution', 'present'], ['constraints', 'none'], ['problem-statement', 'none'],
      ])
      // A project that is not a git repository cannot say whether a summary is stale.
      expect(r.artifacts.find((a) => a.name === 'constitution')?.stale).toBeNull()
    })

    it('a stage with no documents is hasData false with the plugin\'s note', async () => {
      const r = await getNarrativeCoverage(project, PLUGIN.scriptsDir, '0')
      expect(r).toMatchObject({ ok: true, hasData: false, total: 0, withNarrative: 0, artifacts: [] })
      expect(r.notes.length).toBeGreaterThan(0)
    })
  })

  describe('review standing and the strict check', () => {
    it('a project with nothing tracked reports zeros that the panel reads as "none recorded"', async () => {
      expect(await getReviewStanding(project, PLUGIN.scriptsDir)).toEqual({ ok: true, tracked: 0, openDebt: 0, fixedClaimMismatches: 0 })
      expect(await runStrictReviewCheck(project, PLUGIN.scriptsDir)).toEqual({ ok: true, mismatches: 0 })
    })

    it('reads the ledger: three tracked, one open, one marked fixed with no change to its file', async () => {
      withLedger()
      expect(await getReviewStanding(project, PLUGIN.scriptsDir)).toEqual({ ok: true, tracked: 3, openDebt: 1, fixedClaimMismatches: 1 })
    })

    it('--strict exits 2 on that ledger and Studio reports it as a result with the plugin\'s count', async () => {
      withLedger()
      expect(await runStrictReviewCheck(project, PLUGIN.scriptsDir)).toEqual({ ok: true, mismatches: 1 })
    })
  })

  describe('writes nothing but reports and the intake catalogue', () => {
    async function writesOf(action: () => Promise<unknown>): Promise<string[]> {
      const before = snapshot(project)
      await action()
      return differences(before, snapshot(project))
    }

    it('every action changes only .sdlc/reports/*.html and .sdlc/context/intake/catalog.json', async () => {
      withIntakeFolder()
      withLedger()
      withNarratives()
      const opened: string[] = []
      const open = async (p: string) => { opened.push(p); return '' }
      const actions: Array<[string, () => Promise<unknown>]> = [
        ['export one stage', () => exportPhaseReport(project, PLUGIN.scriptsDir, '0', false)],
        ['export all stages', () => exportPhaseReport(project, PLUGIN.scriptsDir, '0', true)],
        ['open a report', () => openReport(project, join(project, '.sdlc', 'reports', 'index.html'), open)],
        ['catalogue', () => runIntake(project, PLUGIN.scriptsDir)],
        ['skip', () => runIntake(project, PLUGIN.scriptsDir, { skip: ['DOC-003'] })],
        ['priority', () => runIntake(project, PLUGIN.scriptsDir, { priority: ['DOC-002', 'DOC-001'] })],
        ['lock', () => runIntake(project, PLUGIN.scriptsDir, { lock: true })],
        ['a refused change on a locked catalogue', () => runIntake(project, PLUGIN.scriptsDir, { skip: ['DOC-001'] })],
        ['narrative coverage', () => getNarrativeCoverage(project, PLUGIN.scriptsDir, '0')],
        ['review standing', () => getReviewStanding(project, PLUGIN.scriptsDir)],
        ['strict check', () => runStrictReviewCheck(project, PLUGIN.scriptsDir)],
      ]
      const unexpected: string[] = []
      const touched = new Set<string>()
      for (const [name, action] of actions) {
        for (const path of await writesOf(action)) {
          touched.add(path)
          if (!ALLOWED_WRITE.test(path)) unexpected.push(`${name}: ${path}`)
        }
      }
      expect(unexpected).toEqual([])
      expect(opened).toHaveLength(1)
      // The check is only meaningful if the actions did write what is allowed.
      expect(touched.has('.sdlc/context/intake/catalog.json')).toBe(true)
      expect(touched.has('.sdlc/reports/index.html')).toBe(true)
      expect(touched.has('.sdlc/reports/00-discovery-report.html')).toBe(true)
    })

    it('the read-only panels write nothing at all', async () => {
      withLedger()
      withNarratives()
      expect(await writesOf(() => getNarrativeCoverage(project, PLUGIN.scriptsDir, '0'))).toEqual([])
      expect(await writesOf(() => getReviewStanding(project, PLUGIN.scriptsDir))).toEqual([])
      expect(await writesOf(() => runStrictReviewCheck(project, PLUGIN.scriptsDir))).toEqual([])
    })
  })
})
