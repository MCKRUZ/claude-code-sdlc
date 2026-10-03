/** Shared pieces for the batch-job tests (spec 0029): a real project with a LOCKED catalogue made by the
 * plugin's own intake_documents.py, and the stand-in `claude` driven by a script (one entry per document).
 * Not a test file itself. No test that uses this calls the live model. */

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BatchDeps } from '../electron/main/draftBatch'
import type { BatchState } from '../shared/types'
import { makeProject } from './draftHarness'
import type { PluginLocation } from './pluginRoot'

const FAKE_CLAUDE = join(__dirname, 'fixtures', 'fake-claude.mjs')

export interface IntakeOptions {
  /** file name -> content, in the order they will be catalogued (DOC-001, DOC-002, ...) */
  files?: Record<string, string>
  skip?: string[]
  priority?: string[]
  lock?: boolean
}

const DEFAULT_FILES: Record<string, string> = {
  'alpha.md': '# Alpha\nFirst reference document.\n',
  'beta-spec.md': '# Beta\nSecond reference document.\n',
  'gamma api.md': '# Gamma\nThird reference document.\n',
}

export const intakePath = (project: string, ...parts: string[]) => join(project, '.sdlc', 'context', 'intake', ...parts)

function runIntake(plugin: PluginLocation, project: string, extra: string[]): void {
  execFileSync(plugin.python, [
    join(plugin.scriptsDir, 'intake_documents.py'), '--state', join(project, '.sdlc', 'state.yaml'), '--json', ...extra,
  ], { cwd: plugin.scriptsDir, stdio: 'pipe' })
}

/** A project whose reference documents are catalogued (and, unless told otherwise, locked) the way the
 * Discovery screen does it, so the ids, the skipped list and the priority order are the script's own. */
export function makeIntakeProject(plugin: PluginLocation, opts: IntakeOptions = {}): string {
  const project = makeProject(plugin)
  appendFileSync(join(project, '.sdlc', 'profile.yaml'),
    '\ndocumentation:\n  intake_path: "docs/intake"\n  types: [pdf, markdown, text]\n  max_documents: 50\n')
  mkdirSync(join(project, 'docs', 'intake'), { recursive: true })
  for (const [name, text] of Object.entries(opts.files ?? DEFAULT_FILES)) writeFileSync(join(project, 'docs', 'intake', name), text)
  runIntake(plugin, project, [])
  if (opts.skip?.length) runIntake(plugin, project, ['--skip', opts.skip.join(',')])
  if (opts.priority?.length) runIntake(plugin, project, ['--priority', opts.priority.join(',')])
  if (opts.lock !== false) runIntake(plugin, project, ['--lock'])
  return project
}

export const FILLED_SUMMARY = (id: string) => `---\ndoc_id: "${id}"\n---\n\n## Document Overview\nA summary of ${id}.\n`
export const UNFILLED_SUMMARY = (id: string) => `---\ndoc_id: "\${DOC_ID}"\n---\n\n## Document Overview\n\${ONE_PARAGRAPH_SUMMARY}\n# ${id}\n`

export function writeSummary(project: string, id: string, slug: string, text = FILLED_SUMMARY(id)): string {
  mkdirSync(intakePath(project), { recursive: true })
  const path = intakePath(project, `${id}-${slug}.md`)
  writeFileSync(path, text)
  return path
}

export interface ScriptEntry {
  behaviour?: 'ok' | 'text' | 'error' | 'empty' | 'no-cost' | 'hang' | 'exit1'
  cost?: number
  text?: string
  delayMs?: number
}

export interface LogLine {
  event: 'start' | 'end'
  key: string
  argv: string[]
  cwd: string
  pid: number
  t: number
}

export interface ScriptedClaude {
  launch: NonNullable<BatchDeps['launch']>
  /** Every start/end the stand-in logged, in order. */
  log: () => LogLine[]
  /** Runs started, in order (the prompt's key: a document id, or `analysis`). */
  started: () => string[]
}

/** A stand-in launch that behaves per document: `script` maps `DOC-003` or `analysis` to what it does,
 * and `default` applies to every other. With no script every run succeeds with a valid reply, $0.10. */
export function scriptedClaude(script: Record<string, ScriptEntry> = {}): ScriptedClaude {
  const dir = mkdtempSync(join(tmpdir(), 'studio-fake-batch-'))
  const scriptFile = join(dir, 'script.json')
  const logFile = join(dir, 'log.jsonl')
  writeFileSync(scriptFile, JSON.stringify(script))
  const log = (): LogLine[] => {
    try {
      return readFileSync(logFile, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
  return {
    launch: { command: process.execPath, argsPrefix: [FAKE_CLAUDE, '--fake-mode', 'scripted', '--fake-script', scriptFile, '--fake-log', logFile] },
    log,
    started: () => log().filter((l) => l.event === 'start').map((l) => l.key),
  }
}

export function batchDeps(claude: ScriptedClaude): BatchDeps & { sent: Array<{ channel: string; payload: unknown }> } {
  const sent: Array<{ channel: string; payload: unknown }> = []
  return { launch: claude.launch, send: (channel, payload) => { sent.push({ channel, payload }) }, sent }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Waits until a condition holds, polling; fails with `what` if it does not within the limit. */
export async function until(condition: () => boolean, what: string, limitMs = 20000): Promise<void> {
  const deadline = Date.now() + limitMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await sleep(25)
  }
}

export const settled = (state: () => BatchState) => state().job !== null && state().job!.phase !== 'running'
