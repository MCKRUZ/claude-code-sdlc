/** A project with something on every screen, so the smoke run looks at populated screens, not empty ones.
 *
 * Built with the plugin's own scripts and the plugin's own document fixtures, then lightly arranged:
 *   - Discovery (the current stage) has its reference documents catalogued and locked, plus the
 *     analysis, so the intake, brief and registry panels have data.
 *   - Requirements has a real document, so a later stage's Documents tab has something to open.
 *   - The Build board has specs in every status and risk tier, and a team roster.
 * It is the project a new team would have a few days in, which is the state most screens are
 * actually seen in.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface SmokeProject {
  workspace: string
  project: string
  userData: string
}

export function buildSmokeProject(pluginRoot: string, scriptsDir: string, python: string, label: string): SmokeProject {
  const workspace = mkdtempSync(join(tmpdir(), 'studio-smoke-'))
  const project = join(workspace, 'project')
  const run = (script: string, ...args: string[]) => execFileSync(python, [join(scriptsDir, script), ...args], { cwd: scriptsDir })

  run('init_project.py', '--profile', join(pluginRoot, 'profiles', 'microsoft-enterprise', 'profile.yaml'), '--target', project)

  // Discovery: three reference documents, catalogued and locked, then the analysis on disk.
  const docs = join(project, 'docs', 'intake')
  mkdirSync(docs, { recursive: true })
  for (const name of ['rfp.md', 'api-notes.md', 'policy.md']) writeFileSync(join(docs, name), `# ${name}\n\nReference text for ${name}.\n`)
  const profile = join(project, '.sdlc', 'profile.yaml')
  writeFileSync(profile, `${readFileSync(profile, 'utf-8')}\ndocumentation:\n  intake_path: "docs/intake"\n  types: [markdown]\n`)
  const state = join(project, '.sdlc', 'state.yaml')
  run('intake_documents.py', '--state', state)
  run('intake_documents.py', '--state', state, '--lock')

  const fixtures = join(scriptsDir, 'tests', 'fixtures', 'documents')
  const discovery = join(project, '.sdlc', 'artifacts', '00-discovery')
  mkdirSync(discovery, { recursive: true })
  for (const name of ['contradiction-list.md', 'question-list.md', 'document-registry.md']) copyFileSync(join(fixtures, name), join(discovery, name))

  // A later stage's document, to open from its Documents tab.
  const requirements = join(project, '.sdlc', 'artifacts', '01-requirements')
  mkdirSync(requirements, { recursive: true })
  copyFileSync(join(fixtures, 'requirements.md'), join(requirements, 'requirements.md'))

  // The Build board: a roster and a spread of specs.
  copyFileSync(join(pluginRoot, 'templates', 'team', 'team.example.yaml'), join(project, '.sdlc', 'team.yaml'))
  const specs = join(project, 'specs')
  mkdirSync(specs, { recursive: true })
  const STATUS = ['draft', 'ready', 'in-flight', 'merged']
  const RISK = ['LOW', 'MEDIUM', 'HIGH']
  for (let i = 1; i <= 8; i++) {
    const id = String(i).padStart(4, '0')
    writeFileSync(join(specs, `${id}-sample-${i}.md`), `---
spec: "${id}"
name: "sample-${i}"
status: ${STATUS[i % 4]}
type: feature
risk: ${RISK[i % 3]}
owner: "@priya-n"
developer: "@sam-k"
checker: "@priya-n"
team: "core"
created: "2026-09-24"
---

# Spec ${id} — Sample change ${i}

## Goal
A change a team might be working on.
`, 'utf-8')
  }

  // A real project is a git repository; without one every screen would show a sync fault no user has.
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Smoke', '-c', 'user.email=smoke@example.com', ...args], { cwd: project })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'the project as a team would find it')

  const userData = join(workspace, 'userData')
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    recentProjects: [{ path: project, name: label, lastOpenedAt: new Date().toISOString() }],
    pluginScriptsPathOverride: scriptsDir,
  }, null, 2))

  return { workspace, project, userData }
}

/** A user who has never opened Studio: no recent projects, so the first screen is the empty welcome. */
export function buildFirstRunUserData(scriptsDir: string): { workspace: string; userData: string; location: string } {
  const workspace = mkdtempSync(join(tmpdir(), 'studio-smoke-first-'))
  const location = join(workspace, 'where-projects-live')
  const userData = join(workspace, 'userData')
  mkdirSync(location, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ recentProjects: [], pluginScriptsPathOverride: scriptsDir }))
  return { workspace, userData, location }
}
