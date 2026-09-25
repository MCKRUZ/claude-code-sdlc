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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { advanceAfterDeclaration, deferSpec, generateHandoffReport } from '../electron/main/board'
import { initSettingsPath } from '../electron/main/settings'
import { pull, save } from '../electron/main/sync'

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

describe.skipIf(!available)('the hand-over document carries the deferred items', () => {
  /** The part of spec 0014 that somebody reads months later.
   *
   * The generator was already capable of this — it assembles one line per deferred spec from
   * the specs themselves. What was missing was that Studio never asked it to. So the test
   * that matters is not "does the generator work" but "does declaring produce a document a
   * colleague can read, with the reasons in it".
   */

  const REPORT = '.sdlc/artifacts/close/final-handoff-report.md'
  let reportWorkspace = ''
  let reportOrigin = ''
  let reportProject = ''

  beforeAll(async () => {
    reportWorkspace = mkdtempSync(join(tmpdir(), 'studio-handoff-'))
    reportOrigin = join(reportWorkspace, 'origin.git')
    reportProject = join(reportWorkspace, 'project')
    git(['init', '--bare', '--initial-branch=main', reportOrigin], reportWorkspace)
    git(['clone', reportOrigin, reportProject], reportWorkspace)
    git(['config', 'user.email', 'test@example.com'], reportProject)
    git(['config', 'user.name', 'Test Person'], reportProject)

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', reportProject,
    ], { cwd: SCRIPTS_DIR })
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'new_spec.py'),
      '--repo', reportProject, '--name', 'vendor integration', '--risk', 'LOW',
    ], { cwd: SCRIPTS_DIR })

    git(['add', '-A'], reportProject)
    git(['commit', '-m', 'initial project'], reportProject)
    git(['push', '-u', 'origin', 'main'], reportProject)
    const first = await pull(reportProject, SCRIPTS_DIR)
    expect(first.ok, first.error).toBe(true)

    const deferred = await deferSpec(
      reportProject, SCRIPTS_DIR, 'specs/0001-vendor-integration.md', REASON, 'matt')
    expect(deferred.ok, deferred.refusal?.message).toBe(true)
  }, 180_000)

  afterAll(() => {
    if (reportWorkspace) rmSync(reportWorkspace, { recursive: true, force: true })
  })

  it('produces the document and saves it', async () => {
    const result = await generateHandoffReport(reportProject, SCRIPTS_DIR, { actor: 'matt' })
    expect(result.ok, result.error).toBe(true)
    expect(result.path).toBe(REPORT)
  }, 120_000)

  it('a colleague who was not there can read the deferral and its reason', () => {
    const colleague = join(reportWorkspace, 'colleague')
    git(['clone', reportOrigin, colleague], reportWorkspace)
    const doc = readFileSync(join(colleague, REPORT), 'utf-8')
    expect(doc).toContain('vendor-integration')
    expect(doc).toContain(REASON)
  }, 60_000)

  it('refuses to overwrite a document somebody has edited, and says so as a choice', async () => {
    const edited = readFileSync(join(reportProject, REPORT), 'utf-8')
      + '\n\nSomebody wrote this paragraph by hand.\n'
    writeFileSync(join(reportProject, REPORT), edited)

    const result = await generateHandoffReport(reportProject, SCRIPTS_DIR, { actor: 'matt' })
    expect(result.ok).toBe(false)
    expect(result.alreadyExists).toBe(true)
    // And the editing is still there — a refusal that destroyed the thing it refused to
    // overwrite would be worse than no refusal at all.
    expect(readFileSync(join(reportProject, REPORT), 'utf-8')).toContain('by hand')
  }, 120_000)

  it('replaces it only when explicitly told to', async () => {
    const result = await generateHandoffReport(
      reportProject, SCRIPTS_DIR, { actor: 'matt', replaceExisting: true })
    expect(result.ok, result.error).toBe(true)
    expect(readFileSync(join(reportProject, REPORT), 'utf-8')).not.toContain('by hand')
  }, 120_000)

  it('says the judgement sections still need a person', async () => {
    const doc = readFileSync(join(reportProject, REPORT), 'utf-8')
    // The numbers are assembled; the conclusions are not, and the document is explicit about
    // which is which rather than reading as finished.
    expect(doc).toContain('[Fill:')
  })
})

describe.skipIf(!available)('a document that did not exist before can still be saved', () => {
  /** The bug underneath the hand-over document, which was not about hand-over documents.
   *
   * A pull recorded a file that exists HERE but not on the remote as "first sync, already in
   * step", storing its current contents as the shared baseline. `save()` pulls before working
   * out what changed — so anything newly created was marked unchanged moments before the save
   * looked at it, and the save answered "nothing to save" while reporting success.
   *
   * Nothing Studio created could ever reach the repository. It went unnoticed because every
   * other test edits a file that was already there, which takes a different path entirely.
   */

  const NEW_DOC = '.sdlc/artifacts/close/lessons-learned.md'
  let ws = ''
  let originPath = ''
  let projectPath = ''

  beforeAll(async () => {
    ws = mkdtempSync(join(tmpdir(), 'studio-newfile-'))
    originPath = join(ws, 'origin.git')
    projectPath = join(ws, 'project')
    git(['init', '--bare', '--initial-branch=main', originPath], ws)
    git(['clone', originPath, projectPath], ws)
    git(['config', 'user.email', 'test@example.com'], projectPath)
    git(['config', 'user.name', 'Test Person'], projectPath)

    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', projectPath,
    ], { cwd: SCRIPTS_DIR })
    git(['add', '-A'], projectPath)
    git(['commit', '-m', 'initial project'], projectPath)
    git(['push', '-u', 'origin', 'main'], projectPath)
    expect((await pull(projectPath, SCRIPTS_DIR)).ok).toBe(true)
  }, 180_000)

  afterAll(() => {
    if (ws) rmSync(ws, { recursive: true, force: true })
  })

  it('reaches the repository on its first save', async () => {
    mkdirSync(join(projectPath, '.sdlc', 'artifacts', 'close'), { recursive: true })
    writeFileSync(join(projectPath, NEW_DOC), '# Lessons learned\n\nThe upstream vendor.\n')

    const result = await save(projectPath, SCRIPTS_DIR, 'wrote the lessons up', {
      onlyPath: NEW_DOC, actor: 'matt',
    })
    expect(result.ok, result.error).toBe(true)
    // The assertion that catches it: "nothing to save" came back as ok, so ok alone is not
    // evidence that anything was saved.
    expect(result.outcome).toBe('pushed_directly')

    const colleague = join(ws, 'colleague')
    git(['clone', originPath, colleague], ws)
    expect(readFileSync(join(colleague, NEW_DOC), 'utf-8')).toContain('The upstream vendor.')
  }, 120_000)

  it('a file already shared by both sides is still treated as in step', async () => {
    // The control. The branch that was wrong had a correct half — a file that exists on BOTH
    // sides with identical contents genuinely is the shared baseline, and must keep being
    // recorded as one or every pull would re-merge everything.
    await pull(projectPath, SCRIPTS_DIR)
    const again = await save(projectPath, SCRIPTS_DIR, 'no change at all', {
      onlyPath: NEW_DOC, actor: 'matt',
    })
    expect(again.ok).toBe(true)
    expect(again.outcome).toBeUndefined()
    expect(again.error).toMatch(/nothing to save/i)
  }, 120_000)
})

describe.skipIf(!available)('declaring records itself in the project', () => {
  /** Spec 0014's last two gaps, which are one piece of work.
   *
   * Before this, the screen said who declared Build finished and forgot it the moment the
   * window closed — true of one session rather than of the project. Moving the stage is what
   * writes the name and the time into the project's own record, so the declaration becomes a
   * fact somebody can find later rather than something they had to be present for.
   *
   * Studio decides none of it: `advance_phase.py` is the plugin's protected core and already
   * owns the transition, its gate checks and its sign-off recording.
   */

  let ws = ''
  let originPath = ''
  let projectPath = ''

  beforeAll(async () => {
    ws = mkdtempSync(join(tmpdir(), 'studio-advance-'))
    originPath = join(ws, 'origin.git')
    projectPath = join(ws, 'project')
    git(['init', '--bare', '--initial-branch=main', originPath], ws)
    git(['clone', originPath, projectPath], ws)
    git(['config', 'user.email', 'test@example.com'], projectPath)
    git(['config', 'user.name', 'Test Person'], projectPath)
    execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', projectPath,
    ], { cwd: SCRIPTS_DIR })
    git(['add', '-A'], projectPath)
    git(['commit', '-m', 'initial project'], projectPath)
    git(['push', '-u', 'origin', 'main'], projectPath)
    expect((await pull(projectPath, SCRIPTS_DIR)).ok).toBe(true)
  }, 180_000)

  afterAll(() => {
    if (ws) rmSync(ws, { recursive: true, force: true })
  })

  function phaseOf(root: string): string {
    const out = execFileSync(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'generate_status.py'), '--state', join(root, '.sdlc', 'state.yaml'), '--json',
    ], { cwd: SCRIPTS_DIR, encoding: 'utf-8' })
    return JSON.parse(out).current_phase.id
  }

  it('is refused without a name', async () => {
    const result = await advanceAfterDeclaration(projectPath, SCRIPTS_DIR, '   ')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/name/i)
  })

  it('is refused while the stage\'s own gates are not met, and says which', async () => {
    // A freshly initialised project has none of Phase 0's artifacts, so the plugin's gate
    // checks refuse. That refusal is the point: Studio must not be able to advance past a
    // gate the plugin would stop.
    const before = phaseOf(projectPath)
    const result = await advanceAfterDeclaration(projectPath, SCRIPTS_DIR, 'Matt K')
    expect(result.ok).toBe(false)
    // The plugin's own words, naming the gate — not a summary Studio invented.
    expect(result.error).toMatch(/NON-COMPLIANT|Missing|gate/i)
    expect(phaseOf(projectPath)).toBe(before)
  }, 120_000)

  it('a refused advance changes nothing that anybody else can see', () => {
    const colleague = join(ws, 'colleague-refused')
    git(['clone', originPath, colleague], ws)
    expect(phaseOf(colleague)).toBe('0')
  }, 60_000)

  // The CONTROL, and the half that actually matters. Everything above proves the advance
  // REFUSES; without this it would be indistinguishable from an advance that never works.
  // The five artifacts below are the plugin's own recipe for a Phase 0 whose gates pass
  // (scripts/tests/test_advance_signoff.py) — reused rather than reinvented, so this test
  // cannot drift away from what the plugin actually requires.
  const PHASE0: Record<string, string> = {
    'problem-statement.md':
      '# Problem Statement\n\nWe need a better claims process.\n\n## Scope\nIn scope: everything.\n',
    'constitution.md':
      '# Constitution\n\nCore principles and constraints for this project.\n',
    'success-criteria.md':
      '# Success Criteria\n\nThe project succeeds when all users can log in.\n',
    'constraints.md':
      '# Constraints\n\nMust use the existing infrastructure.\n',
    'phase1-handoff.md':
      '# Phase 1 Handoff\n\nReady for the requirements phase.\n',
  }

  it('advances once the gates are met, and records who signed it', async () => {
    const discovery = join(projectPath, '.sdlc', 'artifacts', '00-discovery')
    mkdirSync(discovery, { recursive: true })
    for (const [name, content] of Object.entries(PHASE0)) {
      writeFileSync(join(discovery, name), content)
    }
    git(['add', '-A'], projectPath)
    git(['commit', '-m', 'discovery artifacts'], projectPath)
    git(['push', 'origin', 'main'], projectPath)
    await pull(projectPath, SCRIPTS_DIR)

    const result = await advanceAfterDeclaration(projectPath, SCRIPTS_DIR, 'Matt K')
    expect(result.ok, result.error).toBe(true)
    expect(result.fromPhase).toBe('0')
    expect(result.toPhase).not.toBe('0')
    expect(result.signedBy).toBe('Matt K')
    expect(phaseOf(projectPath)).toBe(result.toPhase)
  }, 180_000)

  it('the declaration outlives the window — a colleague can see who signed and when', () => {
    // The whole point of the last two gaps. Before this, the screen said who declared Build
    // finished and forgot it when the window closed.
    const colleague = join(ws, 'colleague-advanced')
    git(['clone', originPath, colleague], ws)
    expect(phaseOf(colleague)).not.toBe('0')

    const state = readFileSync(join(colleague, '.sdlc', 'state.yaml'), 'utf-8')
    expect(state).toContain('Matt K')
    expect(state).toMatch(/completed_at/)
  }, 60_000)
})
