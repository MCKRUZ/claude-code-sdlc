import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../electron/main/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/project')>()),
  runPluginScript: vi.fn(),
}))

import { gatherPipelineEvidence, parsePipelineEvidence } from '../electron/main/pipelineEvidence'
import { runPluginScript } from '../electron/main/project'
import type { ConsoleEntry } from '../shared/types'

// The shape pipeline_proof.py --json really emits (scripts/pipeline_proof.py), trimmed.
const SCRIPT_OUTPUT = {
  ok: true,
  repo: 'acme/app',
  gathered_at: '2026-10-02 18:41 UTC',
  rails: [
    { rail: 'ci', file: 'ci.yml', kind: 'blocking', status: 'PROVEN', reason: 'Went red on 12 pull request run(s).', runs: 100, red: 44,
      evidence: [{ label: 'PR #54', url: 'https://github.com/acme/app/pull/54' }] },
    { rail: 'grader', file: 'grader.yml', kind: 'advisory', status: 'BROKEN', reason: 'Errored on 7 of 100 run(s).', runs: 100, red: 7, evidence: [] },
    { rail: 'Stop gate', file: '.claude/hooks/stop-gate.ps1', kind: 'local', status: 'NO_DATA', reason: 'A local hook.', runs: null, red: null, evidence: [] },
  ],
  ruleset: { live: true, enforcing: true, enforcement: 'active', required: ['a', 'b', 'c'], missing_in_live: ['d'], extra_in_live: [], bypass_actors: [], created_at: 'x' },
  merge_history: { total_merged: 44, enforced_since: 'x', pre_enforcement: 25, post_enforcement: 19,
                   unapproved_post_enforcement: [{ label: 'PR #1', url: 'u' }, { label: 'PR #2', url: 'u' }] },
  proofs_needed: [{ rail: 'grader', proof: 'A planted mismatch.', touches: 'a spec' }],
  notes: [],
  wrote: '.sdlc/artifacts/03-foundation/pipeline-proof.md',
}

describe('parsePipelineEvidence — what the Foundation panel is allowed to show', () => {
  it('maps the script\'s snake_case output into what the panel draws', () => {
    const r = parsePipelineEvidence(JSON.stringify(SCRIPT_OUTPUT))
    expect(r.ok).toBe(true)
    expect(r.repo).toBe('acme/app')
    expect(r.gatheredAt).toBe('2026-10-02 18:41 UTC')
    expect(r.rails.map((x) => [x.rail, x.status])).toEqual([['ci', 'PROVEN'], ['grader', 'BROKEN'], ['Stop gate', 'NO_DATA']])
    expect(r.rails[0].evidence).toEqual([{ label: 'PR #54', url: 'https://github.com/acme/app/pull/54' }])
    expect(r.proofsNeeded).toEqual([{ rail: 'grader', proof: 'A planted mismatch.', touches: 'a spec' }])
    expect(r.wrote).toBe('.sdlc/artifacts/03-foundation/pipeline-proof.md')
  })

  it('keeps "no data" as null, never turning it into a zero', () => {
    const stop = parsePipelineEvidence(JSON.stringify(SCRIPT_OUTPUT)).rails[2]
    expect(stop.runs).toBeNull()
    expect(stop.red).toBeNull()
  })

  it('counts post-enforcement merges that had no approval', () => {
    expect(parsePipelineEvidence(JSON.stringify(SCRIPT_OUTPUT)).unapprovedMerges).toBe(2)
  })

  it('says when that count could not be known rather than reporting zero', () => {
    const out = { ...SCRIPT_OUTPUT, merge_history: { ...SCRIPT_OUTPUT.merge_history, unapproved_post_enforcement: null } }
    expect(parsePipelineEvidence(JSON.stringify(out)).unapprovedMerges).toBeNull()
  })

  it.each([
    ['enforcing', { live: true, enforcing: true, enforcement: 'active', required: ['a'], missing_in_live: [] }, /enforcing 1 required/i],
    ['enforcing', { live: true, enforcing: true, enforcement: 'active', required: ['a'], missing_in_live: ['d'] }, /1 expected check/i],
    ['not_enforcing', { live: true, enforcing: false, enforcement: 'evaluate', required: ['a'], missing_in_live: [] }, /evaluate/i],
    ['none', { live: false, enforcing: false, required: [], missing_in_live: [] }, /no branch ruleset/i],
    ['unreadable', { live: null, enforcing: null, error: 'HTTP 403', required: [], missing_in_live: null }, /403/],
  ])('protection state: %s', (state, ruleset, detail) => {
    const r = parsePipelineEvidence(JSON.stringify({ ...SCRIPT_OUTPUT, ruleset }))
    expect(r.protection?.state).toBe(state)
    expect(r.protection?.detail).toMatch(detail)
  })

  it('treats a status it does not recognise as NO_DATA — a new state must never display as a verdict', () => {
    const out = { ...SCRIPT_OUTPUT, rails: [{ ...SCRIPT_OUTPUT.rails[0], status: 'SOMETHING_NEW' }] }
    expect(parsePipelineEvidence(JSON.stringify(out)).rails[0].status).toBe('NO_DATA')
  })

  it('passes the script\'s own reason through when it could not read GitHub', () => {
    const r = parsePipelineEvidence(JSON.stringify({ ok: false, error: 'The `gh` CLI is not installed or not on PATH.' }))
    expect(r).toMatchObject({ ok: false, error: 'The `gh` CLI is not installed or not on PATH.', rails: [] })
  })

  it('is a clean failure, not a crash, on output that is not JSON', () => {
    const r = parsePipelineEvidence('Traceback (most recent call last): ...')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unreadable/i)
  })
})

describe('gatherPipelineEvidence', () => {
  beforeEach(() => vi.mocked(runPluginScript).mockReset())

  const entry = (over: Partial<ConsoleEntry>): ConsoleEntry => ({
    id: '1', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode: 0, ok: true, stdout: '', stderr: '', ...over,
  })

  it('runs the script read-only-by-contract against the project, asking it to write the document', async () => {
    vi.mocked(runPluginScript).mockResolvedValue(entry({ stdout: JSON.stringify(SCRIPT_OUTPUT) }))
    const r = await gatherPipelineEvidence('/proj', '/plugin/scripts')
    expect(r.ok).toBe(true)
    expect(runPluginScript).toHaveBeenCalledWith('/plugin/scripts', 'pipeline_proof.py', ['--repo', '/proj', '--write', '--json'])
  })

  it('reports the process\'s own error when the script could not run at all', async () => {
    vi.mocked(runPluginScript).mockResolvedValue(entry({ ok: false, exitCode: 2, stderr: 'can\'t open file pipeline_proof.py' }))
    const r = await gatherPipelineEvidence('/proj', '/plugin/scripts')
    expect(r).toMatchObject({ ok: false, rails: [] })
    expect(r.error).toMatch(/pipeline_proof\.py/)
  })
})

describe('host-aware wording (code-host providers, Wave 7-B)', () => {
  const ruleset = { live: null, enforcing: null, error: 'HTTP 403', required: [], missing_in_live: null }
  const noRuleset = { live: false, enforcing: false, required: [], missing_in_live: [] }

  it('with no host given the GitHub wording is byte-for-byte what it was', () => {
    expect(parsePipelineEvidence(JSON.stringify({ ...SCRIPT_OUTPUT, ruleset })).protection?.detail)
      .toBe("GitHub's rulesets could not be read: HTTP 403")
    expect(parsePipelineEvidence(JSON.stringify({ ...SCRIPT_OUTPUT, ruleset: noRuleset }), 'github').protection?.detail)
      .toBe('GitHub reports no branch ruleset, so nothing enforces the required checks.')
  })

  it('on Azure DevOps the protection line names the host and calls its rules branch policies', () => {
    expect(parsePipelineEvidence(JSON.stringify({ ...SCRIPT_OUTPUT, ruleset }), 'azure-devops').protection?.detail)
      .toBe("Azure DevOps's branch policies could not be read: HTTP 403")
    expect(parsePipelineEvidence(JSON.stringify({ ...SCRIPT_OUTPUT, ruleset: noRuleset }), 'azure-devops').protection?.detail)
      .toBe('Azure DevOps reports no branch policy, so nothing enforces the required checks.')
  })

  it('host none reads as GitHub — the CLI the script falls through to', () => {
    expect(parsePipelineEvidence(JSON.stringify({ ...SCRIPT_OUTPUT, ruleset }), 'none').protection?.detail).toMatch(/^GitHub's rulesets/)
  })

  it('gatherPipelineEvidence passes the host to the wording only — the argv is unchanged', async () => {
    vi.mocked(runPluginScript).mockReset()
    vi.mocked(runPluginScript).mockResolvedValue({
      id: '1', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode: 0, ok: true, stderr: '',
      stdout: JSON.stringify({ ...SCRIPT_OUTPUT, ruleset }),
    })
    const r = await gatherPipelineEvidence('/proj', '/plugin/scripts', 'azure-devops')
    expect(runPluginScript).toHaveBeenCalledWith('/plugin/scripts', 'pipeline_proof.py', ['--repo', '/proj', '--write', '--json'])
    expect(r.protection?.detail).toMatch(/^Azure DevOps's branch policies/)
  })
})
