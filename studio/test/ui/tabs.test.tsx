// @vitest-environment jsdom
// Round 3 (Q3): TabList / Tab ride @radix-ui/react-tabs. One recorded pin change: Radix's roving
// focus moves on the next tick (a setTimeout in its item handler) and then selects the tab it
// landed on, so the arrow-key test runs the timers; a key dispatched on the tablist itself (the
// stage home's pinned path) is still answered synchronously by the kit's list-level seam.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Tab, TabList, TabPanel, TabsProvider } from '../../src/ui'

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('readiness')
  const change = (v: string) => {
    onChange?.(v)
    setValue(v)
  }
  return (
    <TabsProvider value={value} onChange={change}>
      <TabList value={value} onChange={change} label="Stage view">
        <Tab value="readiness">Readiness</Tab>
        <Tab value="workflow">Workflow</Tab>
        <Tab value="guide" disabled disabledReason="no definition file">Guide</Tab>
      </TabList>
      <TabPanel value="readiness">Readiness body</TabPanel>
      <TabPanel value="workflow">Workflow body</TabPanel>
    </TabsProvider>
  )
}

afterEach(() => vi.useRealTimers())

describe('Tabs', () => {
  it('wires tablist / tab / tabpanel with aria-selected, aria-controls and aria-labelledby', () => {
    render(<Harness />)
    const list = screen.getByRole('tablist', { name: 'Stage view' })
    const tabs = screen.getAllByRole('tab')
    expect(list.contains(tabs[0])).toBe(true)
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    const panel = screen.getByRole('tabpanel')
    expect(panel.id).toBe(tabs[0].getAttribute('aria-controls'))
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(panel.tabIndex).toBe(-1)
    expect(panel.textContent).toBe('Readiness body')
    expect(tabs[0].getAttribute('type')).toBe('button')
    // Only the selected panel exists: an unselected one is absent, not hidden.
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1)
  })

  it('roving tabIndex and arrows move selection, skipping the disabled tab', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const [readiness, workflow] = screen.getAllByRole('tab')
    expect(readiness.tabIndex).toBe(0)
    expect(workflow.tabIndex).toBe(-1)
    readiness.focus()
    fireEvent.keyDown(readiness, { key: 'ArrowRight' })
    // Radix moves focus on the next tick, then automatic activation selects the focused tab.
    act(() => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(workflow)
    expect(onChange).toHaveBeenCalledWith('workflow')
    expect(screen.getByRole('tabpanel').textContent).toBe('Workflow body')
    expect(workflow.tabIndex).toBe(0)
    expect(readiness.tabIndex).toBe(-1)
    fireEvent.keyDown(workflow, { key: 'ArrowRight' })
    act(() => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(readiness)
  })

  it('a key that reaches the tablist itself moves selection and focus synchronously (the stage home path)', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const list = screen.getByRole('tablist')
    const [readiness, workflow] = screen.getAllByRole('tab')
    // Focusing a tab selects it (Radix's automatic activation); inside act so the selection lands.
    act(() => {
      workflow.focus()
    })
    expect(onChange).toHaveBeenCalledWith('workflow')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    // Guide is disabled: → from Workflow wraps to Readiness, at once.
    expect(document.activeElement).toBe(readiness)
    expect(onChange).toHaveBeenCalledWith('readiness')
    fireEvent.keyDown(list, { key: 'End' })
    expect(document.activeElement).toBe(workflow)
    expect(screen.getByRole('tabpanel').textContent).toBe('Workflow body')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(document.activeElement).toBe(readiness)
  })

  it('a click and Enter select too; the list is horizontal and the selected tab carries data-state', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const [readiness, workflow] = screen.getAllByRole('tab')
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('horizontal')
    expect(readiness.getAttribute('data-state')).toBe('active')
    fireEvent.click(workflow)
    expect(onChange).toHaveBeenCalledWith('workflow')
    expect(workflow.getAttribute('data-state')).toBe('active')
    fireEvent.keyDown(readiness, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('readiness')
  })

  it('a disabled tab carries its reason', () => {
    render(<Harness />)
    const guide = screen.getByRole('tab', { name: /Guide/ })
    expect(guide.getAttribute('title')).toBe('no definition file')
    expect(guide.hasAttribute('disabled')).toBe(true)
  })
})
