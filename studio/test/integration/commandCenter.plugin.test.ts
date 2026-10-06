/** The command center against the REAL plugin scripts in a project init_project.py made
 * (togo-command-center.md §7 P3 acceptance): the read model's blocks, a `slate` through the closed
 * argv table (exit 0 + exactly one ledger line), the plugin's own exit-1 and exit-2 texts for the
 * two refusals the table mirrors or never offers, a refused AI actor, decisions opened and decided,
 * the spec card, and the read-only promise. Verbs that arrive with P1/P2 (`list`, `log`,
 * `handoff --check`, `confirm-tier`) run only when the checkout declares the capability. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getCapabilities, getCommandCenter, invalidateCommandCenter } from '../../electron/main/commandCenter'
import { runSprintVerb } from '../../electron/main/sprintWrites'
import { decideDecision, getDecisions, openDecision } from '../../electron/main/decisions'
import { confirmTier, getReadinessAll, getSpecCard } from '../../electron/main/specCard'
import { checkHandOff } from '../../electron/main/handoff'
import { getSlateProposal } from '../../electron/main/sprint'
import { runPluginScript } from '../../electron/main/project'
import { newerPlugin } from '../../shared/reasons'
import { requirePlugin } from '../pluginRoot'

const PLUGIN = requirePlugin(join(__dirname, '..'))
const ACTOR = { name: '@priya-n', source: 'roster' as const }

const py = (args: string[], cwd: string) => execFileSync(PLUGIN.python, args, { cwd, encoding: 'utf-8' })

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
  walk(join(project, '.sdlc')); walk(join(project, 'specs'))
  return out
}
const differences = (a: Map<string, string>, b: Map<string, string>) => [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p)).sort()
const ledger = (project: string) => {
  const p = join(project, '.sdlc', 'metrics', 'sprint-log.jsonl')
  return existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : []
}

describe.skipIf(!PLUGIN.available)('the command center against the real plugin', () => {
  let project = ''
  let specIds: string[] = []
  let caps: string[] = []
  const scripts = () => PLUGIN.scriptsDir

  beforeAll(async () => {
    project = mkdtempSync(join(tmpdir(), 'studio-cc-e2e-'))
    py([join(scripts(), 'init_project.py'), '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project], scripts())
    for (const [name, risk] of [['duplicate claim 409', 'HIGH'], ['claim export', 'MEDIUM'], ['adjuster notes', 'LOW']]) {
      py([join(scripts(), 'new_spec.py'), '--repo', project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'], scripts())
    }
    specIds = readdirSync(join(project, 'specs')).filter((f) => /^\d{4}-/.test(f)).map((f) => f.slice(0, 4)).sort()
    py([join(scripts(), 'sprint.py'), 'new', '--repo', project, '--sprint', 'S07', '--goal', 'Adjusters file without a phone call', '--start', '2026-09-28', '--target', '3', '--by', 'Priya N.'], scripts())
    py([join(scripts(), 'sprint.py'), 'slate', '--repo', project, '--sprint', 'S07', '--spec', specIds[0], '--spec', specIds[1], '--by', 'Priya N.'], scripts())
    caps = await getCapabilities(project, scripts())
  }, 120_000)

  afterAll(() => { if (project) rmSync(project, { recursive: true, force: true }) })

  it('reads every block from the real scripts: sprint, board (no WIP warnings), decisions exists:false, findings, scorecard, roster', async () => {
    const cc = await getCommandCenter(project, scripts(), 1, { actor: ACTOR, refresh: true })
    expect(cc.capabilities).toEqual(caps); expect(cc.capabilities).toContain('sprint-status')
    expect(cc.sprint.ok, cc.sprint.error ?? '').toBe(true); expect(cc.sprint.data!.sprint!.id).toBe('S07'); expect(cc.sprint.data!.slate.map((s) => s.id)).toEqual(specIds.slice(0, 2))
    expect(cc.board.ok, cc.board.error ?? '').toBe(true); expect(cc.board.data!.rows.map((r) => r.spec)).toEqual(specIds); expect(cc.board.data!.warnings).toEqual([])
    expect(cc.decisions.ok, cc.decisions.error ?? '').toBe(true); expect(cc.decisions.data).toMatchObject({ exists: false, open: 0, openDecisions: [] })
    expect(cc.findings.ok, cc.findings.error ?? '').toBe(true); expect(cc.findings.data).toMatchObject({ tracked: 0, openDebt: 0 })
    expect(cc.scorecard.ok, cc.scorecard.error ?? '').toBe(true); expect(cc.scorecard.data!.accepted_as_is_rate).toBeNull()
    expect(cc.roster.ok, cc.roster.error ?? '').toBe(true); expect(cc.roster.data!.present).toBe(false)
    for (const [cap, block] of [['sprint-list', cc.sprints], ['sprint-log', cc.log]] as const) {
      if (caps.includes(cap)) expect(block.ok, block.error ?? '').toBe(true)
      else expect(block).toMatchObject({ ok: false, data: null, error: newerPlugin(cap) })
    }
    expect(cc.needsYou).toEqual([]); expect(cc.needsYouReason).toBeNull()
  })

  it('slate through the closed argv table: exit 0, Done, exactly one new `slated` ledger line, the spec carries sprint: S07', async () => {
    const before = ledger(project).length
    const r = await runSprintVerb(project, scripts(), { verb: 'slate', sprint: 'S07', specs: [specIds[2]] }, ACTOR, caps)
    expect(r, r.stderr).toMatchObject({ ok: true, exitCode: 0, refused: false, verb: 'slate' })
    expect(r.argv).toEqual(['slate', '--state', join(project, '.sdlc', 'state.yaml'), '--sprint', 'S07', '--spec', specIds[2], '--by', '@priya-n'])
    const lines = ledger(project)
    expect(lines.length).toBe(before + 1); expect(lines.at(-1)).toMatchObject({ event: 'slated', sprint: 'S07', by: '@priya-n' })
    const cc = await getCommandCenter(project, scripts(), 1, { actor: ACTOR })
    expect(cc.sprint.data!.slate.map((s) => s.id)).toEqual(specIds)   // the write invalidated the cached block
  })

  it('verdict n-a without a reason: the table refuses before spawning with the mirrored rule; the plugin\'s own exit-1 text is unchanged', async () => {
    const mirrored = await runSprintVerb(project, scripts(), { verb: 'verdict', spec: specIds[0], lane: 'data', verdict: 'n-a' }, ACTOR, caps)
    expect(mirrored).toMatchObject({ ok: false, exitCode: null, stderr: 'n-a needs a reason' })
    const direct = await runPluginScript(scripts(), 'sprint.py', ['verdict', '--repo', project, '--spec', specIds[0], '--lane', 'data', '--verdict', 'n-a', '--by', '@priya-n'])
    // sprint.py prints its refusal line on stdout; the dialog shows both streams verbatim.
    expect(direct.exitCode).toBe(1); expect(direct.stdout + direct.stderr).toContain('data n-a needs --reason')
  })

  it('--field points=3 is exit 2 in the plugin (an activity metric) — and the table has no way to send it', async () => {
    const direct = await runPluginScript(scripts(), 'sprint.py', ['verdict', '--repo', project, '--spec', specIds[0], '--lane', 'eng', '--verdict', 'accepted', '--by', '@priya-n', '--field', 'points=3'])
    expect(direct.exitCode).toBe(2); expect(direct.stdout + direct.stderr).toContain("Refused: 'points' is an activity metric")
    expect(ledger(project).some((l) => 'points' in l)).toBe(false)
  })

  it('an AI-looking actor is Refused by the plugin (exit 2) with its sentence verbatim', async () => {
    const r = await runSprintVerb(project, scripts(), { verb: 'verdict', spec: specIds[0], lane: 'eng', verdict: 'accepted' }, { name: 'Claude', source: 'typed' }, caps)
    expect(r).toMatchObject({ ok: false, exitCode: 2, refused: true }); expect(r.stdout + r.stderr).toMatch(/Refused: --by 'Claude' reads as an AI\/automation/)
  })

  it('decisions: open creates the log and allocates DL-01 owned by the actor; it then needs the owner; decide closes it', async () => {
    const opened = await openDecision(project, scripts(), 'Fail open or closed?', undefined, ACTOR)
    expect(opened).toMatchObject({ ok: true, id: 'DL-01', owner: '@priya-n' })
    const view = await getDecisions(project, scripts())
    expect(view).toMatchObject({ exists: true, open: 1 }); expect(view.openDecisions[0]).toMatchObject({ id: 'DL-01', owner: '@priya-n', overdue: false })
    const cc = await getCommandCenter(project, scripts(), 1, { actor: ACTOR })
    expect(cc.needsYou).toEqual([expect.objectContaining({ kind: 'decide', id: 'DL-01', text: 'Fail open or closed?' })])
    const decided = await decideDecision(project, scripts(), 'DL-01', 'Fail closed', ACTOR)
    expect(decided).toMatchObject({ ok: true, id: 'DL-01', status: 'decided', by: '@priya-n' })
    expect((await getDecisions(project, scripts())).open).toBe(0)
    const refused = await decideDecision(project, scripts(), 'DL-09', 'x', ACTOR)
    expect(refused.ok).toBe(false); expect(!refused.ok && refused.stderr).toMatch(/no decision DL-09/)
  })

  it('the spec card: DoR findings from the protected checker, status without a host, no channel bound, no developer → no hand-off block', async () => {
    const relPath = `specs/${readdirSync(join(project, 'specs')).find((f) => f.startsWith(specIds[0]))}`
    const card = await getSpecCard(project, scripts(), relPath)
    expect(card.spec).toBe(specIds[0])
    expect(card.readiness.ok, card.readiness.error ?? '').toBe(true); expect(card.readiness.data!.ready).toBe(false); expect(card.readiness.data!.blocking.length).toBeGreaterThan(0)
    expect(card.status.ok, card.status.error ?? '').toBe(true); expect(card.status.data!.code_host_available).toBe(false)
    expect(card.channel).toBeNull(); expect(card.handoffCheck).toBeNull()
    if (caps.includes('readiness-all')) expect(card.ladder.data!.rungs.length).toBeGreaterThan(0)
    else expect(card.ladder).toMatchObject({ ok: false, error: newerPlugin('readiness-all') })
    expect(await getReadinessAll(project, scripts())).toMatchObject(caps.includes('readiness-all') ? { ok: true } : { ok: false, specs: [] })
  })

  it('the slate proposal is the plugin\'s read-only document for S07', async () => {
    const r = await getSlateProposal(project, scripts(), 'S07')
    expect(r.ok, r.ok ? '' : r.error).toBe(true); expect(r.ok && r.data.sprint).toBe('S07'); expect(r.ok && r.data.alreadySlated).toEqual(specIds)
  })

  it('confirm-tier without the capability is refused before any spawn; with it, the plugin writes the key', async () => {
    const relPath = `specs/${readdirSync(join(project, 'specs')).find((f) => f.startsWith(specIds[1]))}`
    const before = snapshot(project)
    const r = await confirmTier(project, scripts(), relPath, ACTOR, caps)
    if (!caps.includes('confirm-tier')) {
      expect(r.refusal!.message).toBe(newerPlugin('confirm-tier')); expect(differences(before, snapshot(project))).toEqual([])
    } else {
      expect(r).toMatchObject({ ok: true, changed: true }); expect(readFileSync(join(project, relPath), 'utf-8')).toContain('risk_confirmed_by:')
    }
  })

  it('handoff --check (when the plugin has it) is the plugin\'s refusal and leaves `git branch --list` and every file unchanged', async () => {
    if (!caps.includes('handoff-check')) return   // arrives with P2; the capability gate is what the card reads
    // handoff.py reads the spec's branch on `origin` before anything else, so the dry run needs a remote.
    const origin = mkdtempSync(join(tmpdir(), 'studio-cc-origin-'))
    const git = (args: string[], cwd = project) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf-8' })
    git(['init', '-q', '--bare'], origin)
    git(['init', '-q']); git(['add', '-A']); git(['commit', '-q', '-m', 'init']); git(['remote', 'add', 'origin', origin]); git(['push', '-q', '-u', 'origin', 'HEAD'])
    const branches = () => git(['branch', '--list'])
    const relPath = `specs/${readdirSync(join(project, 'specs')).find((f) => f.startsWith(specIds[0]))}`
    const before = snapshot(project), branchesBefore = branches()
    try {
      const r = await checkHandOff(project, scripts(), relPath, '@sam-k')
      expect(r.ok).toBe(false); expect(!r.ok && r.refusal.kind).toBe('not_ready'); expect(!r.ok && r.refusal.message).toMatch(/NOT READY|not ready/i)
      expect(branches()).toBe(branchesBefore); expect(differences(before, snapshot(project))).toEqual([])
    } finally {
      rmSync(origin, { recursive: true, force: true })
    }
  })

  it('reading the command center and a spec card changes nothing under .sdlc/ or specs/', async () => {
    invalidateCommandCenter(project, 'all')
    const before = snapshot(project)
    await getCommandCenter(project, scripts(), 3, { actor: null })
    await getSpecCard(project, scripts(), `specs/${readdirSync(join(project, 'specs')).find((f) => f.startsWith(specIds[2]))}`)
    expect(differences(before, snapshot(project))).toEqual([])
  })
})
