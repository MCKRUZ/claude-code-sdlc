import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { detectAllTooling } from './tooling'
import { getConsoleLog, onConsoleEntry } from './commandRunner'
import { initSettingsPath, loadSettings, recordRecentProject, saveSettings, type Settings } from './settings'
import { hasSdlcProject, listAvailableProfiles, openProject, previewSetup, runSetup } from './project'

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
 * re-resolved if the person changes the override in settings. */
let resolvedPluginScriptsDir: string | null = null

async function resolvePluginScriptsDir(): Promise<string | null> {
  if (resolvedPluginScriptsDir) return resolvedPluginScriptsDir
  const settings = loadSettings()
  const report = await detectAllTooling({
    claudePath: settings.claudePathOverride,
    uvPath: settings.uvPathOverride,
    pluginScriptsPath: settings.pluginScriptsPathOverride,
  })
  if (report.pluginScripts.found && report.pluginScripts.path) {
    resolvedPluginScriptsDir = report.pluginScripts.path
  }
  return resolvedPluginScriptsDir
}

function registerIpcHandlers() {
  ipcMain.handle('studio:detectTooling', async () => {
    const settings = loadSettings()
    return detectAllTooling({
      claudePath: settings.claudePathOverride,
      uvPath: settings.uvPathOverride,
      pluginScriptsPath: settings.pluginScriptsPathOverride,
    })
  })

  ipcMain.handle('studio:getSettings', () => loadSettings())

  ipcMain.handle('studio:setToolOverride', (_event, kind: 'claude' | 'uv' | 'pluginScripts', overridePath: string) => {
    const settings = loadSettings()
    const key = kind === 'claude' ? 'claudePathOverride' : kind === 'uv' ? 'uvPathOverride' : 'pluginScriptsPathOverride'
    const updated: Settings = { ...settings, [key]: overridePath }
    saveSettings(updated)
    resolvedPluginScriptsDir = null // force re-resolve if the plugin path changed
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
    const result = await openProject(scriptsDir, projectPath)
    if (result.hasProject && result.status) {
      recordRecentProject(projectPath, result.status.project_name)
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
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
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
}

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
