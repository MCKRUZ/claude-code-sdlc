import { useSyncExternalStore } from 'react'

/** How the Workflow tab asks the chat panel to send ONE turn (spec 0024's "Talk it through").
 *
 * The chat panel is a sibling of the stage screen in the frame, not an ancestor or descendant, so
 * neither can hand the other a callback directly. The chat panel registers the one function that
 * sends a turn through its own send path (same busy/state/error handling as a typed message); the
 * Workflow tab calls it. With no chat mounted nothing is registered and `useChatAvailable` says so,
 * so the control is disabled instead of failing. */

export type ChatSendResult = { sent: true } | { sent: false; reason: string }
export type ChatSender = (text: string) => Promise<ChatSendResult>

let sender: ChatSender | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Registers the chat panel's sender; returns the function that unregisters it. A later
 * registration replaces an earlier one, and a stale unregister never removes a newer sender. */
export function registerChatSender(next: ChatSender): () => void {
  sender = next
  notify()
  return () => {
    if (sender === next) {
      sender = null
      notify()
    }
  }
}

export async function sendChatTurn(text: string): Promise<ChatSendResult> {
  if (!sender) return { sent: false, reason: 'The chat is not open.' }
  return sender(text)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** True while a chat panel is mounted and able to take a turn. */
export function useChatAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => sender !== null)
}
