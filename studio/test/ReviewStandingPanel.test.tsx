// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewStandingPanel } from '../src/components/ReviewStandingPanel'
import type { ReviewStanding, StrictCheckResult } from '../shared/types'

const standing = (over: Partial<ReviewStanding> = {}): ReviewStanding => ({
  ok: true, tracked: 3, openDebt: 1, fixedClaimMismatches: 0, ...over,
})

function install(overrides: Record<string, unknown> = {}) {
  const studio = {
    getReviewStanding: vi.fn().mockResolvedValue(standing()),
    runStrictReviewCheck: vi.fn().mockResolvedValue({ ok: true, mismatches: 0 }),
    ...overrides,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

afterEach(() => {
  cleanup()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

const panelText = () => screen.getByTestId('review-standing-panel').textContent ?? ''
const strict = () => screen.getByRole('button', { name: 'Strict check' })

describe('ReviewStandingPanel: the standing picture', () => {
  it('loads on mount and reads tracked, open and fixed-without-change', async () => {
    const studio = install()
    render(<ReviewStandingPanel projectPath="/p" />)
    expect(await screen.findByText('3 findings tracked, 1 still open, 0 marked fixed without a change to their file')).toBeTruthy()
    expect(studio.getReviewStanding).toHaveBeenCalledWith('/p')
  })

  it('uses the singular for one of each', async () => {
    install({ getReviewStanding: vi.fn().mockResolvedValue(standing({ tracked: 1, openDebt: 1, fixedClaimMismatches: 1 })) })
    render(<ReviewStandingPanel projectPath="/p" />)
    expect(await screen.findByText('1 finding tracked, 1 still open, 1 marked fixed without a change to its file')).toBeTruthy()
  })

  it('says nothing is recorded, not a row of zeros, when nothing is tracked', async () => {
    install({ getReviewStanding: vi.fn().mockResolvedValue(standing({ tracked: 0, openDebt: 0, fixedClaimMismatches: 0 })) })
    render(<ReviewStandingPanel projectPath="/p" />)
    expect(await screen.findByText('No review findings recorded yet')).toBeTruthy()
    expect(panelText()).not.toMatch(/\d/)
  })

  it('ignores a standing for a project the person already left', async () => {
    let resolveFirst!: (s: ReviewStanding) => void
    const get = vi.fn()
      .mockReturnValueOnce(new Promise<ReviewStanding>((r) => { resolveFirst = r }))
      .mockResolvedValueOnce(standing({ tracked: 7, openDebt: 7 }))
    install({ getReviewStanding: get })
    const { rerender } = render(<ReviewStandingPanel projectPath="/a" />)
    rerender(<ReviewStandingPanel projectPath="/b" />)
    await screen.findByText(/7 findings tracked/)
    resolveFirst(standing())
    await Promise.resolve()
    expect(panelText()).not.toContain('3 findings')
  })
})

describe('ReviewStandingPanel: Strict check', () => {
  it('reports a count of false fixed-claims as a finding, not an error', async () => {
    const studio = install({ runStrictReviewCheck: vi.fn().mockResolvedValue({ ok: true, mismatches: 1 }) })
    render(<ReviewStandingPanel projectPath="/p" />)
    await screen.findByText(/findings tracked/)
    fireEvent.click(strict())
    expect(await screen.findByText('1 finding is marked fixed but its file never changed')).toBeTruthy()
    expect(studio.runStrictReviewCheck).toHaveBeenCalledWith('/p')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uses the plural for two', async () => {
    install({ runStrictReviewCheck: vi.fn().mockResolvedValue({ ok: true, mismatches: 2 }) })
    render(<ReviewStandingPanel projectPath="/p" />)
    await screen.findByText(/findings tracked/)
    fireEvent.click(strict())
    expect(await screen.findByText('2 findings are marked fixed but their files never changed')).toBeTruthy()
  })

  it('reads clean when there are none', async () => {
    install()
    render(<ReviewStandingPanel projectPath="/p" />)
    await screen.findByText(/findings tracked/)
    fireEvent.click(strict())
    expect(await screen.findByText('No false fixed-claims found')).toBeTruthy()
  })
})

describe('ReviewStandingPanel: failures show exactly one error line and no count', () => {
  const standingShapes: Array<[string, () => Promise<ReviewStanding>]> = [
    ['the call rejects', () => Promise.reject(new Error('The findings script is missing.'))],
    ['ok is false with a reason', () => Promise.resolve({ ...standing(), ok: false, error: 'The script exited with code one.' })],
    ['ok is false with no reason', () => Promise.resolve({ ...standing(), ok: false })],
  ]
  it.each(standingShapes)('loading the standing, when %s', async (_name, call) => {
    install({ getReviewStanding: vi.fn(call) })
    render(<ReviewStandingPanel projectPath="/p" />)
    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(panelText()).not.toMatch(/\d/)
  })

  const strictShapes: Array<[string, () => Promise<StrictCheckResult>]> = [
    ['the call rejects', () => Promise.reject(new Error('The strict check could not run.'))],
    ['ok is false with a reason', () => Promise.resolve({ ok: false, error: 'The script exited with code one.', mismatches: 0 })],
    ['ok is false with no reason', () => Promise.resolve({ ok: false, mismatches: 0 })],
  ]
  it.each(strictShapes)('on the strict check, when %s', async (_name, call) => {
    install({
      getReviewStanding: vi.fn().mockResolvedValue(standing({ tracked: 0, openDebt: 0 })),
      runStrictReviewCheck: vi.fn(call),
    })
    render(<ReviewStandingPanel projectPath="/p" />)
    await screen.findByText('No review findings recorded yet')
    fireEvent.click(strict())
    await screen.findByRole('alert')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(panelText()).not.toMatch(/\d/)
  })
})
