// @vitest-environment jsdom
/** M1: the sign-off handler takes a `ceremonyRegistry` hold BEFORE awaiting the caller's refresh,
 * so the Sidebar's own progress row applies its end state rather than fighting the ceremony. The
 * hold must not outlive the panel: if the person leaves the screen while the refresh is pending,
 * the ceremony effect that would release it never runs, and without an unmount release the
 * Sidebar would never tween again this session. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignOffPanel } from '../src/components/SignOffPanel'
import { ceremonyRegistry } from '../src/motion/ceremonyRegistry'
import { clearToasts } from '../src/ui/toastStore'
import type { StageReadiness } from '../shared/types'

const READINESS: StageReadiness = {
  ok: true,
  stageId: '0',
  name: 'discovery',
  display: 'Phase 0: Discovery',
  isCurrent: true,
  documents: [],
  findings: [],
  judgement: [],
  signOff: { status: 'active', signedOffBy: null, completedAt: null },
  ready: true,
}

function install() {
  const signOffStage = vi.fn().mockResolvedValue({ ok: true, fromPhase: '0', toPhase: '1', note: 'advanced' })
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { signOffStage }
  return signOffStage
}

beforeEach(() => {
  ceremonyRegistry.reset()
})

afterEach(() => {
  cleanup()
  clearToasts()
  ceremonyRegistry.reset()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('SignOffPanel: the ceremony hold never outlives the panel', () => {
  it('releases the hold on unmount while onSignedOff is still pending', async () => {
    const signOffStage = install()
    const onSignedOff = vi.fn(() => new Promise<void>(() => {})) // never resolves: the refresh hangs
    const { unmount } = render(
      <SignOffPanel projectPath="/p" readiness={READINESS} actor="Matt K" setOpening={vi.fn()} onSignedOff={onSignedOff} />,
    )
    expect(ceremonyRegistry.held()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^Sign off/ }))
    await waitFor(() => expect(signOffStage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onSignedOff).toHaveBeenCalledTimes(1))
    // The hold is taken between the plugin's `ok` and the refresh — this is the window in question.
    expect(ceremonyRegistry.held()).toBe(true)
    unmount()
    expect(ceremonyRegistry.held()).toBe(false)
  })

  it('a completed sign-off still releases the hold once the ceremony has played (stub: at once)', async () => {
    install()
    const onSignedOff = vi.fn().mockResolvedValue(undefined)
    render(
      <SignOffPanel projectPath="/p" readiness={READINESS} actor="Matt K" setOpening={vi.fn()} onSignedOff={onSignedOff} />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Sign off/ }))
    })
    await screen.findByTestId('sign-off-success')
    await waitFor(() => expect(ceremonyRegistry.held()).toBe(false))
  })

  it('a refusal takes no hold', async () => {
    install().mockResolvedValue({ ok: false, error: 'Gate 2 failed: requirements.md incomplete' })
    render(
      <SignOffPanel projectPath="/p" readiness={READINESS} actor="Matt K" setOpening={vi.fn()} onSignedOff={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Sign off/ }))
    await screen.findByText(/Gate 2 failed/)
    expect(ceremonyRegistry.held()).toBe(false)
  })
})
