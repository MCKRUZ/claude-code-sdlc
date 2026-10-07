// @vitest-environment jsdom
// Focus after navigation: the page heading receives focus when the screen key changes (not on
// a plain re-render), waits for the OpeningOverlay to unmount, and a cancelled move never
// steals focus from the screen that replaced it. The live announcer is one polite region.
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusHeading, useFocusOnNavigate } from '../src/a11y/focusOnNavigate'
import { announce, lastAnnouncement, LiveAnnouncer } from '../src/a11y/LiveAnnouncer'

function Screen({ title, screenKey }: { title: string; screenKey: string }) {
  useFocusOnNavigate(screenKey)
  return <main><h2 data-page-heading tabIndex={-1}>{title}</h2><button>in page</button></main>
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useFocusOnNavigate', () => {
  it('focuses the heading when the key changes, not when the same screen re-renders', () => {
    const { rerender, getByRole, getByText } = render(<Screen title="Phase 2: Design" screenKey="documents:2" />)
    expect(document.activeElement).toBe(getByRole('heading'))
    getByText('in page').focus()
    rerender(<Screen title="Phase 2: Design (again)" screenKey="documents:2" />)
    expect(document.activeElement).toBe(getByText('in page'))
    rerender(<Screen title="Board" screenKey="build" />)
    expect(document.activeElement).toBe(getByRole('heading'))
  })
})

describe('focusHeading', () => {
  it('adds tabIndex -1 when the heading lacks one', () => {
    document.body.innerHTML = '<h2 data-page-heading>Specs</h2>'
    focusHeading()
    const h2 = document.querySelector('h2')!
    expect(h2.tabIndex).toBe(-1)
    expect(document.activeElement).toBe(h2)
  })

  it('waits for an optional delay and can be cancelled before it fires', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<h2 data-page-heading tabIndex="-1">Specs</h2><button>x</button>'
    const button = document.querySelector('button')!
    button.focus()
    const cancel = focusHeading({ delayMs: 200 })
    vi.advanceTimersByTime(100)
    expect(document.activeElement).toBe(button)
    cancel()
    vi.advanceTimersByTime(200)
    expect(document.activeElement).toBe(button)
    focusHeading({ delayMs: 50 })
    vi.advanceTimersByTime(60)
    expect(document.activeElement).toBe(document.querySelector('h2'))
  })

  it('defers while the opening overlay is mounted and moves once it unmounts', async () => {
    document.body.innerHTML =
      '<div role="alertdialog" aria-busy="true" aria-label="Opening"><div tabIndex="-1" id="card"></div></div>'
      + '<h2 data-page-heading tabIndex="-1">Phase 0</h2>'
    const card = document.getElementById('card')!
    card.focus()
    focusHeading()
    expect(document.activeElement).toBe(card)
    document.querySelector('[role="alertdialog"]')!.remove()
    // MutationObserver callbacks are microtasks.
    await Promise.resolve()
    expect(document.activeElement).toBe(document.querySelector('h2'))
  })
})

describe('LiveAnnouncer', () => {
  it('is one polite status region that re-announces identical text', async () => {
    vi.useFakeTimers()
    const { getByRole } = render(<LiveAnnouncer />)
    const region = getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toBe('')
    act(() => { announce('Spec 0008'); vi.runAllTimers() })
    expect(region.textContent).toBe('Spec 0008')
    act(() => { announce('Spec 0008'); vi.runAllTimers() })
    expect(region.textContent).toBe('Spec 0008')
    expect(lastAnnouncement()).toBe('Spec 0008')
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
  })
})
