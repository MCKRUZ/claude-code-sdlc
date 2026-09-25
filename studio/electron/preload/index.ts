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
  save: (projectPath, changeNote, options) =>
    ipcRenderer.invoke('studio:save', projectPath, changeNote, options),
  onSyncState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: SyncState) => callback(state)
    ipcRenderer.on('studio:syncState', handler)
    return () => ipcRenderer.off('studio:syncState', handler)
  },
  getPendingClashes: (projectPath) => ipcRenderer.invoke('studio:getPendingClashes', projectPath),
  combineWithClaude: (projectPath, localText, remoteText) =>
    ipcRenderer.invoke('studio:combineWithClaude', projectPath, localText, remoteText),

  getStageReadiness: (projectPath, stageId) => ipcRenderer.invoke('studio:getStageReadiness', projectPath, stageId),
  openDocument: (projectPath, relPath) => ipcRenderer.invoke('studio:openDocument', projectPath, relPath),
  getDocumentChanges: (projectPath, relPath) => ipcRenderer.invoke('studio:getDocumentChanges', projectPath, relPath),
  markDocumentSeen: (projectPath, relPath) => ipcRenderer.invoke('studio:markDocumentSeen', projectPath, relPath),
  setField: (projectPath, relPath, sectionKey, label, value) =>
    ipcRenderer.invoke('studio:setField', projectPath, relPath, sectionKey, label, value),
  nextNumber: (projectPath, relPath) => ipcRenderer.invoke('studio:nextNumber', projectPath, relPath),
  addInstance: (projectPath, relPath, title) => ipcRenderer.invoke('studio:addInstance', projectPath, relPath, title),

  listVersions: (projectPath, relPath) => ipcRenderer.invoke('studio:listVersions', projectPath, relPath),
  getVersionText: (projectPath, relPath, ref) => ipcRenderer.invoke('studio:getVersionText', projectPath, relPath, ref),
  diffVersions: (projectPath, relPath, a, b) => ipcRenderer.invoke('studio:diffVersions', projectPath, relPath, a, b),
  previewRestore: (projectPath, relPath, ref) => ipcRenderer.invoke('studio:previewRestore', projectPath, relPath, ref),
  confirmRestore: (projectPath, relPath, ref, actor, diffHash, ackSignOff) =>
    ipcRenderer.invoke('studio:confirmRestore', projectPath, relPath, ref, actor, diffHash, ackSignOff),

  getBoard: (projectPath) => ipcRenderer.invoke('studio:getBoard', projectPath),
  getProjectSettings: (projectPath) => ipcRenderer.invoke('studio:getProjectSettings', projectPath),
  getConnectionReport: (projectPath) => ipcRenderer.invoke('studio:getConnectionReport', projectPath),
  setRosterPerson: (projectPath, handle, fields) =>
    ipcRenderer.invoke('studio:setRosterPerson', projectPath, handle, fields),
  setTeamLimit: (projectPath, team, limit) =>
    ipcRenderer.invoke('studio:setTeamLimit', projectPath, team, limit),
  setStageApproval: (projectPath, stage, required, approver) =>
    ipcRenderer.invoke('studio:setStageApproval', projectPath, stage, required, approver),
  getSpecReadiness: (projectPath, specPath) =>
    ipcRenderer.invoke('studio:getSpecReadiness', projectPath, specPath),
  markSpecReady: (projectPath, specPath) =>
    ipcRenderer.invoke('studio:markSpecReady', projectPath, specPath),
  setSpecRisk: (projectPath, specPath, tier, authorisedBy) =>
    ipcRenderer.invoke('studio:setSpecRisk', projectPath, specPath, tier, authorisedBy),
  getSpecStatus: (projectPath, specPath) =>
    ipcRenderer.invoke('studio:getSpecStatus', projectPath, specPath),
  handOff: (projectPath, specPath, developer, overLimitReason) =>
    ipcRenderer.invoke('studio:handOff', projectPath, specPath, developer, overLimitReason),

  draftField: (projectPath, relPath, sectionKey, label, guidance) =>
    ipcRenderer.invoke('studio:draftField', projectPath, relPath, sectionKey, label, guidance),
  recordDraftOutcome: (projectPath, relPath, label, outcome, actor, charsOffered, charsKept, instance) =>
    ipcRenderer.invoke('studio:recordDraftOutcome', projectPath, relPath, label, outcome, actor, charsOffered, charsKept, instance),

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
