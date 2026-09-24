import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { detectAllTooling } from './tooling'
import { getConsoleLog, onConsoleEntry } from './commandRunner'
import { setGhBinary, setGitBinary } from './git'
import { initSettingsPath, loadSettings, recordRecentProject, saveSettings, type Settings } from './settings'
import { hasSdlcProject, listAvailableProfiles, openProject, previewSetup, runSetup } from './project'
import { combineWithClaude } from './claudeAssist'
import { getConnectionInfo, getPendingClashes, onSyncState, pollAndMergeOpenPullRequest, pull, resolveClash, save } from './sync'
import { addInstance, getDocumentChanges, nextNumber, openDocument, setField } from './documents'
import { confirmRestore, diffVersions, getVersionText, listVersions, previewRestore } from './history'
import { getStageReadiness } from './readiness'
import { draftField, recordDraftOutcome } from './drafts'
import { getLastSeenCommit, setLastSeenCommit } from './settings'
import { runGitTolerant } from './git'
import { getBoard, getSpecReadiness, getSpecStatus, transitionSpec } from './board'
import { handOff } from './handoff'
import type { ClashChoice, DraftOutcome } from '../../shared/types'

/** Two minutes, matching spec 0009's own acceptance check ("Studio pulls every 2 minutes
 * while open"). */
const PULL_INTERVAL_MS = 120_000

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (process.platform === 'win32' && os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

/** The plugin scripts directory currently in use — resolved once per session from
 * settings/detection, cached here so every IPC call doesn't re-detect. Cleared and
 * re-resolved if the person changes the override in settings. Resolving tooling also
 * primes git.ts with the real git/gh invocation strategy (see tooling.ts's Windows
 * .cmd-shim handling), so every later git/gh call in this session uses it too. */
let resolvedPluginScriptsDir: string | null = null

async function resolvePluginScriptsDir(): Promise<string | null> {
  if (resolvedPluginScriptsDir) return resolvedPluginScriptsDir
  const settings = loadSettings()
  const report = await detectAllTooling({
    claudePath: settings.claudePathOverride,
    uvPath: settings.uvPathOverride,
    pluginScriptsPath: settings.pluginScriptsPathOverride,
    gitPath: settings.gitPathOverride,
    ghPath: settings.ghPathOverride,
  })
  if (report.pluginScripts.found && report.pluginScripts.path) {
    resolvedPluginScriptsDir = report.pluginScripts.path
  }
  if (report.gitResolved) setGitBinary(report.gitResolved)
  if (report.ghResolved) setGhBinary(report.ghResolved)
  return resolvedPluginScriptsDir
}

/** The project Studio currently has open — tracked here so the periodic pull timer (below)
 * knows what to sync. Spec 0008 never needed this (App.tsx discards the path after opening
 * on the renderer side); the main process tracks its own copy for the timer's sake. */
let openProjectPath: string | null = null
let pullTimer: NodeJS.Timeout | null = null

function startPullTimer() {
  if (pullTimer) return
  pullTimer = setInterval(async () => {
    if (!openProjectPath) return
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return
    await pull(openProjectPath, scriptsDir)
    await pollAndMergeOpenPullRequest(openProjectPath, scriptsDir)
  }, PULL_INTERVAL_MS)
}

function registerIpcHandlers() {
  ipcMain.handle('studio:detectTooling', async () => {
    const settings = loadSettings()
    const report = await detectAllTooling({
      claudePath: settings.claudePathOverride,
      uvPath: settings.uvPathOverride,
      pluginScriptsPath: settings.pluginScriptsPathOverride,
      gitPath: settings.gitPathOverride,
      ghPath: settings.ghPathOverride,
    })
    if (report.gitResolved) setGitBinary(report.gitResolved)
    if (report.ghResolved) setGhBinary(report.ghResolved)
    return report
  })

  ipcMain.handle('studio:getSettings', () => loadSettings())

  ipcMain.handle('studio:setToolOverride', (_event, kind: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh', overridePath: string) => {
    const settings = loadSettings()
    const key = {
      claude: 'claudePathOverride', uv: 'uvPathOverride', pluginScripts: 'pluginScriptsPathOverride',
      git: 'gitPathOverride', gh: 'ghPathOverride',
    }[kind] as keyof Settings
    const updated: Settings = { ...settings, [key]: overridePath }
    saveSettings(updated)
    resolvedPluginScriptsDir = null // force re-resolve if any tool path changed
    return updated
  })

  ipcMain.handle('studio:pickFolder', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('studio:hasSdlcProject', (_event, projectPath: string) => hasSdlcProject(projectPath))

  ipcMain.handle('studio:openProject', async (_event, projectPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { hasProject: false, error: 'claude-code-sdlc plugin scripts not found' }
    // Spec 0009: pull immediately before a document opens — the closest existing entry
    // point in spec 0008's shell is opening the project itself; best-effort, since a
    // project with no remote configured yet (or offline) must still open.
    await pull(projectPath, scriptsDir).catch(() => undefined)
    const result = await openProject(scriptsDir, projectPath)
    if (result.hasProject && result.status) {
      recordRecentProject(projectPath, result.status.project_name)
      openProjectPath = projectPath
      startPullTimer()
    }
    return result
  })

  ipcMain.handle('studio:listProfiles', async () => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? listAvailableProfiles(scriptsDir) : []
  })

  ipcMain.handle('studio:previewSetup', async (_event, projectPath: string, profileId: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { error: 'claude-code-sdlc plugin scripts not found' }
    return previewSetup(scriptsDir, projectPath, profileId)
  })

  ipcMain.handle('studio:runSetup', async (_event, projectPath: string, profileId: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
    const result = await runSetup(scriptsDir, projectPath, profileId)
    if (result.ok) {
      recordRecentProject(projectPath, path.basename(projectPath))
    }
    return result
  })

  ipcMain.handle('studio:getConnectionInfo', (_event, projectPath: string) => getConnectionInfo(projectPath))

  ipcMain.handle('studio:pull', async (_event, projectPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, mergedFiles: [], clashes: [], arrivedChanges: [], entries: [], error: 'claude-code-sdlc plugin scripts not found' }
    return pull(projectPath, scriptsDir)
  })

  ipcMain.handle(
    'studio:resolveClash',
    async (_event, projectPath: string, filePath: string, sectionKey: string, choice: ClashChoice, combinedText?: string) => {
      const scriptsDir = await resolvePluginScriptsDir()
      if (!scriptsDir) return { ok: false, fileFullyResolved: false, error: 'claude-code-sdlc plugin scripts not found' }
      return resolveClash(projectPath, scriptsDir, filePath, sectionKey, choice, combinedText)
    },
  )

  ipcMain.handle('studio:save', async (_event, projectPath: string, changeNote: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, entries: [], error: 'claude-code-sdlc plugin scripts not found' }
    return save(projectPath, scriptsDir, changeNote)
  })

  ipcMain.handle('studio:getPendingClashes', async (_event, projectPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? getPendingClashes(projectPath, scriptsDir) : []
  })

  ipcMain.handle('studio:combineWithClaude', async (_event, projectPath: string, localText: string, remoteText: string) => {
    const settings = loadSettings()
    return combineWithClaude(settings.claudePathOverride ?? 'claude', projectPath, localText, remoteText)
  })

  // --- Documents (spec 0010) ---

  ipcMain.handle('studio:getStageReadiness', async (_event, projectPath: string, stageId?: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) {
      return {
        ok: false, stageId: '', display: '', isCurrent: false, documents: [], findings: [],
        judgementConditions: [], signOff: { status: 'unknown', signedOffBy: null, completedAt: null },
        ready: false, error: 'claude-code-sdlc plugin scripts not found',
      }
    }
    return getStageReadiness(projectPath, scriptsDir, stageId)
  })

  const noScripts = (relPath: string) => ({
    ok: false, path: relPath, shaped: false, warnings: [], sections: [],
    error: 'claude-code-sdlc plugin scripts not found',
  })

  ipcMain.handle('studio:getBoard', async (_event, projectPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) {
      return { rows: [], codeHostAvailable: false, teamLimits: null,
               error: 'claude-code-sdlc plugin scripts not found' }
    }
    return getBoard(projectPath, scriptsDir)
  })

  ipcMain.handle('studio:getSpecReadiness', async (_event, projectPath: string, specPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) {
      return { ok: false, error: 'claude-code-sdlc plugin scripts not found', ready: false,
               spec: '', risk: '', status: '', blocking: [], advisory: [], passed: [] }
    }
    return getSpecReadiness(projectPath, scriptsDir, specPath)
  })

  const noPlugin = { ok: false, refusal: { kind: 'other', message: 'claude-code-sdlc plugin scripts not found' } }

  ipcMain.handle('studio:markSpecReady', async (_event, projectPath: string, specPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return noPlugin
    return transitionSpec(projectPath, scriptsDir, specPath, { kind: 'ready' })
  })

  ipcMain.handle(
    'studio:setSpecRisk',
    async (_event, projectPath: string, specPath: string, tier: string, authorisedBy?: string) => {
      const scriptsDir = await resolvePluginScriptsDir()
      if (!scriptsDir) return noPlugin
      return transitionSpec(projectPath, scriptsDir, specPath, { kind: 'risk', tier, authorisedBy })
    },
  )

  ipcMain.handle('studio:getSpecStatus', async (_event, projectPath: string, specPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
    return getSpecStatus(projectPath, scriptsDir, specPath)
  })

  ipcMain.handle(
    'studio:handOff',
    async (_event, projectPath: string, specPath: string, developer: string, overLimitReason?: string) => {
      const scriptsDir = await resolvePluginScriptsDir()
      if (!scriptsDir) {
        return { ok: false, refusal: { kind: 'other' as const,
                 message: 'claude-code-sdlc plugin scripts not found' } }
      }
      return handOff(projectPath, scriptsDir, specPath, developer, overLimitReason)
    },
  )

  ipcMain.handle('studio:openDocument', async (_event, projectPath: string, relPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? openDocument(projectPath, scriptsDir, relPath) : noScripts(relPath)
  })

  ipcMain.handle('studio:getDocumentChanges', async (_event, projectPath: string, relPath: string) => {
    const branchEntry = await runGitTolerant(['branch', '--show-current'], projectPath)
    if (!branchEntry.ok) return []
    return getDocumentChanges(projectPath, relPath, getLastSeenCommit(projectPath, relPath), branchEntry.stdout.trim())
  })

  ipcMain.handle('studio:markDocumentSeen', async (_event, projectPath: string, relPath: string) => {
    const head = await runGitTolerant(['rev-parse', 'HEAD'], projectPath)
    if (head.ok) setLastSeenCommit(projectPath, relPath, head.stdout.trim())
  })

  ipcMain.handle(
    'studio:setField',
    async (_event, projectPath: string, relPath: string, sectionKey: string, label: string, value: string) => {
      const scriptsDir = await resolvePluginScriptsDir()
      return scriptsDir ? setField(projectPath, scriptsDir, relPath, sectionKey, label, value) : noScripts(relPath)
    },
  )

  ipcMain.handle('studio:nextNumber', async (_event, projectPath: string, relPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
    return nextNumber(projectPath, scriptsDir, relPath)
  })

  ipcMain.handle('studio:addInstance', async (_event, projectPath: string, relPath: string, title: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? addInstance(projectPath, scriptsDir, relPath, title) : noScripts(relPath)
  })

  ipcMain.handle('studio:listVersions', async (_event, projectPath: string, relPath: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    return scriptsDir ? listVersions(projectPath, scriptsDir, relPath) : []
  })

  ipcMain.handle('studio:getVersionText', async (_event, projectPath: string, relPath: string, ref: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
    return getVersionText(projectPath, scriptsDir, relPath, ref)
  })

  ipcMain.handle('studio:diffVersions', async (_event, projectPath: string, relPath: string, a: string, b: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
    return diffVersions(projectPath, scriptsDir, relPath, a, b)
  })

  ipcMain.handle('studio:previewRestore', async (_event, projectPath: string, relPath: string, ref: string) => {
    const scriptsDir = await resolvePluginScriptsDir()
    if (!scriptsDir) {
      return { ok: false, diffHash: '', diff: '', needsSignOffAck: false, error: 'claude-code-sdlc plugin scripts not found' }
    }
    return previewRestore(projectPath, scriptsDir, relPath, ref)
  })

  ipcMain.handle(
    'studio:confirmRestore',
    async (_event, projectPath: string, relPath: string, ref: string, actor: string, diffHash: string, ackSignOff: boolean) => {
      const scriptsDir = await resolvePluginScriptsDir()
      if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
      return confirmRestore(projectPath, scriptsDir, relPath, ref, actor, diffHash, ackSignOff)
    },
  )

  ipcMain.handle(
    'studio:draftField',
    async (_event, projectPath: string, relPath: string, sectionKey: string, label: string, guidance: string) => {
      const scriptsDir = await resolvePluginScriptsDir()
      if (!scriptsDir) return { ok: false, error: 'claude-code-sdlc plugin scripts not found' }
      const doc = await openDocument(projectPath, scriptsDir, relPath)
      const section = doc.sections.find((s) => s.key === sectionKey)
      const settings = loadSettings()
      return draftField(
        settings.claudePathOverride ?? 'claude',
        projectPath,
        relPath.split('/').pop() ?? relPath,
        section?.heading ?? sectionKey,
        label,
        guidance,
        section?.text ?? '',
      )
    },
  )

  ipcMain.handle(
    'studio:recordDraftOutcome',
    async (
      _event, projectPath: string, relPath: string, label: string, outcome: DraftOutcome,
      actor: string, charsOffered: number, charsKept: number, instance?: string,
    ) => {
      const scriptsDir = await resolvePluginScriptsDir()
      if (!scriptsDir) return
      await recordDraftOutcome(projectPath, scriptsDir, relPath, label, outcome, actor, charsOffered, charsKept, instance)
    },
  )

  onSyncState((state) => {
    win?.webContents.send('studio:syncState', state)
  })

  ipcMain.handle('studio:getConsoleLog', () => getConsoleLog())

  // Push new console entries to the renderer as they happen, so the console panel updates
  // live rather than only on the next getConsoleLog() poll.
  onConsoleEntry((entry) => {
    win?.webContents.send('studio:consoleEntry', entry)
  })
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'SDLC Studio',
    width: 1280,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC!, 'favicon.ico'), // set unconditionally above, before createWindow() can run
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window may only ever show Studio's own page. Without this, anything that could make
  // the page navigate elsewhere would hand a remote site the whole `window.studio` API —
  // every file read and write, and every call that starts a process. The window-open handler
  // above already covers new windows; this covers the top-level frame itself, which it does
  // not. (Spec 0010's security pass.)
  const isOurOwnPage = (url: string) =>
    (VITE_DEV_SERVER_URL !== undefined && url.startsWith(VITE_DEV_SERVER_URL)) || url.startsWith('file://')

  win.webContents.on('will-navigate', (event, url) => {
    if (!isOurOwnPage(url)) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event, url) => {
    if (!isOurOwnPage(url)) event.preventDefault()
  })
}

// An embedded browser frame would be another way to reach a remote origin inside the app, and
// Studio has no use for one. Refused for every web contents, not just the main window.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.whenReady().then(() => {
  initSettingsPath(app.getPath('userData'))
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
