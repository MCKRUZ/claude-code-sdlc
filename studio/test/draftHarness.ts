/** Shared pieces for the model-runner tests (spec 0027): a real project made by the plugin's own
 * init_project.py, the stand-in `claude` (fixtures/fake-claude.mjs) and a SHA-256 snapshot of a
 * project's files. Not a test file itself. No test that uses this calls the live model. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import type { AgentLaunch } from '../electron/main/agentRun'
import type { DraftDeps } from '../electron/main/draftDocuments'
import type { PluginLocation } from './pluginRoot'

const FAKE_CLAUDE = join(__dirname, 'fixtures', 'fake-claude.mjs')

export const SOURCE_REL = '.sdlc/artifacts/01-requirements/requirements.md'
export const NARRATIVE_REL = '.sdlc/artifacts/01-requirements/requirements.narrative.md'
export const REVIEW_REL = '.sdlc/artifacts/01-requirements/review-report.md'

export function makeProject(plugin: PluginLocation, sourceText = '# Requirements\n\nFR-001 The system shall exist.\n'): string {
  const project = mkdtempSync(join(tmpdir(), 'studio-draft-'))
  execFileSync(plugin.python, [
    join(plugin.scriptsDir, 'init_project.py'),
    '--profile', join(plugin.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
    '--target', project,
  ], { cwd: plugin.scriptsDir })
  mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
  writeFileSync(join(project, SOURCE_REL), sourceText)
  return project
}

export interface Fake {
  launch: AgentLaunch
  /** What the stand-in recorded about its own run: the arguments it received, where it ran, its pid. */
  recorded: () => { argv: string[]; cwd: string; pid: number }
  hasRun: () => boolean
}

/** A stand-in launch. `text` is what a successful run answers with. */
export function fakeClaude(mode: string, opts: { text?: string; writeTarget?: string } = {}): Fake {
  const dir = mkdtempSync(join(tmpdir(), 'studio-fake-claude-'))
  const record = join(dir, 'record.json')
  const argsPrefix = [FAKE_CLAUDE, '--fake-mode', mode, '--fake-record', record]
  if (opts.text !== undefined) {
    const textFile = join(dir, 'text.md')
    writeFileSync(textFile, opts.text)
    argsPrefix.push('--fake-text-file', textFile)
  }
  if (opts.writeTarget) argsPrefix.push('--fake-write-target', opts.writeTarget)
  return {
    launch: { command: process.execPath, argsPrefix },
    recorded: () => JSON.parse(readFileSync(record, 'utf-8')),
    hasRun: () => { try { readFileSync(record); return true } catch { return false } },
  }
}

export function deps(fake: Fake): DraftDeps & { sent: Array<{ channel: string; payload: unknown }> } {
  const sent: Array<{ channel: string; payload: unknown }> = []
  return { launch: fake.launch, send: (channel, payload) => { sent.push({ channel, payload }) }, sent }
}

const posix = (path: string) => path.split('\\').join('/')

/** relative path (posix) -> SHA-256 of every file under the project, `.git` excluded. */
export function snapshot(project: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '.git') walk(full)
      } else {
        out.set(posix(relative(project, full)), createHash('sha256').update(readFileSync(full)).digest('hex'))
      }
    }
  }
  walk(project)
  return out
}

export function differences(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p)).sort()
}

export const GATE_RESULTS_REPORT = [
  '# Review Report', '',
  '## Gate Results', '',
  '| id | category | severity | target | disposition | detail |',
  '|----|----------|----------|--------|-------------|--------|',
  '| F-1 | quality | HIGH | requirements.md | OPEN | No acceptance criteria for FR-001 |',
  '',
].join('\n')
