// Repository sync (spec 0009) — the orchestration layer. Pull, save, and clash resolution,
// built on git.ts (the plugin's own proven git/gh contract), sectionMerge.ts (the pure
// per-section 3-way merge), and settings.ts (Studio's local ancestor bookkeeping — see
// decision 4 in the spec's plan: no scratch clone, every git operation runs straight
// against the person's real project folder, because fetch and the plumbing commands used
// here never touch a working file, so there's nothing to isolate them from).

import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { runGit, runGitTolerant, runGh, ghJson } from './git'
import { recordVersion } from './history'
import { runPluginScript } from './project'
import { isAllowlisted, isSafeInProject, resolveInProject } from './projectPaths'
import {
  extractUnits, findShapeForPath, readShapeFromBytes, threeWayMerge, writeShapeUpdates,
} from './sectionMerge'
import {
  getProjectSyncState, readAncestorBlob, saveProjectSyncState, storeAncestorBlob,
} from './settings'
import type {
  ArrivedChange, ClashChoice, ClashSection, ConnectionInfo, FileClash, PullResult,
  ProjectSyncState, ResolveClashResult, SaveResult, SyncState,
} from '../../shared/types'

// --- Allowlist ------------------------------------------------------------------------
// The list now lives in projectPaths.ts, because documents and history need the same one and
// having it here meant only this file ever applied it. Re-exported so existing callers and
// tests keep working.

export { isAllowlisted } from './projectPaths'

// --- sync-state broadcasting -------------------------------------------------------------

const syncListeners = new Set<(state: SyncState) => void>()

export function onSyncState(listener: (state: SyncState) => void): () => void {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

function emitSyncState(state: SyncState): void {
  for (const l of syncListeners) l(state)
}

// --- small helpers -------------------------------------------------------------------------

// git's core.autocrlf (the common, often-default, Windows setting) converts CRLF<->LF
// between the working tree and the stored blob — meaning a checked-out local file and
// `git show <ref>:<path>`'s raw blob output can differ in bytes for content that is
// otherwise identical. Verified live against a real repo with autocrlf=true: a 2172-byte
// blob (LF) checks out as a 2265-byte working-tree file (CRLF) for the exact same commit.
// Comparing raw bytes directly would treat every such file as "changed" on every pull —
// hashing (and any decision about whether content actually differs) must normalize line
// endings first, or this spec is unusable on one of the most common Windows git configs.
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function toEol(text: string, eol: '\r\n' | '\n'): string {
  const normalized = normalizeEol(text)
  return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n')
}

function hashBytes(buf: Buffer): string {
  return `sha256:${createHash('sha256').update(normalizeEol(buf.toString('utf-8')), 'utf-8').digest('hex').slice(0, 16)}`
}

function walkFiles(dir: string, projectPath: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    // A link is never a document Studio should sync — following one would read whatever it
    // points at (a private key, say) and push it to the repository's owner. Dropped here,
    // and again at the point of use, since this walk is not the only way a path arrives.
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) walkFiles(full, projectPath, out)
    else if (e.isFile()) {
      const rel = relative(projectPath, full).split(sep).join('/')
      if (isAllowlisted(rel)) out.push(rel)
    }
  }
}

function listLocalAllowlistedFiles(projectPath: string): string[] {
  const out: string[] = []
  walkFiles(join(projectPath, '.sdlc'), projectPath, out)
  walkFiles(join(projectPath, 'specs'), projectPath, out)
  return out
}

async function listRemoteAllowlistedFiles(projectPath: string, branch: string): Promise<string[]> {
  const entry = await runGitTolerant(['ls-tree', '-r', '--name-only', `origin/${branch}`], projectPath)
  if (!entry.ok) return []
  // The remote list is the repository's own view, so it is the untrusted one — it happily
  // names a path that exists locally as a link to somewhere else entirely.
  return entry.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
    .filter(isAllowlisted)
    .filter((rel) => isSafeInProject(projectPath, rel))
}

async function currentBranch(projectPath: string): Promise<string> {
  return (await runGit(['branch', '--show-current'], projectPath)).trim()
}

async function readRemoteBlob(projectPath: string, branch: string, relPath: string): Promise<Buffer | null> {
  const entry = await runGitTolerant(['show', `origin/${branch}:${relPath}`], projectPath)
  if (!entry.ok) return null
  return Buffer.from(entry.stdout, 'utf-8')
}

async function describeArrival(projectPath: string, branch: string, relPath: string): Promise<ArrivedChange> {
  const entry = await runGitTolerant(
    ['log', '-1', '--format=%an|%ad', `origin/${branch}`, '--', relPath], projectPath,
  )
  if (!entry.ok) return { path: relPath, author: 'unknown', when: '' }
  const [author, when] = entry.stdout.trim().split('|')
  return { path: relPath, author: author || 'unknown', when: when || '' }
}

function wholeFileClash(relPath: string, localText: string, remoteText: string): FileClash {
  return {
    path: relPath,
    sections: [{ key: '__whole_file__', heading: relPath, localText, remoteText }],
  }
}

// --- connection info -----------------------------------------------------------------------

export async function getConnectionInfo(projectPath: string): Promise<ConnectionInfo> {
  const branch = await currentBranch(projectPath).catch(() => '')

  let repo = ''
  try {
    repo = (await runGit(['remote', 'get-url', 'origin'], projectPath)).trim()
  } catch {
    // no remote configured yet
  }

  let account: string | null = null
  try {
    account = (await runGh(['api', 'user', '--jq', '.login'], projectPath)).trim() || null
  } catch {
    // not signed in, or gh unavailable — reported via tooling detection, not here
  }

  // Best-effort display only — never the actual gate. The real gate is whether a direct
  // push gets rejected (finding 9); this is purely for the connection screen to show
  // something before the person ever saves.
  let branchProtected: boolean | null = null
  try {
    const rulesets = await ghJson<Array<{ enforcement?: string }>>(
      ['api', 'repos/{owner}/{repo}/rulesets'], projectPath,
    )
    branchProtected = Array.isArray(rulesets) && rulesets.some((r) => r.enforcement === 'active')
  } catch {
    branchProtected = null
  }

  const state = getProjectSyncState(projectPath)
  return { repo, branch, localFolder: projectPath, account, lastPulledAt: state.lastPulledAt, branchProtected }
}

// --- pull ------------------------------------------------------------------------------

interface PullOneFileOutcome {
  merged: boolean
  clash?: FileClash
  arrived?: ArrivedChange
}

async function pullOneFile(
  projectPath: string,
  pluginScriptsDir: string,
  branch: string,
  relPath: string,
  syncState: ProjectSyncState,
): Promise<PullOneFileOutcome> {
  // The last line of defence before any read or write: refuses a path that climbs out of the
  // project, is a link, or resolves outside it. A refusal skips the file rather than failing
  // the pull — one hostile entry must not stop the other documents syncing.
  let localFullPath: string
  try {
    localFullPath = resolveInProject(projectPath, relPath)
  } catch {
    return { merged: false }
  }
  const localExists = existsSync(localFullPath)
  const localBytes = localExists ? readFileSync(localFullPath) : null
  const remoteBytes = await readRemoteBlob(projectPath, branch, relPath)

  if (!localBytes && !remoteBytes) return { merged: false }

  const existing = syncState.files[relPath]
  if (existing?.pendingClashSections?.length) {
    return { merged: false } // frozen — waits for resolveClash()
  }

  const localHash = localBytes ? hashBytes(localBytes) : null
  const remoteHash = remoteBytes ? hashBytes(remoteBytes) : null

  if (!existing) {
    // True first sync for this file.
    if (localBytes && (!remoteBytes || localHash === remoteHash)) {
      storeAncestorBlob(localHash!, localBytes)
      syncState.files[relPath] = { ancestorHash: localHash! }
      return { merged: false }
    }
    if (!localBytes && remoteBytes) {
      writeFileSync(localFullPath, remoteBytes)
      storeAncestorBlob(remoteHash!, remoteBytes)
      syncState.files[relPath] = { ancestorHash: remoteHash! }
      return { merged: true, arrived: await describeArrival(projectPath, branch, relPath) }
    }
    // Both exist and already differ with no known shared history (e.g. a clone with local
    // edits made before Studio's first pull) — never guess which is right.
    return { merged: false, clash: wholeFileClash(relPath, localBytes!.toString('utf-8'), remoteBytes!.toString('utf-8')) }
  }

  const ancestorHash = existing.ancestorHash
  if (remoteHash === ancestorHash) return { merged: false } // remote hasn't moved (EOL-insensitive)

  if (localHash === ancestorHash || localBytes === null) {
    // Only remote changed (or the local file is simply gone — treated as no local edit).
    // Written in the local checkout's own EOL style (when a local copy existed) so this
    // doesn't turn into a whole-file EOL-style diff the next time something looks at it.
    if (remoteBytes) {
      const remoteText = remoteBytes.toString('utf-8')
      const out = localBytes ? toEol(remoteText, detectEol(localBytes.toString('utf-8'))) : remoteText
      writeFileSync(localFullPath, out, 'utf-8')
      storeAncestorBlob(remoteHash!, remoteBytes)
      syncState.files[relPath] = { ancestorHash: remoteHash! }
      return { merged: true, arrived: await describeArrival(projectPath, branch, relPath) }
    }
    return { merged: false } // remote deleted it too; deletion propagation is out of scope
  }

  if (localHash === remoteHash) {
    storeAncestorBlob(remoteHash!, remoteBytes!)
    syncState.files[relPath] = { ancestorHash: remoteHash! }
    return { merged: false }
  }

  // Both changed and differ (by content, not just EOL style) — the real case this spec
  // exists for.
  const ancestorBytes = readAncestorBlob(ancestorHash)
  const localText = localBytes.toString('utf-8')
  const remoteText = remoteBytes!.toString('utf-8')

  if (!ancestorBytes) {
    // Can't do a precise compare without the ancestor's bytes — fail safe, not silent.
    return { merged: false, clash: wholeFileClash(relPath, localText, remoteText) }
  }

  const shapePath = findShapeForPath(pluginScriptsDir, relPath, localText)
  if (!shapePath) {
    return { merged: false, clash: wholeFileClash(relPath, localText, remoteText) }
  }

  // Two passes: a normalized (LF) pass decides WHAT changed — so a checkout's EOL
  // conversion can never manufacture a false clash — and a raw pass against the REAL local
  // file gives the byte spans the eventual write must target. Mixing these up would either
  // hide a real change (comparing on raw, EOL-differing text) or write at the wrong offsets
  // (splicing normalized spans into the real, differently-sized file).
  const localEol = detectEol(localText)
  const ancestorNorm = normalizeEol(ancestorBytes.toString('utf-8'))
  const localNorm = normalizeEol(localText)
  const remoteNorm = normalizeEol(remoteText)

  const [ancestorReadN, localReadN, remoteReadN, localReadRaw] = await Promise.all([
    readShapeFromBytes(pluginScriptsDir, Buffer.from(ancestorNorm, 'utf-8'), shapePath),
    readShapeFromBytes(pluginScriptsDir, Buffer.from(localNorm, 'utf-8'), shapePath),
    readShapeFromBytes(pluginScriptsDir, Buffer.from(remoteNorm, 'utf-8'), shapePath),
    readShapeFromBytes(pluginScriptsDir, localBytes, shapePath),
  ])

  if (!ancestorReadN.matched || !localReadN.matched || !remoteReadN.matched || !localReadRaw.matched) {
    return { merged: false, clash: wholeFileClash(relPath, localText, remoteText) }
  }

  const ancestorUnits = extractUnits(ancestorNorm, ancestorReadN)
  const localUnitsForCompare = extractUnits(localNorm, localReadN)
  const remoteUnits = extractUnits(remoteNorm, remoteReadN)
  const localUnitsRaw = extractUnits(localText, localReadRaw) // real spans, for writing only
  const { merged, clashes } = threeWayMerge(ancestorUnits, localUnitsForCompare, remoteUnits)

  if (clashes.length > 0) {
    syncState.files[relPath] = { ancestorHash, pendingClashSections: clashes.map((c) => c.key) }
    return { merged: false, clash: { path: relPath, sections: clashes } }
  }

  const updates: Array<[number, number, string]> = []
  for (const [key, newText] of merged) {
    const compareUnit = localUnitsForCompare.find((u) => u.key === key)
    if (!compareUnit || compareUnit.text === newText) continue // unchanged relative to local
    const rawUnit = localUnitsRaw.find((u) => u.key === key)
    if (!rawUnit || !rawUnit.span) continue
    updates.push([rawUnit.span[0], rawUnit.span[1], toEol(newText, localEol)])
  }
  if (updates.length > 0) {
    await writeShapeUpdates(pluginScriptsDir, localFullPath, updates)
  }

  storeAncestorBlob(remoteHash!, remoteBytes!)
  syncState.files[relPath] = { ancestorHash: remoteHash! }
  return { merged: updates.length > 0, arrived: await describeArrival(projectPath, branch, relPath) }
}

export async function pull(projectPath: string, pluginScriptsDir: string): Promise<PullResult> {
  emitSyncState({ kind: 'pulling' })
  try {
    await runGit(['fetch', 'origin'], projectPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitSyncState({ kind: 'error', message })
    return { ok: false, mergedFiles: [], clashes: [], arrivedChanges: [], entries: [], error: message }
  }

  const branch = await currentBranch(projectPath)
  const syncState = getProjectSyncState(projectPath)
  const remoteFiles = await listRemoteAllowlistedFiles(projectPath, branch)
  const allFiles = new Set([...listLocalAllowlistedFiles(projectPath), ...remoteFiles, ...Object.keys(syncState.files)])

  const mergedFiles: string[] = []
  const clashes: FileClash[] = []
  const arrivedChanges: ArrivedChange[] = []

  for (const relPath of allFiles) {
    const outcome = await pullOneFile(projectPath, pluginScriptsDir, branch, relPath, syncState)
    if (outcome.merged) mergedFiles.push(relPath)
    if (outcome.clash) clashes.push(outcome.clash)
    if (outcome.arrived) arrivedChanges.push(outcome.arrived)
  }

  syncState.lastPulledAt = new Date().toISOString()
  saveProjectSyncState(projectPath, syncState)

  if (clashes.length > 0) {
    emitSyncState({ kind: 'clashes', count: clashes.reduce((n, c) => n + c.sections.length, 0) })
  } else {
    emitSyncState({ kind: 'idle', lastPulledAt: syncState.lastPulledAt })
  }

  return { ok: true, mergedFiles, clashes, arrivedChanges, entries: [] }
}

// --- clash resolution ------------------------------------------------------------------

interface RecomputedClashState {
  merged: Map<string, string>
  clashes: ClashSection[]
  /** Real spans against the actual local file on disk — used only for writing. See
   * pullOneFile's two-pass comment for why this must be separate from the units the
   * comparison itself ran on. */
  localUnitsRaw: ReturnType<typeof extractUnits>
  localEol: '\r\n' | '\n'
  localText: string
  remoteBytes: Buffer
  shapePath: string | null
}

/** Recomputes a file's clash state fresh from durable sources (the local file on disk, a
 * fresh fetch of the remote, and the frozen ancestor blob) rather than trusting any
 * in-memory cache — so resolving a clash works correctly even after Studio was closed and
 * reopened mid-resolution, per spec 0009's own acceptance check. Shared by resolveClash()
 * and getPendingClashes() so there is exactly one place this logic lives. Same EOL-safe
 * two-pass approach as pullOneFile — see its comment for why one pass isn't enough. */
async function recomputeClashState(
  projectPath: string,
  pluginScriptsDir: string,
  filePath: string,
  ancestorHash: string,
): Promise<RecomputedClashState | { error: string }> {
  const branch = await currentBranch(projectPath)
  const localFullPath = join(projectPath, filePath)
  if (!existsSync(localFullPath)) {
    return { error: `${filePath} no longer exists locally` }
  }
  const localBytes = readFileSync(localFullPath)
  const remoteBytes = await readRemoteBlob(projectPath, branch, filePath)
  const ancestorBytes = readAncestorBlob(ancestorHash)

  if (!remoteBytes || !ancestorBytes) {
    return { error: 'Could not recover the versions needed to resolve this clash — try pulling again' }
  }

  const localText = localBytes.toString('utf-8')
  const remoteText = remoteBytes.toString('utf-8')
  const localEol = detectEol(localText)
  const shapePath = findShapeForPath(pluginScriptsDir, filePath, localText)

  if (!shapePath) {
    return {
      merged: new Map(), shapePath: null, localText, remoteBytes, localEol,
      localUnitsRaw: [{ key: '__whole_file__', heading: filePath, text: localText }],
      clashes: [{ key: '__whole_file__', heading: filePath, localText, remoteText }],
    }
  }

  const ancestorNorm = normalizeEol(ancestorBytes.toString('utf-8'))
  const localNorm = normalizeEol(localText)
  const remoteNorm = normalizeEol(remoteText)

  const [ancestorReadN, localReadN, remoteReadN, localReadRaw] = await Promise.all([
    readShapeFromBytes(pluginScriptsDir, Buffer.from(ancestorNorm, 'utf-8'), shapePath),
    readShapeFromBytes(pluginScriptsDir, Buffer.from(localNorm, 'utf-8'), shapePath),
    readShapeFromBytes(pluginScriptsDir, Buffer.from(remoteNorm, 'utf-8'), shapePath),
    readShapeFromBytes(pluginScriptsDir, localBytes, shapePath),
  ])
  if (!ancestorReadN.matched || !localReadN.matched || !remoteReadN.matched || !localReadRaw.matched) {
    return {
      merged: new Map(), shapePath, localText, remoteBytes, localEol,
      localUnitsRaw: [{ key: '__whole_file__', heading: filePath, text: localText }],
      clashes: [{ key: '__whole_file__', heading: filePath, localText, remoteText }],
    }
  }

  const ancestorUnits = extractUnits(ancestorNorm, ancestorReadN)
  const localUnitsForCompare = extractUnits(localNorm, localReadN)
  const remoteUnits = extractUnits(remoteNorm, remoteReadN)
  const localUnitsRaw = extractUnits(localText, localReadRaw)
  const result = threeWayMerge(ancestorUnits, localUnitsForCompare, remoteUnits)
  return { merged: result.merged, clashes: result.clashes, localUnitsRaw, localEol, localText, remoteBytes, shapePath }
}

/** Every currently-pending clash across the whole project, recomputed fresh — what the
 * renderer calls to populate the clash screen after any pull (including one that happened
 * on the periodic background timer, whose result the renderer never otherwise sees). */
export async function getPendingClashes(projectPath: string, pluginScriptsDir: string): Promise<FileClash[]> {
  const syncState = getProjectSyncState(projectPath)
  const out: FileClash[] = []
  for (const [filePath, fileState] of Object.entries(syncState.files)) {
    if (!fileState.pendingClashSections?.length) continue
    const state = await recomputeClashState(projectPath, pluginScriptsDir, filePath, fileState.ancestorHash)
    if ('error' in state) continue
    const stillPending = state.clashes.filter((c) => fileState.pendingClashSections!.includes(c.key))
    if (stillPending.length > 0) out.push({ path: filePath, sections: stillPending })
  }
  return out
}

export async function resolveClash(
  projectPath: string,
  pluginScriptsDir: string,
  filePath: string,
  sectionKey: string,
  choice: ClashChoice,
  combinedText: string | undefined,
): Promise<ResolveClashResult> {
  const syncState = getProjectSyncState(projectPath)
  const fileState = syncState.files[filePath]
  if (!fileState?.pendingClashSections?.length) {
    return { ok: false, fileFullyResolved: false, error: `No pending clash for ${filePath}` }
  }

  const state = await recomputeClashState(projectPath, pluginScriptsDir, filePath, fileState.ancestorHash)
  if ('error' in state) {
    return { ok: false, fileFullyResolved: false, error: state.error }
  }
  const { merged, clashes, localUnitsRaw, localEol, localText, remoteBytes, shapePath } = state
  const localFullPath = join(projectPath, filePath)

  const clash = clashes.find((c) => c.key === sectionKey)
  if (!clash) {
    return { ok: false, fileFullyResolved: false, error: `Section '${sectionKey}' is not a pending clash for ${filePath}` }
  }
  const resolvedText = choice === 'local' ? clash.localText : choice === 'remote' ? clash.remoteText : (combinedText ?? clash.localText)
  merged.set(sectionKey, resolvedText)

  const remainingClashKeys = fileState.pendingClashSections.filter((k) => k !== sectionKey)
  if (remainingClashKeys.length > 0) {
    syncState.files[filePath] = { ancestorHash: fileState.ancestorHash, pendingClashSections: remainingClashKeys }
    saveProjectSyncState(projectPath, syncState)
    return { ok: true, fileFullyResolved: false }
  }

  // Every clash in this file is now resolved — apply everything (silent merges + resolved
  // clashes) in one write, then advance the ancestor.
  const updates: Array<[number, number, string]> = []
  for (const [key, newText] of merged) {
    if (key === '__whole_file__') {
      const out = toEol(newText, localEol)
      if (out !== localText) writeFileSync(localFullPath, out, 'utf-8')
      continue
    }
    const rawUnit = localUnitsRaw.find((u) => u.key === key)
    if (!rawUnit || !rawUnit.span) continue
    const out = toEol(newText, localEol)
    if (rawUnit.text === out) continue
    updates.push([rawUnit.span[0], rawUnit.span[1], out])
  }
  if (updates.length > 0 && shapePath) {
    await writeShapeUpdates(pluginScriptsDir, localFullPath, updates)
  }

  const remoteHash = hashBytes(remoteBytes)
  storeAncestorBlob(remoteHash, remoteBytes)
  syncState.files[filePath] = { ancestorHash: remoteHash }
  saveProjectSyncState(projectPath, syncState)

  return { ok: true, fileFullyResolved: true }
}

// --- approval settings (spec 0009's shared prerequisite) -------------------------------

interface ApprovalStageSetting {
  approval_required: boolean
  approver: string | null
}

/** The stage a changed path belongs to, derived from its artifact folder's own slug
 * (`.sdlc/artifacts/01-requirements/...` -> `requirements`) — never hardcoded against
 * phase_model.py's own ordering, which the plugin owns. A path with no artifact-folder
 * segment (specs/**, .sdlc/state.yaml, ...) has no stage, so it never gates on approval. */
function stageForPath(relPath: string): string | null {
  const m = relPath.match(/^\.sdlc\/artifacts\/\d+-([a-z0-9-]+)\//)
  return m ? m[1] : null
}

async function approvalSettingsForFiles(
  pluginScriptsDir: string,
  projectPath: string,
  changedFiles: string[],
): Promise<{ required: boolean; approver: string | null }> {
  const entry = await runPluginScript(pluginScriptsDir, 'approval_settings.py', [projectPath, '--json'])
  let byStage: Record<string, ApprovalStageSetting> = {}
  try {
    byStage = (JSON.parse(entry.stdout).settings ?? {}) as Record<string, ApprovalStageSetting>
  } catch {
    byStage = {} // malformed settings degrade to "approval not required anywhere" — the documented safe default
  }

  for (const relPath of changedFiles) {
    const stage = stageForPath(relPath)
    const setting = stage ? byStage[stage] : undefined
    if (setting?.approval_required) {
      return { required: true, approver: setting.approver }
    }
  }
  return { required: false, approver: null }
}

// --- save --------------------------------------------------------------------------------

export interface SaveOptions {
  /** Save only this document, leaving other changed files for their own save. Spec 0010 saves
   * one document at a time with its own reason; spec 0009's whole-project save is what you get
   * when this is omitted. */
  onlyPath?: string
  /** Who is saving, and why — recorded as a version so the document's history can answer "who
   * saved this and why" later. Without these the save still happens, but no version is
   * recorded, because a version attributed to nobody is worse than no version. */
  actor?: string
}

export async function save(
  projectPath: string,
  pluginScriptsDir: string,
  changeNote: string,
  options: SaveOptions = {},
): Promise<SaveResult> {
  emitSyncState({ kind: 'saving' })

  const before = getProjectSyncState(projectPath)
  const alreadyClashed = Object.entries(before.files).filter(([, s]) => s.pendingClashSections?.length)
  if (alreadyClashed.length > 0) {
    emitSyncState({ kind: 'clashes', count: alreadyClashed.length })
    return { ok: false, entries: [], error: `${alreadyClashed.length} file(s) still have unresolved clashes — resolve them first.` }
  }

  const pullResult = await pull(projectPath, pluginScriptsDir)
  if (!pullResult.ok) {
    return { ok: false, entries: pullResult.entries, error: pullResult.error }
  }
  if (pullResult.clashes.length > 0) {
    return { ok: false, entries: pullResult.entries, error: 'New changes arrived that clash with your edits — resolve them before saving.' }
  }

  const branch = await currentBranch(projectPath)
  const baseSha = (await runGit(['rev-parse', `origin/${branch}`], projectPath)).trim()

  const state = getProjectSyncState(projectPath)
  // Everything committed and pushed below is read from this list, so this is the one place
  // the containment check has to hold for the save path — a file that is really a link
  // elsewhere on the machine must never become a blob in someone else's repository.
  const changedFiles = listLocalAllowlistedFiles(projectPath).filter((relPath) => {
    if (options.onlyPath && relPath !== options.onlyPath) return false
    let fullPath: string
    try {
      fullPath = resolveInProject(projectPath, relPath)
    } catch {
      return false
    }
    if (!existsSync(fullPath)) return false
    const hash = hashBytes(readFileSync(fullPath))
    return state.files[relPath]?.ancestorHash !== hash
  })

  if (changedFiles.length === 0) {
    return { ok: true, entries: [], error: 'Nothing to save — no changes since the last sync.' }
  }

  // Record each saved document as a version BEFORE pushing, so the history reflects what was
  // saved even if the push is then rejected and turns into a pull request. Best-effort: a
  // failure to record history must never block the save itself.
  if (options.actor) {
    for (const relPath of changedFiles) {
      await recordVersion(projectPath, pluginScriptsDir, relPath, options.actor, changeNote)
        .catch(() => undefined)
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'studio-index-'))
  const indexFile = join(tmpDir, 'index')
  const env = { GIT_INDEX_FILE: indexFile }

  try {
    await runGit(['read-tree', baseSha], projectPath, { env })
    for (const relPath of changedFiles) {
      const bytes = readFileSync(join(projectPath, relPath))
      const blobSha = (await runGit(['hash-object', '-w', '--stdin'], projectPath, { input: bytes.toString('utf-8') })).trim()
      await runGit(['update-index', '--add', '--cacheinfo', `100644,${blobSha},${relPath}`], projectPath, { env })
    }
    const newTree = (await runGit(['write-tree'], projectPath, { env })).trim()
    const newCommit = (await runGit(['commit-tree', newTree, '-p', baseSha, '-m', changeNote], projectPath)).trim()

    const directPush = await runGitTolerant(['push', 'origin', `${newCommit}:refs/heads/${branch}`], projectPath)

    if (directPush.ok) {
      for (const relPath of changedFiles) {
        const bytes = readFileSync(join(projectPath, relPath))
        const hash = hashBytes(bytes)
        storeAncestorBlob(hash, bytes)
        state.files[relPath] = { ancestorHash: hash }
      }
      saveProjectSyncState(projectPath, state)
      emitSyncState({ kind: 'idle', lastPulledAt: state.lastPulledAt })
      return { ok: true, outcome: 'pushed_directly', entries: [directPush] }
    }

    // Rejected (most likely branch protection) — branch + PR fallback.
    const branchName = `studio/${Date.now()}`
    const pushBranch = await runGitTolerant(['push', 'origin', `${newCommit}:refs/heads/${branchName}`], projectPath)
    if (!pushBranch.ok) {
      return { ok: false, entries: [directPush, pushBranch], error: pushBranch.stderr || 'Could not push — check network and permissions.' }
    }

    const approval = await approvalSettingsForFiles(pluginScriptsDir, projectPath, changedFiles)
    const prArgs = [
      'pr', 'create', '--base', branch, '--head', branchName,
      '--title', (changeNote.split('\n')[0] || `Studio save ${branchName}`).slice(0, 72),
      '--body', `Saved from SDLC Studio.\n\n${changeNote}`,
    ]
    if (approval.required && approval.approver) {
      prArgs.push('--reviewer', approval.approver.replace(/^@/, ''))
    }

    let prUrl: string
    try {
      prUrl = (await runGh(prArgs, projectPath)).trim()
    } catch (err) {
      return { ok: false, entries: [directPush, pushBranch], error: err instanceof Error ? err.message : String(err) }
    }

    for (const relPath of changedFiles) {
      const bytes = readFileSync(join(projectPath, relPath))
      const hash = hashBytes(bytes)
      storeAncestorBlob(hash, bytes)
      state.files[relPath] = { ancestorHash: hash }
    }
    saveProjectSyncState(projectPath, state)

    emitSyncState(
      approval.required
        ? { kind: 'waitingForApproval', approver: approval.approver ?? 'the named approver' }
        : { kind: 'waitingForChecks' },
    )

    return { ok: true, outcome: 'opened_pull_request', prUrl, entries: [directPush, pushBranch] }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best effort cleanup */ }
  }
}

// --- pull-request polling (Studio-driven — never GitHub's native auto-merge; finding 8) ----

interface PrListEntry {
  number: number
  headRefName: string
  statusCheckRollup?: Array<{ status: string; conclusion: string | null }>
  reviews?: Array<{ state: string }>
}

/** Called alongside the periodic pull tick. Merges an open Studio-opened PR itself, once
 * Studio personally observes checks green (and, when the affected stage requires it, an
 * APPROVED review) — GitHub's own `--auto` merges on the server even while Studio is closed,
 * which would violate the spec's "no background work while Studio is closed" scope. */
export async function pollAndMergeOpenPullRequest(
  projectPath: string,
  pluginScriptsDir: string,
): Promise<{ merged: boolean; prUrl?: string }> {
  let prs: PrListEntry[]
  try {
    prs = await ghJson<PrListEntry[]>(
      ['pr', 'list', '--search', 'head:studio/', '--state', 'open',
        '--json', 'number,headRefName,statusCheckRollup,reviews'],
      projectPath,
    )
  } catch {
    return { merged: false }
  }
  if (prs.length === 0) return { merged: false }

  const pr = prs[0]
  const checks = pr.statusCheckRollup ?? []
  const checksGreen = checks.length === 0
    || checks.every((c) => c.status === 'COMPLETED' && (c.conclusion === 'SUCCESS' || c.conclusion === 'NEUTRAL' || c.conclusion === 'SKIPPED'))
  if (!checksGreen) {
    emitSyncState({ kind: 'waitingForChecks' })
    return { merged: false }
  }

  const changedFiles = listLocalAllowlistedFiles(projectPath)
  const approval = await approvalSettingsForFiles(pluginScriptsDir, projectPath, changedFiles)
  if (approval.required) {
    const approved = (pr.reviews ?? []).some((r) => r.state === 'APPROVED')
    if (!approved) {
      emitSyncState({ kind: 'waitingForApproval', approver: approval.approver ?? 'the named approver' })
      return { merged: false }
    }
  }

  try {
    const out = await runGh(['pr', 'merge', String(pr.number), '--merge'], projectPath)
    emitSyncState({ kind: 'idle', lastPulledAt: getProjectSyncState(projectPath).lastPulledAt })
    return { merged: true, prUrl: out.trim() }
  } catch {
    return { merged: false }
  }
}
