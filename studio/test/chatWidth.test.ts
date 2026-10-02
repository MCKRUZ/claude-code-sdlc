// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHAT_DEFAULT_WIDTH, CHAT_MIN_WIDTH, clampChatWidth, readStoredChatWidth, useChatWidth,
} from '../src/chatWidth'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
}

describe('clampChatWidth — the panel can never be dragged unusably narrow, or wide enough to crowd the document out', () => {
  it('keeps a width inside the limits as it is', () => {
    expect(clampChatWidth(400, 1600)).toBe(400)
  })

  it('never goes below the minimum', () => {
    expect(clampChatWidth(50, 1600)).toBe(CHAT_MIN_WIDTH)
  })

  it('never goes above 60% of the window, so the document panel always keeps real room', () => {
    expect(clampChatWidth(5000, 1000)).toBe(600)
  })

  it('in a window so small that 60% is below the minimum, the minimum wins', () => {
    expect(clampChatWidth(500, 400)).toBe(CHAT_MIN_WIDTH)
  })
})

describe('readStoredChatWidth — a remembered width is only trusted when it is a sane number', () => {
  it('is null when nothing was stored', () => {
    expect(readStoredChatWidth()).toBeNull()
  })

  it.each(['abc', '', 'NaN', 'Infinity', '-5', '0'])('is null for a stored %j', (bad) => {
    localStorage.setItem('studio.chatWidth', bad)
    expect(readStoredChatWidth()).toBeNull()
  })

  it('returns a stored number', () => {
    localStorage.setItem('studio.chatWidth', '450')
    expect(readStoredChatWidth()).toBe(450)
  })

  it('is null, not a crash, when the browser refuses storage access', () => {
    const real = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    try {
      expect(readStoredChatWidth()).toBeNull()
    } finally {
      Storage.prototype.getItem = real
    }
  })
})

describe('useChatWidth', () => {
  beforeEach(() => setViewport(1600))

  it('starts at the default when nothing is remembered', () => {
    const { result } = renderHook(() => useChatWidth())
    expect(result.current.width).toBe(CHAT_DEFAULT_WIDTH)
  })

  it('starts at the remembered width', () => {
    localStorage.setItem('studio.chatWidth', '500')
    const { result } = renderHook(() => useChatWidth())
    expect(result.current.width).toBe(500)
  })

  it('previews a drag without remembering it, and remembers it when the drag ends', () => {
    const { result } = renderHook(() => useChatWidth())
    act(() => result.current.setWidth(450))
    expect(result.current.width).toBe(450)
    expect(localStorage.getItem('studio.chatWidth')).toBeNull()
    act(() => result.current.commit(450))
    expect(localStorage.getItem('studio.chatWidth')).toBe('450')
  })

  it('clamps what it is given', () => {
    const { result } = renderHook(() => useChatWidth())
    act(() => result.current.commit(10))
    expect(result.current.width).toBe(CHAT_MIN_WIDTH)
  })

  it('reset returns to the default and forgets the remembered width', () => {
    localStorage.setItem('studio.chatWidth', '500')
    const { result } = renderHook(() => useChatWidth())
    act(() => result.current.reset())
    expect(result.current.width).toBe(CHAT_DEFAULT_WIDTH)
    expect(localStorage.getItem('studio.chatWidth')).toBeNull()
  })

  it('shrinks the effective width when the window shrinks, without losing the chosen width', () => {
    localStorage.setItem('studio.chatWidth', '600')
    const { result } = renderHook(() => useChatWidth())
    expect(result.current.width).toBe(600)
    act(() => { setViewport(800); window.dispatchEvent(new Event('resize')) })
    expect(result.current.width).toBe(480) // 60% of 800
    act(() => { setViewport(1600); window.dispatchEvent(new Event('resize')) })
    expect(result.current.width).toBe(600) // back to what was chosen
  })
})
