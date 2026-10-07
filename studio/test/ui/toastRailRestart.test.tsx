// @vitest-environment jsdom
/** M6: the rail is a CLOCK over the real ttl. A same-title update re-arms the store's ttl, so the
 * rail must restart too — otherwise it reaches zero up to two seconds before the toast goes and
 * the card reads as expired. The row is replaced with a spy so the test can see the clock being
 * killed and re-created (and paused again while the region is hovered) without a real tween. */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastRegion, clearToasts, toast } from '../../src/ui'
import { TOAST_DEDUPE_MS, TOAST_TTL_MS } from '../../src/ui/toastStore'
import { configureMotionForTests } from '../../src/motion/motion'
import { toastRail } from '../../src/motion/choreo/toasts'

type FakeClock = { kill: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }
const clocks: FakeClock[] = []

vi.mock('../../src/motion/choreo/toasts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/motion/choreo/toasts')>()
  return {
    ...actual,
    toastRail: {
      name: 'toastRail',
      play: vi.fn(() => {
        const clock: FakeClock = { kill: vi.fn(), pause: vi.fn(), play: vi.fn() }
        clocks.push(clock)
        return clock
      }),
    },
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  clearToasts()
  clocks.length = 0
  vi.mocked(toastRail.play).mockClear()
  // The clock only runs while motion is on; under MODE=test the rail stands at full width.
  configureMotionForTests({ isTestMode: () => false })
})
afterEach(() => {
  clearToasts()
  configureMotionForTests(null)
  vi.useRealTimers()
})

describe('Toast rail on a same-title update', () => {
  it('kills the running clock and starts a fresh one over the full ttl', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'warn', title: 'Pull failed', detail: 'first attempt' })
    })
    expect(toastRail.play).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toastRail.play).mock.calls[0]![1].ttlSeconds).toBe(TOAST_TTL_MS / 1000)
    act(() => {
      vi.advanceTimersByTime(TOAST_DEDUPE_MS - 100)
      toast({ tone: 'error', title: 'Pull failed', detail: 'second attempt' })
    })
    expect(screen.getByText('second attempt')).toBeTruthy()
    expect(toastRail.play).toHaveBeenCalledTimes(2)
    expect(clocks[0]!.kill).toHaveBeenCalledTimes(1)
    expect(clocks[1]!.kill).not.toHaveBeenCalled()
    expect(vi.mocked(toastRail.play).mock.calls[1]![1].ttlSeconds).toBe(TOAST_TTL_MS / 1000)
    // The same rail node, inside the same card.
    expect(vi.mocked(toastRail.play).mock.calls[1]![1].rail).toBe(vi.mocked(toastRail.play).mock.calls[0]![1].rail)
  })

  it('the restarted clock is paused when the region is hovered at the moment of the update', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'warn', title: 'Pull failed', detail: 'first attempt' })
    })
    fireEvent.mouseEnter(screen.getByRole('region'))
    expect(clocks[0]!.pause).toHaveBeenCalled()
    act(() => {
      toast({ tone: 'error', title: 'Pull failed', detail: 'second attempt' })
    })
    expect(toastRail.play).toHaveBeenCalledTimes(2)
    expect(clocks[1]!.pause).toHaveBeenCalledTimes(1)
  })

  it('a sticky update keeps no clock', () => {
    render(<ToastRegion />)
    act(() => {
      toast({ tone: 'warn', title: 'Pull failed', detail: 'first attempt' })
    })
    act(() => {
      toast({ tone: 'warn', title: 'Pull failed', detail: 'now sticky', sticky: true })
    })
    expect(toastRail.play).toHaveBeenCalledTimes(1)
  })
})
