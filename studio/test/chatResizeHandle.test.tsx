// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatResizeHandle } from '../src/components/ChatResizeHandle'

function setup(width = 380) {
  const onResize = vi.fn()
  const onCommit = vi.fn()
  const onReset = vi.fn()
  render(<ChatResizeHandle width={width} min={280} max={600} onResize={onResize} onCommit={onCommit} onReset={onReset} />)
  return { handle: screen.getByRole('separator'), onResize, onCommit, onReset }
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
})

describe('ChatResizeHandle', () => {
  it('is announced as a vertical separator with its current value and limits, so it is usable without a mouse', () => {
    const { handle } = setup(380)
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('aria-valuenow')).toBe('380')
    expect(handle.getAttribute('aria-valuemin')).toBe('280')
    expect(handle.getAttribute('aria-valuemax')).toBe('600')
    expect(handle.tabIndex).toBe(0)
  })

  it('dragging left widens the panel: width is the distance from the pointer to the right edge of the window', () => {
    const { handle, onResize, onCommit } = setup()
    fireEvent.mouseDown(handle, { clientX: 1220 })
    fireEvent.mouseMove(window, { clientX: 1100 })
    expect(onResize).toHaveBeenLastCalledWith(500)
    fireEvent.mouseMove(window, { clientX: 1000 })
    expect(onResize).toHaveBeenLastCalledWith(600)
    expect(onCommit).not.toHaveBeenCalled() // nothing remembered until the drag ends
    fireEvent.mouseUp(window)
    expect(onCommit).toHaveBeenCalledWith(600)
  })

  it('stops following the pointer once the button is released', () => {
    const { handle, onResize } = setup()
    fireEvent.mouseDown(handle, { clientX: 1220 })
    fireEvent.mouseMove(window, { clientX: 1200 })
    fireEvent.mouseUp(window)
    onResize.mockClear()
    fireEvent.mouseMove(window, { clientX: 900 })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('a click with no movement changes nothing', () => {
    const { handle, onCommit } = setup()
    fireEvent.mouseDown(handle, { clientX: 1220 })
    fireEvent.mouseUp(window)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('the left arrow widens and the right arrow narrows, each remembered straight away', () => {
    const { handle, onCommit } = setup(380)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onCommit).toHaveBeenLastCalledWith(404)
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenLastCalledWith(356)
  })

  it('ignores other keys', () => {
    const { handle, onCommit } = setup()
    fireEvent.keyDown(handle, { key: 'a' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('double-click resets to the default width', () => {
    const { handle, onReset } = setup()
    fireEvent.doubleClick(handle)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('is hidden below the breakpoint where the panels stack, since there is nothing to resize', () => {
    const { handle } = setup()
    expect(handle.className).toMatch(/\bhidden\b/)
    expect(handle.className).toMatch(/\bsm:block\b/)
  })
})
