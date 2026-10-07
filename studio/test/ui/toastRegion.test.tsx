// @vitest-environment jsdom
// C7: the toast stack is anchored over <main> — its offsets read the Frame root's `--chat-width`
// and `--console-height` (P2's contract), fall back to 16 px when they are absent, and the region
// is a <section>, never inside an <aside>. `mergeRendered` is the exit-hold list logic.
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastRegion, clearToasts, toast } from '../../src/ui'
import { TOAST_REGION_CLASS, mergeRendered } from '../../src/ui/ToastRegion'
import type { ToastItem } from '../../src/ui'

beforeEach(() => {
  vi.useFakeTimers()
  clearToasts()
})
afterEach(() => {
  clearToasts()
  vi.useRealTimers()
})

const item = (id: string, title = id): ToastItem => ({ id, tone: 'ok', title, createdAt: 0 })

describe('ToastRegion anchoring', () => {
  it('reads --chat-width and --console-height with 0px fallbacks, and pulls back when the chat is hidden', () => {
    render(<ToastRegion />)
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region.className).toContain('right-[calc(var(--chat-width,0px)+16px)]')
    expect(region.className).toContain('bottom-[calc(var(--console-height,0px)+16px)]')
    expect(region.className).toContain('[[data-chat-hidden]_&]:right-4')
    expect(region.className).toContain('fixed')
    // No unconditional window-edge offset remains; the edge is only the hidden-chat case.
    expect(TOAST_REGION_CLASS.split(/\s+/)).not.toContain('right-4')
    expect(TOAST_REGION_CLASS.split(/\s+/)).not.toContain('bottom-4')
  })

  it('is a <section> that is never inside an <aside>, even when rendered beside the two shell asides', () => {
    render(
      <div>
        <aside>sidebar</aside>
        <main>
          <ToastRegion />
        </main>
        <aside>chat</aside>
      </div>,
    )
    act(() => {
      toast({ tone: 'ok', title: 'Placed' })
    })
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region.tagName).toBe('SECTION')
    expect(region.closest('aside')).toBeNull()
    expect(document.querySelectorAll('aside').length).toBe(2)
  })
})

describe('mergeRendered', () => {
  it('returns the same reference when nothing changed', () => {
    const rendered = [item('a'), item('b')]
    expect(mergeRendered(rendered, rendered)).toBe(rendered)
  })

  it('keeps a dropped item in its place, takes fresh objects for updated ids, appends new ones', () => {
    const a = item('a')
    const b = item('b')
    const b2 = item('b', 'b updated')
    const c = item('c')
    const next = mergeRendered([a, b], [b2, c])
    expect(next.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(next[1]).toBe(b2)
  })
})
