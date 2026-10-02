// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewProjectScreen } from '../src/components/NewProjectScreen'
import { WelcomeScreen } from '../src/components/WelcomeScreen'

function install(over: Record<string, unknown> = {}) {
  const studio = {
    pickFolder: vi.fn().mockResolvedValue('C:\\Work'),
    createProject: vi.fn().mockResolvedValue({ ok: true, path: 'C:\\Work\\Claims Portal' }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

describe('WelcomeScreen', () => {
  it('offers to start a new project as well as open an existing folder', () => {
    const onNew = vi.fn()
    const onPick = vi.fn()
    render(<WelcomeScreen recentProjects={[]} onPickFolder={onPick} onNewProject={onNew} onOpenRecent={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'New project…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open folder…' }))
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('no longer tells a person with nothing yet that they must already have a folder', () => {
    render(<WelcomeScreen recentProjects={[]} onPickFolder={vi.fn()} onNewProject={vi.fn()} onOpenRecent={vi.fn()} />)
    expect(screen.queryByText(/Open a project folder to get started/)).toBeNull()
  })
})

describe('NewProjectScreen', () => {
  it('cannot create anything until there is both a name and a location', async () => {
    install()
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    const create = screen.getByRole('button', { name: 'Create project' })
    expect(create.hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByLabelText('Project name'), 'Claims Portal')
    expect(create.hasAttribute('disabled')).toBe(true) // still no location
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false))
  })

  it('shows exactly where the project will be created before anything is', async () => {
    install()
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'Claims Portal')
    expect(screen.getByTestId('new-project-target').textContent).toBe('C:\\Work\\Claims Portal')
  })

  it('creates the project in the chosen location and hands the new folder on', async () => {
    const studio = install()
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={onCreated} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'Claims Portal')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('C:\\Work\\Claims Portal'))
    expect(studio.createProject).toHaveBeenCalledWith('C:\\Work', 'Claims Portal')
  })

  it('pressing Enter in the name box creates the project once it is ready', async () => {
    const studio = install()
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'Claims Portal{Enter}')
    await waitFor(() => expect(studio.createProject).toHaveBeenCalledTimes(1))
  })

  it('Enter does nothing while it is not ready (no location yet)', async () => {
    const studio = install()
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.type(screen.getByLabelText('Project name'), 'Claims Portal{Enter}')
    expect(studio.createProject).not.toHaveBeenCalled()
  })

  it('remembers the location for next time, so a second project starts with it already chosen', async () => {
    install()
    const user = userEvent.setup()
    const first = render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await waitFor(() => expect(localStorage.getItem('studio.newProjectParent')).toBe('C:\\Work'))
    first.unmount()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.type(screen.getByLabelText('Project name'), 'Second')
    expect(screen.getByTestId('new-project-target').textContent).toBe('C:\\Work\\Second')
  })

  it('cancelling the folder chooser changes nothing', async () => {
    install({ pickFolder: vi.fn().mockResolvedValue(null) })
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'X')
    expect(screen.getByRole('button', { name: 'Create project' }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the reason a project could not be created and lets the person fix it and try again', async () => {
    install({ createProject: vi.fn().mockResolvedValueOnce({ ok: false, error: 'A folder named "X" already exists in that location.' }) })
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={onCreated} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'X')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/already exists/))
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create project' }).hasAttribute('disabled')).toBe(false)
  })

  it('a call that throws is an error shown, not a stuck button', async () => {
    install({ createProject: vi.fn().mockRejectedValue(new Error('IPC went away')) })
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'X')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/IPC went away/))
    expect(screen.getByRole('button', { name: 'Create project' }).hasAttribute('disabled')).toBe(false)
  })

  it('cannot be submitted twice while the first is still running', async () => {
    let finish: (r: unknown) => void = () => {}
    const studio = install({ createProject: vi.fn(() => new Promise((resolve) => { finish = resolve })) })
    const user = userEvent.setup()
    render(<NewProjectScreen onCancel={vi.fn()} onCreated={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Choose location…' }))
    await user.type(screen.getByLabelText('Project name'), 'X')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByRole('button', { name: 'Creating…' }).hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(screen.getByLabelText('Project name'), { key: 'Enter' })
    expect(studio.createProject).toHaveBeenCalledTimes(1)
    finish({ ok: true, path: 'C:\\Work\\X' })
  })

  it('Cancel goes back', async () => {
    install()
    const onCancel = vi.fn()
    render(<NewProjectScreen onCancel={onCancel} onCreated={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
