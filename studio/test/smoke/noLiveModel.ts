/** Keeps the smoke run off the live model.
 *
 * Opening a stage that has a document not yet started makes Studio's chat greet the person with a
 * real model call, with no click involved, and several buttons start a run of their own. A smoke
 * run that walks every stage would spend real money and give different words every time. So the
 * main process's model entry points are replaced for this run, the same way the folder chooser is
 * replaced elsewhere. The chat answers with a fixed stand-in message; every other model entry point
 * refuses with a plain sentence, so a stray click can never start a run.
 *
 * Nothing about the renderer changes: it calls the same bridge and receives the same shapes. The
 * real chat, with a real model, is exercised by chatAuthoring.spec.ts.
 */

import type { ElectronApplication } from '@playwright/test'

export async function switchOffLiveModel(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    type Msg = { id: string; role: 'assistant' | 'user'; text: string; questions: never[]; proposals: never[]; at: string }
    type Turn = { ok: boolean; state: { sessionId: string | null; messages: Msg[] }; error?: string }
    const chats = new Map<string, Turn['state']>()
    const key = (project: string, stage: string) => `${project}\u0000${stage}`
    const say = (role: Msg['role'], text: string): Msg => ({ id: `stand-in-${Math.random().toString(36).slice(2)}`, role, text, questions: [], proposals: [], at: new Date().toISOString() })

    const replace = (channel: string, handler: (...args: any[]) => unknown) => {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (_event, ...args) => handler(...args))
    }

    replace('studio:getChatState', (project: string, stage: string) => chats.get(key(project, stage)) ?? { sessionId: null, messages: [] })
    replace('studio:ensureChatStarted', (project: string, stage: string): Turn => {
      const prior = chats.get(key(project, stage))
      if (prior && prior.messages.length > 0) return { ok: true, state: prior }
      const state = { sessionId: 'stand-in', messages: [say('assistant', 'Stand-in assistant (the smoke run does not use the live model). Which document would you like to start with?')] }
      chats.set(key(project, stage), state)
      return { ok: true, state }
    })
    replace('studio:sendChatMessage', (project: string, stage: string, text: string): Turn => {
      const prior = chats.get(key(project, stage)) ?? { sessionId: 'stand-in', messages: [] }
      const state = { sessionId: 'stand-in', messages: [...prior.messages, say('user', text), say('assistant', 'Stand-in reply.')] }
      chats.set(key(project, stage), state)
      return { ok: true, state }
    })
    replace('studio:answerChatQuestion', (project: string, stage: string): Turn => ({ ok: true, state: chats.get(key(project, stage)) ?? { sessionId: null, messages: [] } }))

    const refuse = 'Model runs are switched off for this smoke run.'
    replace('studio:startDraft', () => ({ ok: false, error: refuse }))
    replace('studio:startBatch', () => ({ ok: false, error: refuse }))
    replace('studio:combineWithClaude', () => ({ error: refuse }))
  })
}
