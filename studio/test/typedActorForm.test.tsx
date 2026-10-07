// @vitest-environment jsdom
/** "Sign in as a typed name" (code-host providers D-OWNER-5, Wave 7-B). The main process judges;
 * this form only asks and repeats the answer. Its mock of window.studio is partial on purpose —
 * only the one call the form makes. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TypedActorForm } from '../src/components/TypedActorForm'
import { connectionStore, resetConnectionStore } from '../src/stores/connectionStore'
import type { ConnectionInfo } from '../shared/types'

const IDENTIFIED: ConnectionInfo = {
  repo: 'acme/app', branch: 'main', localFolder: '/p', account: 'Sam K', accountSource: 'typed', rosterHandle: null,
  host: 'azure-devops', hostSource: 'remote',
  cli: { name: 'az', found: true, extension: true, signedIn: 'no', reason: 'Signed in with a PAT only; Azure DevOps cannot say who you are.' },
  lastPulledAt: null, branchProtected: null,
}

function install(setTypedActor = vi.fn().mockResolvedValue(IDENTIFIED)) {
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = { setTypedActor }
  return setTypedActor
}

afterEach(() => {
  cleanup()
  resetConnectionStore()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('TypedActorForm', () => {
  it('is disabled until a name is typed, and says why', () => {
    install()
    render(<TypedActorForm projectPath="/p" />)
    expect(screen.getByText('Sign in as a typed name')).toBeTruthy()
    const button = screen.getByRole('button', { name: /Use this name/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('Type a name first.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam K' } })
    expect((screen.getByRole('button', { name: 'Use this name' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('on success the main process\'s ConnectionInfo lands in the connection store and the caller hears the account', async () => {
    const setTypedActor = install()
    const onIdentified = vi.fn()
    render(<TypedActorForm projectPath="/p" onIdentified={onIdentified} />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Sam K ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use this name' }))
    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith('Sam K'))
    expect(setTypedActor).toHaveBeenCalledWith('/p', 'Sam K')
    expect(connectionStore.getSnapshot()).toBe(IDENTIFIED)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a rejection sentence verbatim and writes nothing to the store', async () => {
    const sentence = 'Azure DevOps already identifies you as sam@corp.com; a typed name is only for when it cannot.'
    install(vi.fn().mockRejectedValue(new Error(sentence)))
    render(<TypedActorForm projectPath="/p" />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam K' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use this name' }))
    expect((await screen.findByRole('alert')).textContent).toBe(sentence)
    expect(connectionStore.getSnapshot()).toBeNull()
    // The button comes back: a refused name can be corrected.
    expect((screen.getByRole('button', { name: 'Use this name' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
