// @vitest-environment jsdom
/** The Report-an-issue dialog (src/components/ReportIssueDialog.tsx): the plugin's plan becomes the
 * form; Confirm is disabled with ONE reason in the §2.7 order (no actor → the capability → the
 * channel → the screenshot → the privacy confirmation → the table's shape error) and the preview
 * shows what IS known of the line; a pasted screenshot is main's record; Confirm runs exactly one
 * `reportIssue` with the request the answers became; exit 1 routes the plugin's gaps beside the
 * fields they name; exit 0 shows the plugin's proposals and the way to the Issues view. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IssuePlanRead, IssueQuestion, IssueReportResult } from '../shared/types'
import { CONFIRM_NO_CLIENT_DATA, NO_ACTOR, NO_SCREENSHOT } from '../shared/reasons'
import { CONFIRM_REPORT, OPEN_ISSUES, PASTE_SCREENSHOT, ReportIssueDialog, type ReportIssueDialogProps } from '../src/components/ReportIssueDialog'

const q = (id: string, prompt: string, kind: IssueQuestion['kind'], over: Partial<IssueQuestion> = {}): IssueQuestion =>
  ({ id, prompt, kind, required: true, options: null, hint: null, channels: null, ...over })

const PLAN: IssuePlanRead = {
  ok: true,
  plan: {
    channel: 'web',
    questions: [
      q('channel', 'Where in the product did you see it?', 'choice', { options: [{ value: 'web', label: 'The web UI (a screen in the browser)' }, { value: 'api', label: 'The API (a request and its response)' }] }),
      q('browser_device', 'Browser and device', 'text', { channels: ['web', 'mobile'] }),
      q('last_action', 'What did you click or type right before?', 'text', { channels: ['web', 'mobile'] }),
      q('title', 'One line that names the bug', 'text'),
      q('what_happened', 'What happened?', 'multiline'),
      q('expected', 'What did you expect instead?', 'multiline'),
      q('steps', 'Steps to reproduce', 'lines'),
      q('environment', 'Which environment?', 'choice', { options: ['local', 'dev', 'test', 'staging', 'production'].map((v) => ({ value: v, label: v })) }),
      q('product_version', 'Which build or version of the product?', 'text', { required: false, auto: true }),
      q('severity', 'How badly does it hurt?', 'choice', { options: [{ value: 'blocks', label: 'Blocks' }, { value: 'degraded', label: 'Degraded' }, { value: 'cosmetic', label: 'Cosmetic' }] }),
      q('frequency', 'How often?', 'choice', { options: [{ value: 'always', label: 'Every time' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'once', label: 'Once' }] }),
      q('data_impact', 'What did it do to the data?', 'choice', { options: ['none', 'wrong-shown', 'wrong-written', 'exposed'].map((v) => ({ value: v, label: v })) }),
      q('persona', 'What type of user were you acting as?', 'text'),
      q('reporter_role', 'And your role on the team?', 'choice', { options: ['builder', 'checker', 'owner', 'product'].map((v) => ({ value: v, label: v })) }),
      q('spec', 'The spec this part of the product was built under (optional)', 'text', { required: false }),
      q('screenshot', 'A screenshot of the product as it looked', 'file'),
      q('no_client_data', 'Nothing in the screenshot or these words is client data, personal data or a secret', 'confirm'),
    ],
    lifecycle: { statuses: [], triage_verdicts: [], priorities: [], priority_labels: {}, status_labels: {}, triage_verdict_labels: {} },
    minimum: { title_chars: [8, 120], what_happened_chars: 20, expected_chars: 10, screenshots: 1, screenshot_bytes: 10485760 },
  },
}

const ENV = { ok: true as const, env: { repo: { host: 'github', slug: 'acme/claims', web_url: null, branch: 'main', commit: 'abc1234', describe: null }, machine: { os: 'macOS-26', python: '3.13' }, tooling: { plugin_version: '1.8.0', app_version: '0.1.0' }, captured_at: 't' }, envPath: '/tmp/togo-issues/environment-1.json' }
const SHOT = { ok: true as const, path: '/tmp/togo-issues/pasted-1.png', previewUrl: 'data:image/jpeg;base64,AAAA', width: 1440, height: 900, bytes: 2048, source: 'clipboard' as const, name: 'pasted-1.png' }

function install(over: Record<string, unknown> = {}) {
  const studio = {
    getIssueQuestions: vi.fn().mockResolvedValue(PLAN),
    getIssueEnvironment: vi.fn().mockResolvedValue(ENV),
    pasteScreenshot: vi.fn().mockResolvedValue(SHOT),
    pickScreenshot: vi.fn().mockResolvedValue(null),
    captureWindow: vi.fn().mockResolvedValue({ ok: false, error: 'no window to capture' }),
    reportIssue: vi.fn(),
    ...over,
  }
  ;(window as unknown as { studio: typeof studio }).studio = studio
  return studio
}

function mount(over: Partial<ReportIssueDialogProps> = {}) {
  const props: ReportIssueDialogProps = {
    open: true, projectPath: '/p', actor: { name: 'Priya N.', source: 'typed' }, capabilities: ['issue-questions', 'issue-env', 'issue-report'],
    specs: [{ id: '0007', name: 'claim-export' }], onClose: vi.fn(), onReported: vi.fn(), onNavigate: vi.fn(), ...over,
  }
  const utils = render(<ReportIssueDialog {...props} />)
  return { ...utils, props }
}

const dialog = () => screen.getByTestId('report-issue-dialog')
// A disabled kit button carries its reason as visually hidden text, so its accessible name is the
// label followed by the reason: match on the label's start.
const confirmButton = () => within(dialog()).getByRole('button', { name: new RegExp(`^${CONFIRM_REPORT}`) })
const reasonOf = (button: HTMLElement) => button.getAttribute('title') ?? ''

async function fillMinimum() {
  await waitFor(() => expect(screen.getByLabelText('One line that names the bug')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Browser and device'), { target: { value: 'Chrome 130 on Windows 11' } })
  fireEvent.change(screen.getByLabelText('What did you click or type right before?'), { target: { value: 'clicked Add line item' } })
  fireEvent.change(screen.getByLabelText('One line that names the bug'), { target: { value: 'Claim total doubles after adding a second line item' } })
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Adding a second line item shows the claim total as twice the sum.' } })
  fireEvent.change(screen.getByLabelText('What did you expect instead?'), { target: { value: 'The total is the sum of the line items' } })
  fireEvent.change(screen.getByLabelText('Steps to reproduce'), { target: { value: 'open claim 1042\nadd a line item of 100' } })
  fireEvent.change(screen.getByLabelText('Which environment?'), { target: { value: 'test' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'How badly does it hurt?' })).getByRole('button', { name: 'Degraded' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'How often?' })).getByRole('button', { name: 'Every time' }))
  fireEvent.change(screen.getByLabelText('What did it do to the data?'), { target: { value: 'wrong-shown' } })
  fireEvent.change(screen.getByLabelText('What type of user were you acting as?'), { target: { value: 'a claims adjuster' } })
  fireEvent.change(screen.getByLabelText('And your role on the team?'), { target: { value: 'checker' } })
}

beforeEach(() => { install() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ReportIssueDialog', () => {
  it('renders the plugin’s questions for the chosen channel and re-reads the plan when the channel changes', async () => {
    const studio = install()
    mount()
    await waitFor(() => expect(studio.getIssueQuestions).toHaveBeenCalledWith('/p', 'web'))
    await waitFor(() => expect(screen.getByLabelText('Browser and device')).toBeTruthy())
    expect(screen.getByLabelText('What type of user were you acting as?')).toBeTruthy()
    expect(screen.getByLabelText('And your role on the team?')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Where in the product did you see it?'), { target: { value: 'api' } })
    await waitFor(() => expect(studio.getIssueQuestions).toHaveBeenCalledWith('/p', 'api'))
  })

  it('shows the build under test from the plugin’s env document', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('issue-env').textContent).toContain('acme/claims'))
    expect(screen.getByTestId('issue-env').textContent).toContain('abc1234')
  })

  it('Confirm is disabled with one reason, in order: the screenshot, then the privacy confirmation, then the shape', async () => {
    mount()
    await waitFor(() => expect(screen.getByLabelText('One line that names the bug')).toBeTruthy())
    expect(reasonOf(confirmButton())).toBe(NO_SCREENSHOT)
    fireEvent.click(screen.getByRole('button', { name: PASTE_SCREENSHOT }))
    await waitFor(() => expect(screen.getByAltText(/Screenshot 1, pasted from the clipboard/)).toBeTruthy())
    expect(reasonOf(confirmButton())).toBe(CONFIRM_NO_CLIENT_DATA)
    fireEvent.click(screen.getByTestId('issue-privacy'))
    expect(reasonOf(confirmButton())).toContain('title is required')
    expect(screen.getByTestId('issue-argv').textContent).toContain('<title?>')
  })

  it('without an actor the reason is NO_ACTOR and Sign in leans to Settings; on an older plugin it names the capability', async () => {
    const { props } = mount({ actor: null })
    await waitFor(() => expect(screen.getByLabelText('One line that names the bug')).toBeTruthy())
    expect(reasonOf(confirmButton())).toBe(NO_ACTOR)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(props.onNavigate).toHaveBeenCalledWith({ area: 'settings' })
    cleanup()
    mount({ capabilities: ['issue-questions', 'issue-env'] })
    await waitFor(() => expect(screen.getByLabelText('One line that names the bug')).toBeTruthy())
    expect(reasonOf(confirmButton())).toBe('arrives with a newer plugin: lacks issue-report')
  })

  it('a complete form previews the golden line and Confirm runs exactly one reportIssue with the request the answers became', async () => {
    const result: IssueReportResult = { ok: true, exitCode: 0, refused: false, stdout: '{}', stderr: '', argv: ['new', '--state', '/p/.sdlc/state.yaml'], issue: 'ISS-0001', path: '.sdlc/issues/ISS-0001-x.md', gaps: [], advisory: [], warnings: [], proposedRisk: 'MEDIUM', proposedPriority: 'P2' }
    const studio = install({ reportIssue: vi.fn().mockResolvedValue(result) })
    const { props } = mount()
    await fillMinimum()
    fireEvent.click(screen.getByRole('button', { name: PASTE_SCREENSHOT }))
    await waitFor(() => expect(screen.getByAltText(/Screenshot 1/)).toBeTruthy())
    fireEvent.click(screen.getByTestId('issue-privacy'))
    await waitFor(() => expect(confirmButton().hasAttribute('disabled')).toBe(false))
    const preview = screen.getByTestId('issue-argv').textContent ?? ''
    expect(preview).toContain('Run: report_issue.py new --title "Claim total doubles after adding a second line item" --channel web')
    expect(preview).toContain('--answer "browser_device=Chrome 130 on Windows 11"')
    expect(preview).toContain('--screenshot /tmp/togo-issues/pasted-1.png --no-client-data --env-json /tmp/togo-issues/environment-1.json --by "Priya N." --json')
    fireEvent.click(confirmButton())
    await waitFor(() => expect(studio.reportIssue).toHaveBeenCalledTimes(1))
    expect(studio.reportIssue).toHaveBeenCalledWith('/p', expect.objectContaining({
      channel: 'web', title: 'Claim total doubles after adding a second line item', environment: 'test', severity: 'degraded', frequency: 'always',
      dataImpact: 'wrong-shown', persona: 'a claims adjuster', reporterRole: 'checker', steps: ['open claim 1042', 'add a line item of 100'],
      screenshots: ['/tmp/togo-issues/pasted-1.png'], noClientData: true, environmentPath: '/tmp/togo-issues/environment-1.json',
      answers: { browser_device: 'Chrome 130 on Windows 11', last_action: 'clicked Add line item' },
    }))
    await waitFor(() => expect(screen.getByTestId('issue-result').textContent).toContain('Done'))
    expect(screen.getByTestId('issue-written').textContent).toContain('ISS-0001')
    expect(screen.getByTestId('issue-proposal').textContent).toContain('P2')
    expect(screen.getByTestId('issue-proposal').textContent).toContain('MEDIUM')
    expect(props.onReported).toHaveBeenCalledWith('ISS-0001')
    fireEvent.click(screen.getByRole('button', { name: OPEN_ISSUES }))
    expect(props.onNavigate).toHaveBeenCalledWith({ area: 'issues' })
  })

  it('exit 1 routes the plugin’s gaps beside the fields they name, verbatim', async () => {
    const result: IssueReportResult = {
      ok: false, exitCode: 1, refused: false, stdout: '', stderr: '', argv: ['new'], issue: null, path: null, advisory: [], warnings: [], proposedRisk: null, proposedPriority: null,
      gaps: ['what_happened: at least 20 characters — what you saw, in the words on screen', 'screenshot: shot.png is not a PNG, JPEG, GIF or WebP image (decided by its bytes, not its name)', 'something general'],
    }
    install({ reportIssue: vi.fn().mockResolvedValue(result) })
    mount()
    await fillMinimum()
    fireEvent.click(screen.getByRole('button', { name: PASTE_SCREENSHOT }))
    await waitFor(() => expect(screen.getByAltText(/Screenshot 1/)).toBeTruthy())
    fireEvent.click(screen.getByTestId('issue-privacy'))
    await waitFor(() => expect(confirmButton().hasAttribute('disabled')).toBe(false))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.getByTestId('issue-result').textContent).toContain('Not done'))
    expect(screen.getByText('at least 20 characters — what you saw, in the words on screen')).toBeTruthy()
    expect(screen.getByText(/not a PNG, JPEG, GIF or WebP image/)).toBeTruthy()
    expect(screen.getByText('• something general')).toBeTruthy()
    expect(screen.queryByTestId('issue-written')).toBeNull()
  })

  it('a refused report shows the plugin’s refusal and withholds the free text from the line it echoes', async () => {
    const result: IssueReportResult = {
      ok: false, exitCode: 2, refused: true, stdout: 'Refused: the report contains what looks like a GitHub token — remove it', stderr: '',
      argv: ['new', '--title', 'A title', '--channel', 'web', '--what', 'secret ghp_abcdefghijklmnopqrstuvwxyz012345 here', '--by', 'Priya N.', '--json'],
      issue: null, path: null, gaps: [], advisory: [], warnings: [], proposedRisk: null, proposedPriority: null,
    }
    install({ reportIssue: vi.fn().mockResolvedValue(result) })
    mount()
    await fillMinimum()
    fireEvent.click(screen.getByRole('button', { name: PASTE_SCREENSHOT }))
    await waitFor(() => expect(screen.getByAltText(/Screenshot 1/)).toBeTruthy())
    fireEvent.click(screen.getByTestId('issue-privacy'))
    await waitFor(() => expect(confirmButton().hasAttribute('disabled')).toBe(false))
    fireEvent.click(confirmButton())
    const pane = await screen.findByTestId('issue-result')
    expect(pane.textContent).toContain('Refused by the plugin')
    expect(pane.textContent).toContain('GitHub token')
    expect(pane.textContent).toContain('--what <withheld>')
    expect(pane.textContent).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345')
  })

  it('a clipboard without an image is said in the plugin-side words, and the dialog stays', async () => {
    install({ pasteScreenshot: vi.fn().mockResolvedValue({ ok: false, error: 'the clipboard holds no image — take a screenshot of the product and copy it, or choose a file' }) })
    mount()
    await waitFor(() => expect(screen.getByLabelText('One line that names the bug')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: PASTE_SCREENSHOT }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/holds no image/))
    expect(screen.getByTestId('issue-no-shot')).toBeTruthy()
  })
})
