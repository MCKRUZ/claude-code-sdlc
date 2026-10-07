// @vitest-environment jsdom
/** The chat's collapsed flag is per area and remembered: sprint home and planning start
 * collapsed, every other area open; a toggle flips only the showing area and survives a reload
 * through localStorage; garbage in storage reads as "no choice yet". */
import { afterEach, describe, expect, it } from 'vitest'
import { CHAT_COLLAPSED_STORAGE_KEY, CHAT_RAIL_WIDTH, chatStore, defaultCollapsed, isChatCollapsed, resetChatStore } from '../src/stores/chatStore'

afterEach(resetChatStore)

describe('chatStore', () => {
  it('starts collapsed on the sprint home and planning, open everywhere else', () => {
    expect(defaultCollapsed('sprint')).toBe(true)
    expect(defaultCollapsed('planning')).toBe(true)
    for (const area of ['documents', 'build', 'explain', 'closing', 'settings', 'steering'] as const) expect(defaultCollapsed(area)).toBe(false)
    expect(isChatCollapsed('sprint')).toBe(true)
    expect(isChatCollapsed('documents')).toBe(false)
  })

  it('toggle flips the showing area alone and remembers it', () => {
    let fired = 0
    const off = chatStore.subscribe(() => { fired += 1 })
    chatStore.toggle('sprint')
    expect(isChatCollapsed('sprint')).toBe(false)
    expect(isChatCollapsed('planning')).toBe(true)
    expect(fired).toBe(1)
    expect(JSON.parse(localStorage.getItem(CHAT_COLLAPSED_STORAGE_KEY) ?? '{}')).toEqual({ sprint: false })
    chatStore.toggle('documents')
    expect(isChatCollapsed('documents')).toBe(true)
    off()
  })

  it('a remembered choice beats the default; garbage in storage is "no choice yet"', () => {
    // reset forgets storage AND the in-memory copy, so a value seeded afterwards is what the
    // next read sees — the same path a reload takes.
    resetChatStore()
    localStorage.setItem(CHAT_COLLAPSED_STORAGE_KEY, JSON.stringify({ sprint: false, documents: true, planning: 'yes' }))
    expect(isChatCollapsed('sprint')).toBe(false)
    expect(isChatCollapsed('documents')).toBe(true)
    expect(isChatCollapsed('planning')).toBe(true) // the non-boolean was dropped → default
    resetChatStore()
    localStorage.setItem(CHAT_COLLAPSED_STORAGE_KEY, '{not json')
    expect(isChatCollapsed('sprint')).toBe(true)
  })

  it('the rail is 40 px — room for one 32 px control', () => {
    expect(CHAT_RAIL_WIDTH).toBe(40)
  })
})
