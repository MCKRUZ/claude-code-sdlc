// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  })

  it('roving tabIndex and arrows move selection, skipping the disabled tab', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const [readiness, workflow] = screen.getAllByRole('tab')
    expect(readiness.tabIndex).toBe(0)
    expect(workflow.tabIndex).toBe(-1)
    readiness.focus()
    fireEvent.keyDown(readiness, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('workflow')
    expect(document.activeElement).toBe(workflow)
    expect(screen.getByRole('tabpanel').textContent).toBe('Workflow body')
    fireEvent.keyDown(workflow, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(readiness)
  })

  it('a disabled tab carries its reason', () => {
    render(<Harness />)
    const guide = screen.getByRole('tab', { name: /Guide/ })
    expect(guide.getAttribute('title')).toBe('no definition file')
  })
})
