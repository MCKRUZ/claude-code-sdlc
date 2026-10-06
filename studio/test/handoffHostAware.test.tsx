// @vitest-environment jsdom
/** HandoffDialog's host awareness (code-host providers §7 / §7.1, Wave 7-B). The dialog reads
 * the connection store, not a prop; its window.studio mock stays partial (handOff only — the
 * typed-name form's own call is exercised in typedActorForm.test.tsx). */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HandoffDialog } from '../src/components/HandoffDialog'
import { connectionStore, resetConnectionStore } from '../src/stores/connectionStore'
import { WORDING, hostFeatureReason } from '../shared/codeHostModel'
import type { BoardRow, ConnectionInfo } from '../shared/types'

const ROW: BoardRow = {
  spec: '0008', name: 'claim-export', path: 'specs/0008-claim-export.md', title: 'Claim export', status: 'ready',
  risk: 'MEDIUM', team: 'platform', channel: '', owner: '@sam-k', developer: '', checker: '@priya-n', branch: '',
  sprint: 'S07', nextOwner: '', engReview: '', dataReview: '', dependsOn: [], pullRequest: null,
}

const BASE: ConnectionInfo = {
  repo: 'acme/app', branch: 'main', localFolder: '/p', account: '@sam-k', accountSource: 'roster', rosterHandle: '@sam-k',
  host: 'github', hostSource: 'remote', cli: { name: 'gh', found: true, extension: null, signedIn: 'yes' },
  lastPulledAt: null, branchProtected: null,
}

const ADO_NO_AZ: ConnectionInfo = {
  ...BASE, host: 'azure-devops', account: null, accountSource: null, rosterHandle: null,
  cli: { name: 'az', found: false, extension: null, signedIn: 'unknown', reason: WORDING.azMissing },
}

function install(handOff = vi.fn().mockResolvedValue({ ok: true, developer: '@lee-w' })) {
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { handOff }
  return handOff
}

function mount() {
  render(<main><HandoffDialog projectPath="/p" row={ROW} onClose={vi.fn()} onHandedOff={vi.fn()} /></main>)
}

afterEach(() => {
  cleanup()
  resetConnectionStore()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('HandoffDialog on each host', () => {
  it('with no connection in the store it reads exactly as before', () => {
    install()
    mount()
    expect(screen.getByRole('button', { name: /^Hand off(?! locally)/ })).toBeTruthy()
    expect(screen.queryByText(/Azure DevOps receives/)).toBeNull()
    expect(screen.queryByText('Sign in as a typed name')).toBeNull()
  })

  it('on Azure DevOps it says the checker\'s email is what the host receives', () => {
    install()
    connectionStore.set({ ...ADO_NO_AZ, account: 'sam@corp.com', accountSource: 'host', cli: { name: 'az', found: true, extension: true, signedIn: 'yes' } })
    mount()
    expect(screen.getByText(/is what Azure DevOps receives/).textContent).toContain('.sdlc/team.yaml')
    expect(screen.getByRole('button', { name: /^Hand off(?! locally)/ })).toBeTruthy()
    expect(screen.queryByText('Sign in as a typed name')).toBeNull()
  })

  it('with the CLI unavailable the button stays ENABLED and names the skipped half in hostFeatureReason\'s words', async () => {
    const handOff = install()
    connectionStore.set(ADO_NO_AZ)
    mount()
    const reason = hostFeatureReason(ADO_NO_AZ, 'handoff')!
    expect(reason).toMatch(/needs az$/)
    const button = screen.getByRole('button', { name: /^Hand off locally/ }) as HTMLButtonElement
    expect(button.textContent).toContain(`Hand off locally; code-host assignment will be skipped: ${reason}`)
    expect(button.className).toContain('bg-brand-600')
    // Still gated on naming a developer — the CLI is never what disables it.
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Developer'), { target: { value: '@lee-w' } })
    expect((screen.getByRole('button', { name: /^Hand off locally/ }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^Hand off locally/ }))
    await waitFor(() => expect(handOff).toHaveBeenCalledWith('/p', 'specs/0008-claim-export.md', '@lee-w', undefined))
  })

  it('offers a typed name only when the host could not identify the person', () => {
    install()
    connectionStore.set({ ...ADO_NO_AZ, cli: { name: 'az', found: true, extension: true, signedIn: 'no', reason: WORDING.azPatOnly } })
    mount()
    expect(screen.getByText('Sign in as a typed name')).toBeTruthy()
    expect(screen.getByLabelText('Your name')).toBeTruthy()
  })

  it('does not offer a typed name once someone is identified — by the host, the roster or a prior typed name', () => {
    install()
    connectionStore.set({ ...BASE, host: 'azure-devops', account: 'Sam K', accountSource: 'typed', rosterHandle: null, cli: { name: 'az', found: true, extension: true, signedIn: 'no', reason: WORDING.azPatOnly } })
    mount()
    expect(screen.queryByText('Sign in as a typed name')).toBeNull()
    cleanup()
    connectionStore.set(BASE)
    mount()
    expect(screen.queryByText('Sign in as a typed name')).toBeNull()
    expect(screen.getByRole('button', { name: /^Hand off(?! locally)/ })).toBeTruthy()
  })
})
