import { contextBridge, ipcRenderer } from 'electron'
import type { ConsoleEntry, StudioApi, SyncState } from '../../shared/types'

// The ONLY surface the renderer gets. No generic ipcRenderer passthrough, no Node access,
// no arbitrary command execution — every call here maps to exactly one narrow main-process
// handler, and every one of those handlers goes through commandRunner's single choke point
// when it needs to run anything, so every command Studio runs is recorded to the console.
// Typed against the shared StudioApi interface, so a mismatch with what the renderer
// expects is a compile error here, not a runtime surprise.
const studio: StudioApi = {
  detectTooling: () => ipcRenderer.invoke('studio:detectTooling'),
  getSettings: () => ipcRenderer.invoke('studio:getSettings'),
  setToolOverride: (kind, path) => ipcRenderer.invoke('studio:setToolOverride', kind, path),

  pickFolder: () => ipcRenderer.invoke('studio:pickFolder'),
  hasSdlcProject: (projectPath) => ipcRenderer.invoke('studio:hasSdlcProject', projectPath),
  openProject: (projectPath) => ipcRenderer.invoke('studio:openProject', projectPath),

  listProfiles: () => ipcRenderer.invoke('studio:listProfiles'),
  previewSetup: (projectPath, profileId) => ipcRenderer.invoke('studio:previewSetup', projectPath, profileId),
  runSetup: (projectPath, profileId) => ipcRenderer.invoke('studio:runSetup', projectPath, profileId),

  getConnectionInfo: (projectPath) => ipcRenderer.invoke('studio:getConnectionInfo', projectPath),
  pull: (projectPath) => ipcRenderer.invoke('studio:pull', projectPath),
  resolveClash: (projectPath, filePath, sectionKey, choice, combinedText) =>
    ipcRenderer.invoke('studio:resolveClash', projectPath, filePath, sectionKey, choice, combinedText),
  save: (projectPath, changeNote) => ipcRenderer.invoke('studio:save', projectPath, changeNote),
  onSyncState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SyncState) => callback(state)
    ipcRenderer.on('studio:syncState', handler)
    return () => ipcRenderer.off('studio:syncState', handler)
  },
  getPendingClashes: (projectPath) => ipcRenderer.invoke('studio:getPendingClashes', projectPath),
  combineWithClaude: (projectPath, localText, remoteText) =>
    ipcRenderer.invoke('studio:combineWithClaude', projectPath, localText, remoteText),

  getConsoleLog: () => ipcRenderer.invoke('studio:getConsoleLog'),
  onConsoleEntry: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: ConsoleEntry) => callback(entry)
    ipcRenderer.on('studio:consoleEntry', handler)
    return () => ipcRenderer.off('studio:consoleEntry', handler)
  },
}

contextBridge.exposeInMainWorld('studio', studio)

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
