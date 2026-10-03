// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NarrativeCoveragePanel } from '../src/components/NarrativeCoveragePanel'
import type { NarrativeCoverage } from '../shared/types'

const coverage = (over: Partial<NarrativeCoverage> = {}): NarrativeCoverage => ({
  ok: true, hasData: true, notes: [], withNarrative: 2, total: 5,
  artifacts: [
    { name: 'a.md', status: 'present', stale: false },
    { name: 'b.md', status: 'present', stale: true },
    { name: 'c.md', status: 'none', stale: null },
    { name: 'd.md', status: 'none', stale: null },
    { name: 'e.md', status: 'none', stale: null },
  ],
  ...over,
})

function install(getNarrativeCoverage: unknown) {
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { getNarrativeCoverage }
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

const panelText = () => screen.getByTestId('narrative-panel').textContent ?? ''

describe('NarrativeCoveragePanel', () => {
  it('loads on mount and reads the coverage, listing documents without a summary', async () => {
    const get = vi.fn().mockResolvedValue(coverage())
    install(get)
    render(<NarrativeCoveragePanel projectPath="/p" stageId="1" />)

    expect(await screen.findByText('2 of 5 documents have a plain-language summary')).toBeTruthy()
    expect(get).toHaveBeenCalledWith('/p', '1')
    expect(screen.getByText('Without a summary: c.md, d.md, e.md')).toBeTruthy()
  })

  it('marks a present-but-stale summary as out of date and leaves the unjudgeable ones alone', async () => {
    install(vi.fn().mockResolvedValue(coverage({
      artifacts: [
        { name: 'b.md', status: 'present', stale: true },
        { name: 'f.md', status: 'present', stale: null },
      ],
      withNarrative: 2, total: 2,
    })))
    render(<NarrativeCoveragePanel projectPath="/p" stageId="1" />)
    await screen.findByText(/plain-language summary/)
    expect(screen.getByText('Out of date: b.md')).toBeTruthy()
    expect(panelText()).not.toContain('f.md')
  })

  it('says no documents yet, with the plugin notes, and never "0 of 0"', async () => {
    install(vi.fn().mockResolvedValue(coverage({
      hasData: false, withNarrative: 0, total: 0, artifacts: [], notes: ['Nothing has been written for this stage.'],
    })))
    render(<NarrativeCoveragePanel projectPath="/p" stageId="1" />)
    expect(await screen.findByText('No documents in this stage yet')).toBeTruthy()
    expect(screen.getByText('Nothing has been written for this stage.')).toBeTruthy()
    expect(panelText()).not.toContain('0 of 0')
  })

  it("reloads for a new stage and does not show the old stage's answer", async () => {
    let resolveFirst!: (c: NarrativeCoverage) => void
    const get = vi.fn()
      .mockReturnValueOnce(new Promise<NarrativeCoverage>((r) => { resolveFirst = r }))
      .mockResolvedValueOnce(coverage({ withNarrative: 1, total: 1, artifacts: [{ name: 'z.md', status: 'present', stale: false }] }))
    install(get)
    const { rerender } = render(<NarrativeCoveragePanel projectPath="/p" stageId="1" />)
    rerender(<NarrativeCoveragePanel projectPath="/p" stageId="2" />)
    await screen.findByText('1 of 1 document has a plain-language summary')

    resolveFirst(coverage())
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(panelText()).not.toContain('2 of 5')
  })
})

describe('NarrativeCoveragePanel: failures show exactly one error line and no count', () => {
  const shapes: Array<[string, () => Promise<NarrativeCoverage>]> = [
    ['the call rejects', () => Promise.reject(new Error('The summary script is missing.'))],
    ['ok is false with a reason', () => Promise.resolve({ ...coverage(), ok: false, error: 'The script exited with code one.' })],
    ['ok is false with no reason', () => Promise.resolve({ ...coverage(), ok: false })],
  ]
  it.each(shapes)('when %s', async (_name, call) => {
    install(vi.fn(call))
    render(<NarrativeCoveragePanel projectPath="/p" stageId="1" />)
    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(panelText()).not.toMatch(/\d/)
  })
})
