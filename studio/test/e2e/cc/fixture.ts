/** Fixtures for the command-center specs (togo-command-center.md §7 P7), built by the plugin's
 * own scripts — init_project.py, new_spec.py, sprint.py, set_setting.py, track_decisions.py —
 * never by hand-written sprint records. The two hand edits are the ones the plugin itself never
 * makes and the existing e2e harness already allows: `current_phase` in state.yaml (every phase
 * fixture in this folder does this) and a spec's `status:` / `developer:` frontmatter line
 * (board.spec writes whole spec files by hand; here only the scaffolded line changes, because
 * `sprint.py` refuses to write `status` by design — sprint.py:16-18).
 *
 * Every helper returns the facts a test asserts against AS THE PLUGIN REPORTED THEM, so no spec
 * here hardcodes a number the plugin could have changed. */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { requirePlugin } from '../../pluginRoot'

export const root = resolve(import.meta.dirname, '..', '..', '..')

// Located once, in one place, and LOUD when it cannot be found. See test/pluginRoot.ts.
export const PLUGIN = requirePlugin(join(root, 'test'))
export const PLUGIN_ROOT = PLUGIN.root
export const SCRIPTS_DIR = PLUGIN.scriptsDir
export const VENV_PYTHON = PLUGIN.python

/** The three specs every command-center fixture scaffolds: one per risk tier, as sprint.spec does. */
export const SPEC_NAMES: ReadonlyArray<readonly [name: string, risk: string]> = [
  ['duplicate claim 409', 'HIGH'],
  ['claim export', 'MEDIUM'],
  ['adjuster notes', 'LOW'],
]

export const SPRINT_ID = 'S07'
export const SPRINT_GOAL = 'Adjusters file without a phone call'
/** A named human the plugin accepts on `--by` / `--to`. Never the signed-in actor — see shell.ts. */
export const HUMAN = 'Matt K.'
export const HANDOFF_TO = 'Sam K'
export const ROSTER_HANDLE = '@sam-k'

export interface PyResult { code: number; stdout: string; stderr: string }

/** Run a plugin script; exit 0 or throw. */
export function py(args: string[]): string {
  return execFileSync(VENV_PYTHON, args, { cwd: SCRIPTS_DIR, encoding: 'utf-8' })
}

/** Run a plugin script and KEEP its exit code and both streams — the plugin's own refusal text is
 * what the screens must show verbatim, so the tests need it as the plugin printed it. */
export function pyResult(args: string[]): PyResult {
  try {
    const stdout = execFileSync(VENV_PYTHON, args, { cwd: SCRIPTS_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer }
    return { code: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }
  }
}

export function pyJson<T = Record<string, unknown>>(args: string[]): T {
  return JSON.parse(pyResult(args).stdout) as T
}

export function script(name: string): string {
  return join(SCRIPTS_DIR, name)
}

export interface Fixture {
  workspace: string
  project: string
  userData: string
  specIds: string[]
  /** `specs/NNNN-name.md` by id. */
  specPath: Record<string, string>
}

/** A fresh project from the plugin's own profile, with the three scaffolded specs. The project is
 * a clone of a local bare `origin` (as the capture script's fixture is): `handoff.py` reads the
 * spec's branch on `origin` before anything else, and with no remote at all its refusal is git's
 * own `other`, never the DoR's `not_ready` the spec card must show. */
export function newProject(prefix: string): Fixture {
  const workspace = mkdtempSync(join(tmpdir(), `studio-e2e-${prefix}-`))
  const origin = join(workspace, 'origin.git')
  const project = join(workspace, 'project')
  execFileSync('git', ['init', '-q', '--bare', '--initial-branch=main', origin], { cwd: workspace, stdio: 'pipe' })
  execFileSync('git', ['clone', '-q', origin, project], { cwd: workspace, stdio: 'pipe' })
  py([script('init_project.py'), '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project])
  for (const [name, risk] of SPEC_NAMES) {
    py([script('new_spec.py'), '--repo', project, '--name', name, '--risk', risk, '--owner', '@priya-n', '--team', 'claims'])
  }
  const files = readdirSync(join(project, 'specs')).filter((f) => /^\d{4}-/.test(f)).sort()
  const specIds = files.map((f) => f.slice(0, 4))
  const specPath = Object.fromEntries(files.map((f) => [f.slice(0, 4), join(project, 'specs', f)]))
  const userData = join(workspace, 'userData')
  mkdirSync(userData, { recursive: true })
  return { workspace, project, userData, specIds, specPath }
}

/** The pattern every phase fixture in this folder uses (workflow.spec, documents.spec, …). */
export function setCurrentPhase(project: string, phase: string, name: string): void {
  const statePath = join(project, '.sdlc', 'state.yaml')
  writeFileSync(
    statePath,
    readFileSync(statePath, 'utf-8')
      .replace(/^current_phase:.*$/m, `current_phase: "${phase}"`)
      .replace(/^phase_name:.*$/m, `phase_name: "${name}"`),
    'utf-8',
  )
}

/** The Build loop is where the sprint home lives (`homeFor`, nav.ts). */
export function enterBuildLoop(project: string): void {
  setCurrentPhase(project, 'build', 'Build')
}

/** Change ONE scaffolded frontmatter line. `sprint.py` never writes `status` (by design), and
 * `spec_transition.py assign` is the only verb that writes `developer` — the lane partition
 * reads both, so the fixture sets them the way board.spec's hand-written specs do. */
export function setFrontmatter(specFile: string, key: 'status' | 'developer', value: string): void {
  const text = readFileSync(specFile, 'utf-8')
  const re = new RegExp(`^${key}:.*$`, 'm')
  if (!re.test(text)) throw new Error(`fixture spec ${specFile} has no '${key}:' line — update cc/fixture.ts`)
  writeFileSync(specFile, text.replace(re, `${key}: ${JSON.stringify(value)}`), 'utf-8')
}

/** The plugin's own worked example, then one more person through `set_setting.py person`. */
export function writeRoster(project: string): void {
  copyFileSync(join(PLUGIN_ROOT!, 'templates', 'team', 'team.example.yaml'), join(project, '.sdlc', 'team.yaml'))
  py([script('set_setting.py'), '--repo', project, '--json', 'person', ROSTER_HANDLE, '--name', HANDOFF_TO, '--team', 'claims', '--roles', 'developer', 'checker'])
}

export function newSprint(project: string, sprintId = SPRINT_ID, start = '2026-09-28'): void {
  py([
    script('sprint.py'), 'new', '--repo', project, '--sprint', sprintId, '--goal', SPRINT_GOAL,
    '--start', start, '--target', '3', '--mix', 'HIGH:1,MEDIUM:1,LOW:1', '--by', 'Priya N.',
  ])
}

export function slate(project: string, specIds: string[], sprintId = SPRINT_ID): void {
  py([script('sprint.py'), 'slate', '--repo', project, '--sprint', sprintId, ...specIds.flatMap((id) => ['--spec', id]), '--by', 'Priya N.'])
}

export function verdict(project: string, spec: string, lane: 'eng' | 'data', value: string): void {
  py([script('sprint.py'), 'verdict', '--repo', project, '--spec', spec, '--lane', lane, '--verdict', value, '--by', HUMAN])
}

export function handoffTo(project: string, spec: string, to: string): void {
  py([script('sprint.py'), 'handoff', '--repo', project, '--spec', spec, '--to', to, '--by', HUMAN])
}

/** `track_decisions.py open` creates the log from the plugin's template; an `--opened` date
 * 2+ business days back makes the clock overdue in the plugin's own arithmetic. */
export function openOverdueDecision(project: string, owner: string, decision: string): { id: string; due: string } {
  return pyJson<{ id: string; due: string }>([
    script('track_decisions.py'), '--repo', project, '--json', 'open', '--decision', decision, '--owner', owner, '--opened', '2026-09-01',
  ])
}

export function sprintStatus<T = Record<string, unknown>>(project: string, sprintId?: string): T {
  const args = [script('sprint.py'), 'status', '--repo', project, '--json']
  if (sprintId) args.push('--sprint', sprintId)
  return pyJson<T>(args)
}

/** Ledger lines by event name — the record a write verb leaves (sprint_model.py EVENTS). */
export function ledgerEvents(project: string, event?: string): Record<string, unknown>[] {
  const path = join(project, '.sdlc', 'metrics', 'sprint-log.jsonl')
  let text = ''
  try { text = readFileSync(path, 'utf-8') } catch { return [] }
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>)
  return event ? rows.filter((r) => r.event === event) : rows
}

export function specFrontmatter(specFile: string, key: string): string | null {
  const m = readFileSync(specFile, 'utf-8').match(new RegExp(`^${key}:\\s*"?([^"\\n#]*)"?`, 'm'))
  return m ? m[1].trim() : null
}
