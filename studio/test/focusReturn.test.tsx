// @vitest-environment jsdom
/** After every verb the focus lands on the card or row that changed, or the first needs-you
 * item (Q4). Targets are the plugin's ids on the DOM (`data-spec`, `data-decision`), never a
 * position; focus is instant under every motion tier; the plan is applied once the host's
 * refreshed read lands, never before. */
import { act, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { focusPlanFor, focusSelectors, focusTargetFor, returnFocus, useFocusReturn, type FocusPlan } from '../src/motion/focusReturn'

function screenDom() {
  const root = document.createElement('div')
  root.innerHTML = `
    <section data-testid="today"><ul>
      <li data-needs-you-item=""><p>DL-01</p><button id="decide-dl01">Decide</button></li>
    </ul></section>
    <div data-lanes-grid="">
      <article data-lane-card="" data-spec="0002" tabindex="-1">0002</article>
      <article data-lane-card="" data-spec="0004" tabindex="0">0004</article>
    </div>
    <li data-testid="refining-row" data-spec="0006"><button data-refine="">refine in place →</button></li>
    <li data-spec="0005" data-order="2"><span>slate row</span></li>
    <li data-decision="DL-03"><button disabled>Decide</button></li>
  `
  document.body.appendChild(root)
  return root
}

describe('focusSelectors', () => {
  it('key on the plugin\'s id, most specific first, and always end on the bare data-spec', () => {
    // CSS.escape escapes a leading digit (`\30 002`) — the same escaping SprintHome's focusBackSelector uses.
    const id = CSS.escape('0002')
    expect(focusSelectors({ kind: 'spec', spec: '0002', where: 'lane' })).toEqual([`[data-lane-card][data-spec="${id}"]`, `[data-spec="${id}"]`])
    expect(focusSelectors({ kind: 'spec', spec: '0006' })[0]).toBe(`[data-lane-card][data-spec="${CSS.escape('0006')}"]`)
    expect(focusSelectors({ kind: 'decision', id: 'DL-01' })[0]).toBe('[data-decision="DL-01"] button:not([disabled])')
    expect(focusSelectors({ kind: 'needs-you' })).toEqual(['[data-needs-you-item] button:not([disabled])', '[data-needs-you-item]'])
  })
  it('an id with a quote is escaped, never injected into the selector', () => {
    expect(focusSelectors({ kind: 'spec', spec: 'a"b', where: 'lane' })[0]).not.toContain('"a"b"')
  })
})

describe('focusPlanFor', () => {
  it('a spec verb lands on its spec; slate on its first spec in the slate; a sprint verb on the sprint', () => {
    expect(focusPlanFor({ verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'accepted' })).toEqual({ kind: 'spec', spec: '0002' })
    expect(focusPlanFor({ verb: 'slate', sprint: 'S08', specs: ['0005'] })).toEqual({ kind: 'spec', spec: '0005', where: 'slate' })
    expect(focusPlanFor({ verb: 'ready', sprint: 'S08' })).toEqual({ kind: 'sprint', sprint: 'S08' })
  })
})

describe('returnFocus', () => {
  it('lands on the lane card that changed', () => {
    const root = screenDom()
    const el = returnFocus(root, { kind: 'spec', spec: '0004' })
    expect(el).toBe(root.querySelector('[data-spec="0004"]'))
    expect(document.activeElement).toBe(el)
  })
  it('a row without a focusable child becomes focusable itself (tabindex -1); a row with one focuses the control', () => {
    const root = screenDom()
    const slate = returnFocus(root, { kind: 'spec', spec: '0005', where: 'slate' })!
    expect(slate.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(slate)
    const refine = returnFocus(root, { kind: 'spec', spec: '0006', where: 'refining' })!
    expect(refine.hasAttribute('data-refine')).toBe(true)
  })
  it('a spec no longer on screen falls back to the first needs-you item\'s action', () => {
    const root = screenDom()
    expect(returnFocus(root, { kind: 'spec', spec: '0001' })?.id).toBe('decide-dl01')
  })
  it('a decision whose only button is disabled lands on the row, not the disabled control', () => {
    const root = screenDom()
    const el = returnFocus(root, { kind: 'decision', id: 'DL-03' })!
    expect(el.getAttribute('data-decision')).toBe('DL-03')
  })
  it('with nothing to land on, the root takes focus — never <body>', () => {
    const root = document.createElement('div'); document.body.appendChild(root)
    expect(returnFocus(root, { kind: 'needs-you' })).toBe(root)
    expect(document.activeElement).toBe(root)
    expect(returnFocus(null, { kind: 'needs-you' })).toBeNull()
  })
  it('focusTargetFor returns null when nothing matches and there is no needs-you fallback', () => {
    const root = document.createElement('div')
    expect(focusTargetFor(root, { kind: 'selector', selector: '.nope' })).toBeNull()
  })
})

describe('useFocusReturn', () => {
  it('a scheduled plan waits for the refreshed read (readyKey change), then applies once', () => {
    const root = screenDom()
    const { result, rerender } = renderHook(({ ready }: { ready: number }) => {
      const ref = useRef<HTMLElement | null>(root)
      return useFocusReturn(ref, ready)
    }, { initialProps: { ready: 1 } })
    act(() => result.current.schedule({ kind: 'spec', spec: '0002' }))
    expect(result.current.pending).toEqual({ kind: 'spec', spec: '0002' })
    expect(document.activeElement).not.toBe(root.querySelector('[data-spec="0002"]'))   // never before the read
    rerender({ ready: 2 })
    expect(document.activeElement).toBe(root.querySelector('[data-spec="0002"]'))
    expect(result.current.pending).toBeNull()
  })
  it('now(plan) moves focus immediately (a dialog\'s Esc back to its opener)', () => {
    const root = screenDom()
    function Host() {
      const ref = useRef<HTMLElement | null>(root)
      const api = useFocusReturn(ref, 0)
      return <button onClick={() => api.now({ kind: 'spec', spec: '0004' })}>go</button>
    }
    const { getByText } = render(<Host />)
    act(() => getByText('go').click())
    expect(document.activeElement).toBe(root.querySelector('[data-spec="0004"]'))
  })
})
