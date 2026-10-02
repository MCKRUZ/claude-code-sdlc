/** chat.ts's IPC/orchestration layer — the fold-turn-result-into-persisted-state half, and the
 * resolve-a-proposal half. Both mock their own dependencies (commandRunner's runCommand,
 * documents.ts, drafts.ts) the same way test/pluginContract.test.ts already does, rather than
 * spawning a real `claude` process or a real plugin — these are regression tests for chat.ts's
 * OWN logic, not for the CLI or the plugin scripts. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../electron/main/commandRunner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/commandRunner')>()),
  runCommand: vi.fn(),
}))
vi.mock('../electron/main/documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/documents')>()),
  openDocument: vi.fn(),
  setField: vi.fn(),
  // Existing tests below use document paths that are not real; the default is "already exists".
  ensureDocumentFromTemplate: vi.fn(() => ({ ok: true, created: false })),
}))
vi.mock('../electron/main/drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../electron/main/drafts')>()),
  recordDraftOutcome: vi.fn(),
}))

import { runCommand } from '../electron/main/commandRunner'
import { ensureDocumentFromTemplate, openDocument, setField } from '../electron/main/documents'
import { recordDraftOutcome } from '../electron/main/drafts'
import { initSettingsPath, saveChatState } from '../electron/main/settings'
import { ipcResolveChatProposal, ipcSendChatMessage, type ChatContext } from '../electron/main/chat'
import type { ChatState, OpenDocumentResult } from '../shared/types'

function baseCtx(projectPath: string): ChatContext {
  return {
    projectPath,
    pluginScriptsDir: '/fake/scripts',
    stageId: '0',
    stageDisplay: 'Discovery',
    claudePath: 'claude',
    execPath: 'C:/fake/electron.exe',
  }
}

describe('ipcSendChatMessage — a failed turn must not lose the person\'s own message', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'chat-orchestration-'))
    initSettingsPath(userDataDir)
    vi.mocked(runCommand).mockReset()
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('on a FAILED turn, the just-typed message is still saved into the persisted chat state (never silently dropped)', async () => {
    vi.mocked(runCommand).mockResolvedValue({
      id: '1', command: 'claude', args: [], cwd: '', startedAt: '', durationMs: 0,
      exitCode: 1, ok: false, stdout: '', stderr: 'the model call failed',
    })

    const ctx = baseCtx(join(userDataDir, 'project'))
    const result = await ipcSendChatMessage(ctx, 'my carefully typed message')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('the model call failed')
    // The message the person actually submitted is STILL in the returned (and persisted)
    // state — not vanished because the turn that would have answered it failed.
    expect(result.state.messages).toHaveLength(1)
    expect(result.state.messages[0]).toMatchObject({ role: 'user', text: 'my carefully typed message' })
  })

  it('the failed turn\'s persisted state is what a later read actually returns — not just what this call happened to return', async () => {
    vi.mocked(runCommand).mockResolvedValue({
      id: '1', command: 'claude', args: [], cwd: '', startedAt: '', durationMs: 0,
      exitCode: 1, ok: false, stdout: '', stderr: 'boom',
    })
    const ctx = baseCtx(join(userDataDir, 'project'))
    await ipcSendChatMessage(ctx, 'first attempt')

    const { readChatState } = await import('../electron/main/chat')
    const reloaded = readChatState(ctx.projectPath, ctx.stageId)
    expect(reloaded.messages).toHaveLength(1)
    expect(reloaded.messages[0]).toMatchObject({ role: 'user', text: 'first attempt' })
  })

  it('does NOT change the session id on failure, so a retry still resumes (or starts) the right session', async () => {
    vi.mocked(runCommand).mockResolvedValue({
      id: '1', command: 'claude', args: [], cwd: '', startedAt: '', durationMs: 0,
      exitCode: 1, ok: false, stdout: '', stderr: 'boom',
    })
    const ctx = baseCtx(join(userDataDir, 'project'))
    const result = await ipcSendChatMessage(ctx, 'hello')
    // No prior session existed, and the failed attempt's own generated id must not leak in —
    // a NEW conversation on retry still gets --session-id, not a half-used --resume value.
    expect(result.state.sessionId).toBeNull()
  })

  it('on a SUCCESSFUL turn, behaves exactly as before: the message and the reply are both saved', async () => {
    vi.mocked(runCommand).mockResolvedValue({
      id: '1', command: 'claude', args: [], cwd: '', startedAt: '', durationMs: 0,
      exitCode: 0, ok: true, stdout: '', stderr: '',
    })
    const ctx = baseCtx(join(userDataDir, 'project'))
    const result = await ipcSendChatMessage(ctx, 'hello')
    expect(result.ok).toBe(true)
    expect(result.state.messages).toHaveLength(1) // the user message; stream-json parsed no assistant reply from empty stdout
    expect(result.state.messages[0]).toMatchObject({ role: 'user', text: 'hello' })
    expect(result.state.sessionId).not.toBeNull() // a fresh session id WAS assigned on success
  })
})

describe('ipcResolveChatProposal — instance key parity with DocumentView.tsx\'s structured editor', () => {
  let userDataDir: string
  const proposalId = 'proposal-1'

  function seedState(projectPath: string, stageId: string): void {
    const state: ChatState = {
      sessionId: 'sess-1',
      messages: [{
        id: 'm1',
        role: 'assistant',
        text: '',
        questions: [],
        proposals: [{
          id: proposalId,
          document: '.sdlc/artifacts/01-requirements/requirements.md',
          section: 'Functional Requirements > FR-003',
          field: 'Description',
          value: 'new text',
        }],
        at: new Date().toISOString(),
      }],
    }
    saveChatState(projectPath, stageId, state)
  }

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'chat-orchestration-proposal-'))
    initSettingsPath(userDataDir)
    vi.mocked(openDocument).mockReset()
    vi.mocked(setField).mockReset()
    vi.mocked(recordDraftOutcome).mockReset()
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('records the draft-ledger instance as the repeating instance\'s HEADING (e.g. "FR-003") — the same key DocumentView.tsx computes, never a bare section number', async () => {
    const projectPath = join(userDataDir, 'project')
    seedState(projectPath, '1')

    const openResult: OpenDocumentResult = {
      ok: true, path: '.sdlc/artifacts/01-requirements/requirements.md', shaped: true, warnings: [],
      sections: [{
        kind: 'repeating_instance',
        key: 'Functional Requirements#3',
        heading: 'FR-003',
        start: 0, end: 10, text: '...',
        fields: { Description: { label: 'Description', value: 'old', start: 0, end: 3, type: 'longtext', required: false, anchor: 'field', empty: false } },
        number: 3,
      }],
    }
    vi.mocked(openDocument).mockResolvedValue(openResult)
    vi.mocked(setField).mockResolvedValue(openResult)
    vi.mocked(recordDraftOutcome).mockResolvedValue({ ok: true })

    const ctx = baseCtx(projectPath)
    ctx.stageId = '1'
    const result = await ipcResolveChatProposal(ctx, proposalId, 'accepted', 'new text', 'matt')

    expect(result.ok).toBe(true)
    expect(recordDraftOutcome).toHaveBeenCalledTimes(1)
    const instanceArg = vi.mocked(recordDraftOutcome).mock.calls[0][8]
    expect(instanceArg).toBe('FR-003') // section.heading — matches DocumentView.tsx's sectionInstanceKey(section)
    expect(instanceArg).not.toBe('3') // the OLD, wrong value (String(section.number))
  })

  it('records instance as undefined for an ordinary (non-repeating) section', async () => {
    const projectPath = join(userDataDir, 'project')
    seedState(projectPath, '1')

    const openResult: OpenDocumentResult = {
      ok: true, path: '.sdlc/artifacts/01-requirements/requirements.md', shaped: true, warnings: [],
      sections: [{
        kind: 'section',
        key: 'Functional Requirements > FR-003',
        heading: 'Functional Requirements > FR-003',
        start: 0, end: 10, text: '...',
        fields: { Description: { label: 'Description', value: 'old', start: 0, end: 3, type: 'longtext', required: false, anchor: 'field', empty: false } },
      }],
    }
    vi.mocked(openDocument).mockResolvedValue(openResult)
    vi.mocked(setField).mockResolvedValue(openResult)
    vi.mocked(recordDraftOutcome).mockResolvedValue({ ok: true })

    const ctx = baseCtx(projectPath)
    ctx.stageId = '1'
    await ipcResolveChatProposal(ctx, proposalId, 'accepted', 'new text', 'matt')

    const instanceArg = vi.mocked(recordDraftOutcome).mock.calls[0][8]
    expect(instanceArg).toBeUndefined()
  })

  it('resolving only the addressed proposal leaves any OTHER pending proposal in the same message untouched', async () => {
    const projectPath = join(userDataDir, 'project')
    const state: ChatState = {
      sessionId: 'sess-1',
      messages: [{
        id: 'm1', role: 'assistant', text: '', questions: [],
        proposals: [
          { id: 'p1', document: 'd.md', section: 'S1', field: 'F1', value: 'V1' },
          { id: 'p2', document: 'd.md', section: 'S2', field: 'F2', value: 'V2' },
        ],
        at: new Date().toISOString(),
      }],
    }
    saveChatState(projectPath, '1', state)

    const openResult: OpenDocumentResult = {
      ok: true, path: 'd.md', shaped: true, warnings: [],
      sections: [{
        kind: 'section', key: 'S1', heading: 'S1', start: 0, end: 1, text: '',
        fields: { F1: { label: 'F1', value: 'old', start: 0, end: 1, type: 'text', required: false, anchor: 'field', empty: false } },
      }],
    }
    vi.mocked(openDocument).mockResolvedValue(openResult)
    vi.mocked(setField).mockResolvedValue(openResult)
    vi.mocked(recordDraftOutcome).mockResolvedValue({ ok: true })

    const ctx = baseCtx(projectPath)
    ctx.stageId = '1'
    const result = await ipcResolveChatProposal(ctx, 'p1', 'accepted', 'V1', 'matt')

    const resolved = result.state.messages[0].proposals.find((p) => p.id === 'p1')
    const untouched = result.state.messages[0].proposals.find((p) => p.id === 'p2')
    expect(resolved?.outcome).toBe('accepted')
    expect(untouched?.outcome).toBeUndefined()
  })
})

describe('runChatTurn — live activity for the chat panel', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'chat-activity-'))
    initSettingsPath(userDataDir)
    vi.mocked(runCommand).mockReset()
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  const readLine = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'requirements.md' } }] },
  })
  const grepLine = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Grep', input: { pattern: 'x' } }] },
  })

  it('reports each distinct step once, even though stdout chunks arrive far more often than steps change', async () => {
    vi.mocked(runCommand).mockImplementation(async (_cmd, _args, _cwd, opts) => {
      // Four chunks, as runCommand would deliver them: the stdout accumulated so far, each time.
      opts?.onChunk?.(readLine.slice(0, 20)) // half-written line: nothing describable yet
      opts?.onChunk?.(readLine + '\n')
      opts?.onChunk?.(readLine + '\n') // same step again
      opts?.onChunk?.(readLine + '\n' + grepLine + '\n')
      return { id: '1', command: 'claude', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode: 0, ok: true, stdout: '', stderr: '' }
    })
    const labels: string[] = []
    const ctx: ChatContext = { ...baseCtx(join(userDataDir, 'project')), onActivity: (l) => labels.push(l) }

    await ipcSendChatMessage(ctx, 'hello')

    expect(labels).toEqual(['Reading requirements.md', 'Searching the project'])
  })

  it('works unchanged when no one is listening (onActivity is optional)', async () => {
    vi.mocked(runCommand).mockImplementation(async (_cmd, _args, _cwd, opts) => {
      opts?.onChunk?.(readLine + '\n')
      return { id: '1', command: 'claude', args: [], cwd: '', startedAt: '', durationMs: 0, exitCode: 0, ok: true, stdout: '', stderr: '' }
    })
    const result = await ipcSendChatMessage(baseCtx(join(userDataDir, 'project')), 'hello')
    expect(result.ok).toBe(true)
  })
})

describe('ipcResolveChatProposal — a document nobody has started yet', () => {
  let userDataDir: string
  const proposalId = 'p-new'
  const doc = '.sdlc/artifacts/03-foundation/foundation-report.md'

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'chat-orchestration-start-'))
    initSettingsPath(userDataDir)
    vi.mocked(openDocument).mockReset()
    vi.mocked(setField).mockReset()
    vi.mocked(recordDraftOutcome).mockReset()
    vi.mocked(ensureDocumentFromTemplate).mockClear()
    saveChatState(join(userDataDir, 'project'), '3', {
      sessionId: 's',
      messages: [{
        id: 'm1', role: 'assistant', text: '', questions: [], at: new Date().toISOString(),
        proposals: [{ id: proposalId, document: doc, section: 'Infrastructure', field: 'Infrastructure', value: 'v' }],
      }],
    })
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  const openOk: OpenDocumentResult = {
    ok: true, path: doc, shaped: true, warnings: [],
    sections: [{
      kind: 'section', key: 'Infrastructure', heading: 'Infrastructure', start: 0, end: 10, text: '...',
      fields: { Infrastructure: { label: 'Infrastructure', value: '', start: 0, end: 0, type: 'checklist', required: true, anchor: 'section', empty: true } },
    }],
  }

  it('starts the document from its template before opening it, so the first accepted proposal can land', async () => {
    vi.mocked(openDocument).mockResolvedValue(openOk)
    vi.mocked(setField).mockResolvedValue(openOk)
    vi.mocked(recordDraftOutcome).mockResolvedValue({ ok: true })
    const ctx = { ...baseCtx(join(userDataDir, 'project')), stageId: '3' }

    const result = await ipcResolveChatProposal(ctx, proposalId, 'accepted', 'v', 'matt')

    expect(result.ok).toBe(true)
    expect(ensureDocumentFromTemplate).toHaveBeenCalledWith(ctx.projectPath, ctx.pluginScriptsDir, doc)
    expect(vi.mocked(ensureDocumentFromTemplate).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(openDocument).mock.invocationCallOrder[0])
  })

  it('when the document cannot be started, says why, writes nothing and leaves the proposal pending', async () => {
    vi.mocked(ensureDocumentFromTemplate).mockReturnValueOnce({ ok: false, error: 'There is no template for x.' })
    const ctx = { ...baseCtx(join(userDataDir, 'project')), stageId: '3' }

    const result = await ipcResolveChatProposal(ctx, proposalId, 'accepted', 'v', 'matt')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('There is no template for x.')
    expect(setField).not.toHaveBeenCalled()
    expect(result.state.messages[0].proposals[0].outcome).toBeUndefined()
  })

  it('does not start a document just to discard a proposal for it', async () => {
    vi.mocked(recordDraftOutcome).mockResolvedValue({ ok: true })
    const ctx = { ...baseCtx(join(userDataDir, 'project')), stageId: '3' }

    const result = await ipcResolveChatProposal(ctx, proposalId, 'discarded', '', 'matt')

    expect(result.ok).toBe(true)
    expect(ensureDocumentFromTemplate).not.toHaveBeenCalled()
  })
})
