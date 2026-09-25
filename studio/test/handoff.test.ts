/** Handing a spec to a developer (spec 0011).
 *
 * Two halves, tested differently on purpose.
 *
 * The pure half is how the command's answer is read. That is where a hand-off could quietly
 * be reported as having happened when it did not — the one failure here with real
 * consequences, because a person who believes it worked stops chasing it.
 *
 * The real half is one live call against an actual project, proving that Studio surfaces the
 * plugin's own refusal rather than a story of its own. Every rule about who may be handed
 * what lives in the plugin, and the spec's Checking Plan tells the reviewer to confirm no
 * rule is enforced only in the app — so the test that matters is that a refusal Studio never
 * implemented still reaches the screen intact.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { handOff, readHandoffOutput } from '../electron/main/handoff'
import { requirePlugin } from './pluginRoot'

describe('readHandoffOutput', () => {
  it('carries a refusal through with its kind intact', () => {
    const out = JSON.stringify({
      ok: false,
      refusal: { kind: 'team_at_limit', message: "Team 'core' is at its WIP limit: 2 in-flight, limit 2" },
    })
    const result = readHandoffOutput(out, '', '@sam-k')
    expect(result.ok).toBe(false)
    expect(result.refusal).toEqual({
      kind: 'team_at_limit',
      message: "Team 'core' is at its WIP limit: 2 in-flight, limit 2",
    })
  })

  it('treats a kind it has never heard of as "other" rather than crashing', () => {
    // The plugin may add a refusal kind before Studio knows about it. Falling back to a
    // plain refusal shows the person the real message; throwing would show them nothing.
    const out = JSON.stringify({ ok: false, refusal: { kind: 'a_new_rule', message: 'Nope.' } })
    expect(readHandoffOutput(out, '', '@sam-k').refusal).toEqual({ kind: 'other', message: 'Nope.' })
  })

  it('an unreadable answer is a refusal, NEVER a success', () => {
    // The command refuses before it changes anything, so nothing happened. Reporting this
    // as success is the one outcome here with a real cost: the person stops chasing it.
    for (const [stdout, stderr] of [['', 'python: no such file'], ['not json at all', ''], ['', '']]) {
      const result = readHandoffOutput(stdout, stderr, '@sam-k')
      expect(result.ok).toBe(false)
      expect(result.refusal!.kind).toBe('other')
      expect(result.refusal!.message).toBeTruthy()
    }
  })

  it('reads a success, including the code-host assignment failing on its own', () => {
    // A real and important state: the branch and commit exist, but nobody was told. Hiding
    // it would leave someone waiting for a review request that was never sent.
    const out = JSON.stringify({
      ok: true, already_in_flight: false, branch: 'spec/0042-x', developer: '@sam-k',
      checker: '@priya-n', pr_url: null, assignment_error: 'gh: not authenticated',
    })
    expect(readHandoffOutput(out, '', '@sam-k')).toMatchObject({
      ok: true, branch: 'spec/0042-x', developer: '@sam-k',
      checker: '@priya-n', prUrl: null, assignmentError: 'gh: not authenticated',
    })
  })

  it('reports an already-in-flight spec as a success that changed nothing', () => {
    const out = JSON.stringify({ ok: true, already_in_flight: true, developer: '@sam-k', branch: 'spec/0042-x' })
    expect(readHandoffOutput(out, '', '@sam-k')).toMatchObject({ ok: true, alreadyInFlight: true })
  })

  it('missing fields do not become the string "undefined" on screen', () => {
    const result = readHandoffOutput(JSON.stringify({ ok: true }), '', '@sam-k')
    expect(result.branch).toBe('')
    expect(result.developer).toBe('@sam-k') // falls back to what was asked for
    expect(result.checker).toBeNull()
  })
})

// --- the real thing -------------------------------------------------------------------

// Located once, in one place, and LOUD when it cannot be found — a run that skipped the
// integration tests used to report success, which is how a run that proved nothing came
// to look like a run that proved everything. See test/pluginRoot.ts.
const PLUGIN = requirePlugin(__dirname)

const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const VENV_PYTHON = PLUGIN.python
const available = PLUGIN.available

let workspace = ''
afterAll(() => { if (workspace) rmSync(workspace, { recursive: true, force: true }) })

describe.skipIf(!available)('handing off for real', () => {
  it("surfaces the plugin's own refusal, which Studio never implemented", async () => {
    workspace = mkdtempSync(join(tmpdir(), 'studio-handoff-'))
    const origin = join(workspace, 'origin.git')
    const project = join(workspace, 'project')
    const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf-8' })

    // A real remote first. Hand-off resolves the default branch before it checks anything
    // else, so a project with no remote refuses for THAT reason and never reaches the rule
    // this test is about. (The first version of this test skipped the remote and read the
    // resulting refusal as the wrong one — the fixture was incomplete, not the code.)
    git(['init', '--bare', '--initial-branch=main', origin], workspace)
    git(['clone', origin, project], workspace)
    git(['config', 'user.email', 'test@example.com'], project)
    git(['config', 'user.name', 'Test Person'], project)

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })
    git(['add', '-A'], project)
    git(['commit', '-m', 'initial'], project)
    git(['push', '-u', 'origin', 'main'], project)

    // A freshly scaffolded spec is deliberately not ready — it is a template with its
    // decisions unanswered. That is a rule Studio has no copy of.
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'new_spec.py'), '--repo', project, '--name', 'a test spec', '--risk', 'LOW',
    ], { cwd: SCRIPTS_DIR })

    const result = await handOff(project, SCRIPTS_DIR, 'specs/0001-a-test-spec.md', '@sam-k')

    expect(result.ok).toBe(false)
    expect(result.refusal!.kind).toBe('not_ready')
    // The plugin's own words reach the screen — not a paraphrase Studio wrote.
    expect(result.refusal!.message).toMatch(/not ready/i)
    expect(result.refusal!.message).toMatch(/blocking issue/i)
  }, 120_000)
})
