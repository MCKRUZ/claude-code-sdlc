// @vitest-environment jsdom
/** Settings › Repository after code-host providers (code-host-providers.md §7 SettingsScreen row):
 * the host and how it was decided, the CLI's sign-in sentence or §7.1 reason, the other CLI "not
 * needed for this repository", "Signed in as: unavailable (…)" when the CLI cannot say, and in edit
 * mode a Segmented override that calls window.studio.setCodeHost and shows what was re-resolved. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionInfo, ConnectionReport, GateAuthStatus, ProjectSettings, ToolingReport } from '../shared/types'
import { WORDING } from '../shared/codeHostModel'
import { configureMotionForTests } from '../src/motion/motion'
import { SettingsScreen } from '../src/components/SettingsScreen'

const SETTINGS: ProjectSettings = {
  ok: true,
  roster: { file: '.sdlc/team.yaml', present: false, errors: [], teams: [], people: [] },
  wip_limits: { file: '', present: false, errors: [], teams: [] },
  approval: { file: '.sdlc/approval-settings.yaml', present: false, errors: [], stages: [] },
  fixed_rules: [],
}
const ADO: ConnectionInfo = {
  repo: 'contoso/Claims/claims-api', branch: 'main', localFolder: '/p',
  account: 'sam@corp.com', accountSource: 'roster', rosterHandle: '@sam-k',
  host: 'azure-devops', hostSource: 'remote', cli: { name: 'az', found: true, extension: true, signedIn: 'yes' },
  lastPulledAt: null, branchProtected: null,
}
const ADO_NO_AZ: ConnectionInfo = {
  ...ADO, account: null, accountSource: null, rosterHandle: null,
  cli: { name: 'az', found: false, extension: null, signedIn: 'unknown', reason: WORDING.azMissing },
}
const PINNED_GH: ConnectionInfo = {
  ...ADO, account: 'arjun', accountSource: 'host', rosterHandle: null,
  host: 'github', hostSource: 'file', cli: { name: 'gh', found: true, extension: null, signedIn: 'yes' },
}
const REPORT: ConnectionReport = { ok: true, checks: [], not_universally_expected: {} }
const TOOL = { found: true, path: '/plugin/scripts', version: '2.0.0' }
const TOOLING: ToolingReport = { claude: TOOL, uv: TOOL, pluginScripts: TOOL, git: TOOL, gh: TOOL, az: TOOL }
const GATE_AUTH: GateAuthStatus = { ok: true, repo: 'claims-api', configured: [], gates_can_sign_in: false, detail: '' }

function install(connection: ConnectionInfo) {
  const studio = {
    getProjectSettings: vi.fn().mockResolvedValue(SETTINGS),
    getConnectionInfo: vi.fn().mockResolvedValue(connection),
    getConnectionReport: vi.fn().mockResolvedValue(REPORT),
    getScorecard: vi.fn().mockResolvedValue(null),
    detectTooling: vi.fn().mockResolvedValue(TOOLING),
    getGateAuth: vi.fn().mockResolvedValue(GATE_AUTH),
    setCodeHost: vi.fn().mockResolvedValue(PINNED_GH),
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

beforeEach(() => configureMotionForTests(null))
afterEach(() => {
  cleanup()
  configureMotionForTests(null)
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

async function openRepository() {
  render(<SettingsScreen projectPath="/p" actor="Arjun M" />)
  return within(await screen.findByRole('region', { name: 'Repository' }))
}

describe('Settings › Repository: code host rows', () => {
  it('names the host with its source, the CLI with both identity halves, and the other CLI as not needed', async () => {
    install(ADO)
    const repo = await openRepository()
    expect(repo.getByText('Azure DevOps (from origin)')).toBeTruthy()
    expect(repo.getByText('az — signed in as sam@corp.com (roster: @sam-k)')).toBeTruthy()
    expect(repo.getByText('gh CLI')).toBeTruthy()
    expect(repo.getByText('not needed for this repository')).toBeTruthy()
  })

  it('az missing: "Signed in as" is unavailable (az not installed), and the CLI row carries the §7.1 sentence', async () => {
    install(ADO_NO_AZ)
    const repo = await openRepository()
    expect(repo.getByText('unavailable (az not installed)')).toBeTruthy()
    expect(repo.getByText(`az — ${WORDING.azMissing}`)).toBeTruthy()
    expect(repo.queryByText('not signed in')).toBeNull()
    // The gate-credential panel says the same thing in its own §7.1 words.
    expect((await screen.findByTestId('gate-auth-host-reason')).textContent).toContain('Reading the gate credential needs the Azure CLI')
  })

  it('the override is absent outside edit mode; in edit mode it calls setCodeHost and shows what came back', async () => {
    const studio = install(ADO)
    const repo = await openRepository()
    expect(repo.queryByRole('group', { name: 'Code host override' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const picker = within(repo.getByRole('group', { name: 'Code host override' }))
    expect(picker.getByRole('button', { name: 'Azure DevOps' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(picker.getByRole('button', { name: 'GitHub' }))

    await waitFor(() => expect(studio.setCodeHost).toHaveBeenCalledWith('/p', 'github'))
    expect(await repo.findByText('GitHub (from .sdlc/code-host.yaml)')).toBeTruthy()
    expect(repo.getByText('az CLI')).toBeTruthy()
    // The file is listed as changed-but-not-saved, like every other setting this screen edits.
    expect(screen.getByText('.sdlc/code-host.yaml', { selector: 'li' })).toBeTruthy()
  })

  it('a refusal is the plugin’s own sentence, and the rows do not change', async () => {
    const studio = install(ADO)
    studio.setCodeHost.mockRejectedValue(new Error('That change would leave the code-host file invalid: host must be one of github, azure-devops, none'))
    const repo = await openRepository()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(within(repo.getByRole('group', { name: 'Code host override' })).getByRole('button', { name: 'none' }))
    expect(await screen.findByText(/would leave the code-host file invalid/)).toBeTruthy()
    expect(repo.getByText('Azure DevOps (from origin)')).toBeTruthy()
  })
})
