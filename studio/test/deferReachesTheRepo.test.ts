/** Deferring a spec reaches the repository (spec 0014).
 *
 * The gap this closes was the most consequential of spec 0014's unbuilt items, and the least
 * visible: deferring wrote the status and the reason into the spec file, correctly, through the
 * plugin — and then stopped. On the machine that did it, the screen refreshed and the spec
 * moved to "deferred, and why". To everybody else, nothing had happened at all.
 *
 * That asymmetry is worse here than almost anywhere else in the product, because a deferral is
 * precisely the thing somebody ELSE goes looking for later — when they ask why a feature they
 * expected is not there, and the answer is supposed to be waiting for them in the record.
 *
 * So this is tested against a real git remote rather than a mock. A mock would prove the call
 * was made; only a real remote proves the reason is readable by the next person to clone.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deferSpec } from '../electron/main/board'
import { initSettingsPath } from '../electron/main/settings'
import { pull } from '../electron/main/sync'

function findPluginRoot(): string | null {
  const candidates = [
    process.env.SDLC_PLUGIN_ROOT,
    resolve(__dirname, '..', '..', 'claude-code-sdlc'),
  ].filter((c): c is string => Boolean(c))
  return candidates.find((c) => existsSync(join(c, 'scripts', 'document_shape_cli.py'))) ?? null
}

const PLUGIN_ROOT = findPluginRoot()
const SCRIPTS_DIR = PLUGIN_ROOT ? join(PLUGIN_ROOT, 'scripts') : ''
const VENV_PYTHON = PLUGIN_ROOT ? join(SCRIPTS_DIR, '.venv', 'Scripts', 'python.exe') : ''
const available = Boolean(PLUGIN_ROOT) && existsSync(VENV_PYTHON)

const SPEC_REL = 'specs/0001-upstream-thing.md'
const REASON = 'the upstream service slipped a quarter and this cannot ship without it'

let workspace = ''
let origin = ''
let project = ''

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

describe.skipIf(!available)('deferring a spec reaches the repository', () => {
  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'studio-defer-'))
    initSettingsPath(join(workspace, 'userData'))

    origin = join(workspace, 'origin.git')
    project = join(workspace, 'project')
    git(['init', '--bare', '--initial-branch=main', origin], workspace)
    git(['clone', origin, project], workspace)
    git(['config', 'user.email', 'test@example.com'], project)
    git(['config', 'user.name', 'Test Person'], project)

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: SCRIPTS_DIR })

    // A real spec, scaffolded by the plugin's own command rather than hand-written, so the
    // frontmatter is whatever the shipped template actually produces.
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'new_spec.py'),
      '--repo', project, '--name', 'upstream thing', '--risk', 'LOW',
    ], { cwd: SCRIPTS_DIR })
    expect(existsSync(join(project, SPEC_REL))).toBe(true)

    git(['add', '-A'], project)
    git(['commit', '-m', 'initial project'], project)
    git(['push', '-u', 'origin', 'main'], project)

    // Establish the shared starting point, the way opening a project does.
    const first = await pull(project, SCRIPTS_DIR)
    expect(first.ok, first.error).toBe(true)
  }, 180_000)

  afterAll(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  let deferral: Awaited<ReturnType<typeof deferSpec>>

  it('writes the deferral and its reason into the spec', async () => {
    deferral = await deferSpec(project, SCRIPTS_DIR, SPEC_REL, REASON, 'matt')
    expect(deferral.ok, deferral.refusal?.message).toBe(true)
    expect(deferral.changed).toBe(true)

    const text = readFileSync(join(project, SPEC_REL), 'utf-8')
    expect(text).toContain('status: deferred')
    expect(text).toContain(REASON)
  }, 120_000)

  it('SAYS it reached the repository, rather than leaving that ambiguous', () => {
    // The person needs to know which of the two halves they have. "Deferred" on its own is
    // the sentence that was true on one machine and false everywhere else, so the result has
    // to distinguish them in words rather than leaving it to be assumed.
    expect(deferral.note).toMatch(/repository/i)
  })

  it('the deferral is visible to somebody who was not there — a fresh clone', () => {
    // The assertion that actually matters. Reading the working copy only proves the file
    // changed on this machine, which is exactly the state that looked correct before.
    const colleague = join(workspace, 'colleague')
    git(['clone', origin, colleague], workspace)

    const asOthersSeeIt = readFileSync(join(colleague, SPEC_REL), 'utf-8')
    expect(asOthersSeeIt).toContain('status: deferred')
    expect(asOthersSeeIt).toContain(REASON)
  }, 60_000)

  it('the reason survives as the sentence somebody typed', () => {
    const colleague = join(workspace, 'colleague')
    const fm = readFileSync(join(colleague, SPEC_REL), 'utf-8').split('\n---')[0]
    const line = fm.split('\n').find((l) => l.startsWith('deferred_reason:'))!
    // Whatever quoting the serializer chose, the sentence reads back intact — no escapes
    // showing through, which is what the per-value quote choice is for.
    expect(line).toContain(REASON)
  })

  it('deferring an already-deferred spec saves nothing a second time', async () => {
    const before = git(['rev-parse', 'HEAD'], project)
    const again = await deferSpec(project, SCRIPTS_DIR, SPEC_REL, 'a different reason entirely', 'matt')
    expect(again.ok).toBe(true)
    expect(again.changed).toBe(false)
    // No empty commit for a button press that changed nothing.
    expect(git(['rev-parse', 'HEAD'], project)).toBe(before)
  }, 120_000)

  it('a refused deferral writes nothing and saves nothing', async () => {
    const before = git(['rev-parse', 'HEAD'], project)
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'new_spec.py'),
      '--repo', project, '--name', 'second thing', '--risk', 'LOW',
    ], { cwd: SCRIPTS_DIR })
    const second = 'specs/0002-second-thing.md'
    const text = readFileSync(join(project, second), 'utf-8')

    const result = await deferSpec(project, SCRIPTS_DIR, second, 'later', 'matt')
    expect(result.ok).toBe(false)
    expect(result.refusal?.kind).toBe('reason_too_short')
    expect(readFileSync(join(project, second), 'utf-8')).toBe(text)
    expect(git(['rev-parse', 'HEAD'], project)).toBe(before)

    writeFileSync(join(project, second), text)
    rmSync(join(project, second))
  }, 120_000)
})
