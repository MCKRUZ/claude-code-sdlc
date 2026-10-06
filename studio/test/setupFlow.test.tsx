// @vitest-environment jsdom
/** SetupFlow's preview is a subprocess per selected playbook. When the person changes the
 * playbook before the first preview answers, two are in flight; whichever lands LAST used to
 * win, so the plan on screen could belong to a playbook no longer selected — and "Set up
 * project" would have been confirmed against the wrong preview. Latest wins. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreviewSetupResult } from '../shared/types'
import { SetupFlow } from '../src/components/SetupFlow'

type Deferred = { resolve: (r: PreviewSetupResult) => void }

afterEach(() => {
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('SetupFlow preview', () => {
  it('shows only the preview for the playbook that is selected NOW, even when an older one answers later', async () => {
    const pending = new Map<string, Deferred>()
    const previewSetup = vi.fn((_path: string, profileId: string) => new Promise<PreviewSetupResult>((resolve) => {
      pending.set(profileId, { resolve })
    }))
    // @ts-expect-error - test double, not the full StudioApi surface
    window.studio = { listProfiles: vi.fn().mockResolvedValue(['alpha-stack', 'beta-stack']), previewSetup }

    render(<SetupFlow projectPath="/p" onCancel={() => {}} onConfirm={async () => {}} />)
    await waitFor(() => expect(previewSetup).toHaveBeenCalledWith('/p', 'alpha-stack'))

    // Switch before alpha answers.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'beta-stack' } })
    await waitFor(() => expect(previewSetup).toHaveBeenCalledWith('/p', 'beta-stack'))

    // The newest request answers first…
    pending.get('beta-stack')!.resolve({ plan: { already_exists: false, directories: ['.sdlc'], files: ['beta.yaml'] } })
    await screen.findByText('beta.yaml')

    // …then the stale one lands. It must change nothing.
    pending.get('alpha-stack')!.resolve({ plan: { already_exists: false, directories: ['.sdlc'], files: ['alpha.yaml'] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('alpha.yaml')).toBeNull()
    expect(screen.getByText('beta.yaml')).toBeTruthy()
  })

  it('a stale error does not land on a newer plan either', async () => {
    const pending = new Map<string, Deferred>()
    const previewSetup = vi.fn((_path: string, profileId: string) => new Promise<PreviewSetupResult>((resolve) => {
      pending.set(profileId, { resolve })
    }))
    // @ts-expect-error - test double, not the full StudioApi surface
    window.studio = { listProfiles: vi.fn().mockResolvedValue(['alpha-stack', 'beta-stack']), previewSetup }

    render(<SetupFlow projectPath="/p" onCancel={() => {}} onConfirm={async () => {}} />)
    await waitFor(() => expect(previewSetup).toHaveBeenCalledWith('/p', 'alpha-stack'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'beta-stack' } })
    await waitFor(() => expect(previewSetup).toHaveBeenCalledWith('/p', 'beta-stack'))

    pending.get('beta-stack')!.resolve({ plan: { already_exists: false, directories: [], files: ['beta.yaml'] } })
    await screen.findByText('beta.yaml')
    pending.get('alpha-stack')!.resolve({ error: 'alpha exploded' })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('alpha exploded')).toBeNull()
    expect(screen.getByText('beta.yaml')).toBeTruthy()
  })
})
