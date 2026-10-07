// Issues — the main-process half of `/sdlc-report-issue` in the app: bugs in the product the team is
// building, from report to fix. Reads (the question plan, the build facts, the queue, one report with
// the actions the lifecycle allows) and writes (the report itself, and every lifecycle verb through
// one closed argv table) are each ONE spawn of `report_issue.py`; the plugin owns the questions, the
// minimum, the refusals and the lifecycle (`issue_model.py`). The three things only the app can do —
// take an image off the clipboard, let the person pick a file, capture its own window as a fallback —
// hand the renderer a path this module REMEMBERS; `reportIssue` accepts only paths it handed out, so
// the renderer can name a file but never make main read an arbitrary one. The same closed set guards
// `readIssueScreenshot`: only a file the plugin copied under `.sdlc/issues/` is readable that way.
// Electron is imported on first use so the spawn side runs under the unit tests without it.

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import type { BrowserWindow } from 'electron'
import { runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import { sourceArgs } from './sprint'
import { getCapabilities, invalidateCommandCenter } from './commandCenter'
import { parseDocument } from './commandCenterReaders'
import { buildIssueArgv, buildIssueVerbArgv, ISSUE_SCRIPT, ISSUE_VERB_CAPABILITY } from '../../shared/issueArgv'
import { CAPABILITIES, NO_ACTOR, newerPlugin } from '../../shared/reasons'
import type {
  ActorInfo, IssueCapture, IssueDetail, IssueDetailRead, IssueEnvironment, IssueEnvironmentRead, IssuePlanRead, IssueQuestionPlan,
  IssueReportRequest, IssueReportResult, IssueVerbRequest, IssueVerbResult, IssuesRead, IssuesView,
} from '../../shared/types'

/** Where the pasted images, captures and environment documents go: one folder in the OS temp dir. */
export const ISSUE_TEMP_DIR = join(tmpdir(), 'togo-issues')

/** The files main handed the renderer this session. `reportIssue` reads nothing outside this set. */
const issued = new Set<string>()

export function issuedPaths(): ReadonlySet<string> {
  return issued
}

/** For the tests: hand out a path without touching the clipboard or a dialog. */
export function rememberIssued(path: string): void {
  issued.add(path)
}

function tempFile(prefix: string, ext: string): string {
  mkdirSync(ISSUE_TEMP_DIR, { recursive: true })
  return join(ISSUE_TEMP_DIR, `${prefix}-${randomUUID()}${ext}`)
}

type Read<T> = { ok: true; data: T } | { ok: false; error: string }

async function readJson(scriptsDir: string, args: string[]): Promise<Read<Record<string, unknown>>> {
  const entry = await runPluginScript(scriptsDir, ISSUE_SCRIPT, args)
  const doc = entry.exitCode === 0 ? parseDocument(rawStdout(entry)) : null
  if (!doc) return { ok: false, error: entry.stderr.trim() || entry.stdout.trim() || `${ISSUE_SCRIPT} ${args[0]} gave no readable answer` }
  return { ok: true, data: doc }
}

// --- reads ----------------------------------------------------------------------------------------

export async function getIssueQuestions(projectPath: string, scriptsDir: string, channel?: string): Promise<IssuePlanRead> {
  const capabilities = await getCapabilities(projectPath, scriptsDir)
  if (!capabilities.includes(CAPABILITIES.issueQuestions)) return { ok: false, error: newerPlugin(CAPABILITIES.issueQuestions) }
  const r = await readJson(scriptsDir, ['questions', ...(channel ? ['--channel', channel] : []), '--json'])
  if (!r.ok) return r
  if (!Array.isArray(r.data.questions)) return { ok: false, error: 'report_issue.py questions gave no readable plan' }
  return { ok: true, plan: r.data as unknown as IssueQuestionPlan }
}

export interface AppFacts {
  appVersion: string
}

export async function getIssueEnvironment(projectPath: string, scriptsDir: string, facts: AppFacts): Promise<IssueEnvironmentRead> {
  const capabilities = await getCapabilities(projectPath, scriptsDir)
  if (!capabilities.includes(CAPABILITIES.issueEnv)) return { ok: false, error: newerPlugin(CAPABILITIES.issueEnv) }
  const r = await readJson(scriptsDir, ['env', ...sourceArgs(projectPath), '--app-version', facts.appVersion, '--json'])
  if (!r.ok) return r
  const env = r.data as unknown as IssueEnvironment
  const envPath = tempFile('environment', '.json')
  writeFileSync(envPath, JSON.stringify(env, null, 2), 'utf-8')
  issued.add(envPath)
  return { ok: true, env, envPath }
}

export async function listIssues(projectPath: string, scriptsDir: string, capabilities?: readonly string[]): Promise<IssuesRead> {
  const caps = capabilities ?? await getCapabilities(projectPath, scriptsDir)
  if (!caps.includes(CAPABILITIES.issueList)) return { ok: false, error: newerPlugin(CAPABILITIES.issueList) }
  const r = await readJson(scriptsDir, ['list', ...sourceArgs(projectPath), '--json'])
  if (!r.ok) return r
  if (!Array.isArray(r.data.issues)) return { ok: false, error: 'report_issue.py list gave no readable list' }
  return { ok: true, data: r.data as unknown as IssuesView }
}

export async function getIssue(projectPath: string, scriptsDir: string, issue: string): Promise<IssueDetailRead> {
  if (!/^ISS-\d{4}$/.test(issue)) return { ok: false, error: `'${issue}' is not an issue id (expected ISS-NNNN)` }
  const capabilities = await getCapabilities(projectPath, scriptsDir)
  if (!capabilities.includes(CAPABILITIES.issueShow)) return { ok: false, error: newerPlugin(CAPABILITIES.issueShow) }
  const r = await readJson(scriptsDir, ['show', ...sourceArgs(projectPath), '--issue', issue, '--json'])
  if (!r.ok) return r
  if (typeof r.data.issue !== 'string' || typeof r.data.actions !== 'object') return { ok: false, error: 'report_issue.py show gave no readable report' }
  return { ok: true, data: r.data as unknown as IssueDetail }
}

const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

/** A screenshot the plugin copied: `<project>/.sdlc/issues/<ISS-NNNN>/<file>` and nothing else — the
 * real path must sit under the real issues folder, so a link elsewhere is refused. */
export function readIssueScreenshot(projectPath: string, relPath: string): { ok: true; dataUrl: string } | { ok: false; error: string } {
  if (typeof relPath !== 'string' || relPath.replace(/\\/g, '/').split('/').includes('..')) return { ok: false, error: 'Only a report\'s own screenshot can be shown.' }
  const mime = IMAGE_MIME[extname(relPath).toLowerCase()]
  if (!mime) return { ok: false, error: 'Only an image under .sdlc/issues/ can be shown.' }
  try {
    const issues = realpathSync.native(join(projectPath, '.sdlc', 'issues'))
    const full = realpathSync.native(resolve(projectPath, relPath))
    if (!full.startsWith(issues + sep)) return { ok: false, error: 'Only an image under .sdlc/issues/ can be shown.' }
    const bytes = readFileSync(full)
    if (bytes.length > 12 * 1024 * 1024) return { ok: false, error: 'That screenshot is too large to show here; open the file.' }
    return { ok: true, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` }
  } catch (err) {
    return { ok: false, error: `That screenshot could not be read: ${(err as Error).message}` }
  }
}

// --- the screenshot: clipboard, a file, this window -----------------------------------------------

/** The image on the clipboard — the way a person brings a screenshot of the product in (⌘⇧4 to the
 * clipboard, Win+Shift+S). The PNG goes to disk; the renderer gets a small JPEG preview. */
export async function pasteScreenshot(): Promise<IssueCapture> {
  const { clipboard } = await import('electron')
  try {
    const image = clipboard.readImage()
    if (image.isEmpty()) return { ok: false, error: 'the clipboard holds no image — take a screenshot of the product and copy it, or choose a file' }
    return imageCapture(image, 'clipboard', 'pasted')
  } catch (err) {
    return { ok: false, error: `the clipboard could not be read: ${(err as Error).message}` }
  }
}

/** This window, as it stands — the fallback when the bug shows in the app itself. */
export async function captureWindow(win: BrowserWindow | null): Promise<IssueCapture> {
  if (!win || win.isDestroyed()) return { ok: false, error: 'no window to capture' }
  try {
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) return { ok: false, error: 'the capture came back empty' }
    return imageCapture(image, 'window', 'capture')
  } catch (err) {
    return { ok: false, error: `the window could not be captured: ${(err as Error).message}` }
  }
}

function imageCapture(image: Electron.NativeImage, source: 'clipboard' | 'window', prefix: string): IssueCapture {
  const png = image.toPNG()
  const path = tempFile(prefix, '.png')
  writeFileSync(path, png)
  issued.add(path)
  const { width, height } = image.getSize()
  const preview = width > 960 ? image.resize({ width: 960 }) : image
  return { ok: true, path, previewUrl: `data:image/jpeg;base64,${preview.toJPEG(72).toString('base64')}`, width, height, bytes: png.length, source, name: basename(path) }
}

/** An image the person picks. The plugin decides whether the bytes are an image; this only reads
 * the file for its preview and remembers the path. Null when the dialog was cancelled. */
export async function pickScreenshot(win: BrowserWindow | null): Promise<IssueCapture | null> {
  const { dialog } = await import('electron')
  const options = { title: 'Choose a screenshot of the product', properties: ['openFile' as const], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] }
  const result = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return fileCapture(result.filePaths[0])
}

/** The capture record for a file on disk (the test's way in, and `pickScreenshot`'s). */
export function fileCapture(path: string): IssueCapture {
  try {
    const size = statSync(path).size
    const mime = IMAGE_MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const previewUrl = size <= 4 * 1024 * 1024 && mime !== 'application/octet-stream'
      ? `data:${mime};base64,${readFileSync(path).toString('base64')}` : ''
    issued.add(path)
    return { ok: true, path, previewUrl, width: 0, height: 0, bytes: size, source: 'file', name: basename(path) }
  } catch (err) {
    return { ok: false, error: `that file could not be read: ${(err as Error).message}` }
  }
}

// --- writes ---------------------------------------------------------------------------------------------

function notRun(stderr: string): IssueReportResult {
  return { ok: false, exitCode: null, refused: false, stdout: '', stderr, argv: [], issue: null, path: null, gaps: [], advisory: [], warnings: [], proposedRisk: null, proposedPriority: null }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export async function reportIssue(
  projectPath: string, scriptsDir: string, req: IssueReportRequest, actor: ActorInfo | null, capabilities?: readonly string[],
): Promise<IssueReportResult> {
  if (!actor) return notRun(NO_ACTOR)
  const caps = capabilities ?? await getCapabilities(projectPath, scriptsDir)
  if (!caps.includes(CAPABILITIES.issueReport)) return notRun(newerPlugin(CAPABILITIES.issueReport))
  if (!req || typeof req !== 'object') return notRun('That is not an issue report.')
  const foreign = [...(Array.isArray(req.screenshots) ? req.screenshots : []), req.environmentPath].filter((p) => typeof p !== 'string' || !issued.has(p))
  if (foreign.length > 0) return notRun('A screenshot or the environment document is not one Studio pasted, picked or captured — add the screenshot again.')
  for (const p of req.screenshots) if (!existsSync(p)) return notRun(`The screenshot ${basename(p)} is no longer on disk — add it again.`)
  const built = buildIssueArgv(req, actor.name)
  if (!built.ok) return notRun(built.errors.join('\n'))
  const [verb, ...rest] = built.argv
  const argv = [verb, ...sourceArgs(projectPath), ...rest]
  const entry = await runPluginScript(scriptsDir, ISSUE_SCRIPT, argv)
  invalidateCommandCenter(projectPath)
  const doc = parseDocument(rawStdout(entry)) ?? {}
  return {
    ok: entry.exitCode === 0, exitCode: entry.exitCode, refused: entry.exitCode === 2, stdout: entry.stdout, stderr: entry.stderr, argv,
    issue: str(doc.issue), path: str(doc.path), gaps: strings(doc.gaps), advisory: strings(doc.advisory), warnings: strings(doc.warnings),
    proposedRisk: str(doc.proposed_risk), proposedPriority: str(doc.proposed_priority),
  }
}

function verbNotRun(req: IssueVerbRequest | null, stderr: string): IssueVerbResult {
  return { ok: false, exitCode: null, refused: false, stdout: '', stderr, argv: [], verb: req?.verb ?? 'note', doc: null }
}

/** One lifecycle verb: `triage` · `prioritize` · `promote` · `note` · `reopen` · `set-status` · `file`
 * · `sync`, through the closed table, with the actor as `--by`. The exit code is the truth. */
export async function runIssueVerb(
  projectPath: string, scriptsDir: string, req: IssueVerbRequest, actor: ActorInfo | null, capabilities?: readonly string[],
): Promise<IssueVerbResult> {
  if (!req || typeof req !== 'object' || !(req.verb in ISSUE_VERB_CAPABILITY)) return verbNotRun(null, 'That is not an issue verb Studio runs.')
  if (req.verb !== 'sync' && !actor) return verbNotRun(req, NO_ACTOR)
  const caps = capabilities ?? await getCapabilities(projectPath, scriptsDir)
  const cap = ISSUE_VERB_CAPABILITY[req.verb]
  if (!caps.includes(cap)) return verbNotRun(req, newerPlugin(cap))
  const built = buildIssueVerbArgv(req, actor?.name ?? '')
  if (!built.ok) return verbNotRun(req, built.errors.join('\n'))
  const [verb, ...rest] = built.argv
  const argv = [verb, ...sourceArgs(projectPath), ...rest]
  const entry = await runPluginScript(scriptsDir, ISSUE_SCRIPT, argv)
  if (!(req.verb === 'file' && req.dryRun)) invalidateCommandCenter(projectPath)
  return {
    ok: entry.exitCode === 0, exitCode: entry.exitCode, refused: entry.exitCode === 2, stdout: entry.stdout, stderr: entry.stderr, argv,
    verb: req.verb, doc: parseDocument(rawStdout(entry)),
  }
}
