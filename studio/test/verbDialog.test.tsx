// @vitest-environment jsdom
/** The omnibar's dialog (togo-command-center.md §3.6, §2.4): the exact argv and the actor are
 * shown before anything runs; a match never spawns without Confirm; the result pane is headed by
 * the exit code alone — "Done" / "Not done" / "Refused by the plugin" — with stdout and stderr
 * verbatim; `onDone` fires after an exit 0 only; no actor disables Confirm with `NO_ACTOR`; a
 * missing capability disables it with `newerPlugin`; a stranger as recipient withholds Confirm.
 * `window.studio` is mocked PARTIALLY — only the methods this component reaches. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionInfo, SprintVerbResult } from '../shared/types'
import { EXIT_HEADING, NO_ACTOR, newerPlugin, notOnRoster } from '../shared/reasons'
import { VerbDialog } from '../src/components/VerbDialog'
import { connectionStore, resetConnectionStore } from '../src/stores/connectionStore'
import { parseIntent, type IntentContext, type IntentMatch } from '../src/palette/intents'

const CTX: IntentContext = {
  rows: [{ spec: '0002', status: 'draft', sprint: 'S08', path: 'specs/0002-b.md' }, { spec: '0006', status: 'in-flight', sprint: 'S08', path: 'specs/0006-f.md' }],
  roster: [{ handle: '@sam-k', name: 'Sam K' }],
  activeSprint: 'S08', sprintIds: ['S08'], capabilities: ['sprint-status', 'sprint-write'], actor: '@arjun',
}

function signedIn(): ConnectionInfo {
  return {
    repo: 'o/r', branch: 'main', localFolder: '/p', account: '@arjun', accountSource: 'roster', rosterHandle: '@arjun',
    host: 'github', hostSource: 'remote', cli: { name: 'gh', found: true, extension: null, signedIn: 'yes' }, lastPulledAt: null,
  } as unknown as ConnectionInfo
}

function result(exitCode: 0 | 1 | 2, over: Partial<SprintVerbResult> = {}): SprintVerbResult {
  return { ok: exitCode === 0, exitCode, refused: exitCode === 2, stdout: exitCode === 0 ? 'recorded eng verdict accepted on 0002' : '', stderr: exitCode === 0 ? '' : `refused: --by "Claude" is not a person`, argv: ['verdict', '--spec', '0002', '--lane', 'eng', '--verdict', 'accepted', '--by', '@arjun'], verb: 'verdict', ...over }
}

let runSprintVerb: ReturnType<typeof vi.fn>
beforeEach(() => {
  runSprintVerb = vi.fn()
  // @ts-expect-error - partial test double: only what the dialog reaches
  window.studio = { runSprintVerb }
  connectionStore.set(signedIn())
})
afterEach(() => {
  cleanup()
  resetConnectionStore()
  // @ts-expect-error - cleaning up the test double
  delete window.studio
})

const match = (text: string, ctx = CTX) => parseIntent(text, ctx) as IntentMatch

function mount(m: IntentMatch, over: Partial<Parameters<typeof VerbDialog>[0]> = {}) {
  const props = { projectPath: '/p', match: m, roster: [{ handle: '@sam-k', name: 'Sam K' }], capabilities: CTX.capabilities, onClose: vi.fn(), onDone: vi.fn(), onHandOff: vi.fn(), onNavigate: vi.fn(), ...over }
  render(<VerbDialog {...props} />)
  return props
}

describe('VerbDialog', () => {
  it('shows the exact line, the actor and its source, and the preconditions — and spawns nothing until Confirm', () => {
    mount(match('verdict 0002 accepted'))
    expect(screen.getByTestId('verb-preview').textContent).toBe('Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun')
    expect(screen.getByTestId('verb-actor').textContent).toContain('@arjun')
    expect(screen.getByTestId('verb-actor').textContent).toContain('roster')
    expect(screen.getByText('The plugin will check')).toBeTruthy()
    expect(runSprintVerb).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm.hasAttribute('data-write')).toBe(true)
  })

  it('Confirm runs the request once; exit 0 reads "Done" with stdout verbatim and fires onDone', async () => {
    runSprintVerb.mockResolvedValue(result(0))
    const props = mount(match('verdict 0002 accepted'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByTestId('verb-result')).toBeTruthy())
    expect(runSprintVerb).toHaveBeenCalledTimes(1)
    expect(runSprintVerb).toHaveBeenCalledWith('/p', { verb: 'verdict', spec: '0002', lane: 'eng', verdict: 'accepted', reason: undefined })
    const pane = screen.getByTestId('verb-result')
    expect(pane.querySelector('h3')?.textContent).toBe(EXIT_HEADING[0])
    expect(pane.textContent).toContain('recorded eng verdict accepted on 0002')
    expect(pane.getAttribute('data-tone')).toBe('ok')
    expect(props.onDone).toHaveBeenCalledTimes(1)
    // Done: the Confirm is gone, the footer offers Close.
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  it('exit 2 reads "Refused by the plugin" with stderr verbatim and does not fire onDone; exit 1 reads "Not done"', async () => {
    runSprintVerb.mockResolvedValue(result(2))
    const props = mount(match('verdict 0002 accepted'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByTestId('verb-result')).toBeTruthy())
    const pane = screen.getByTestId('verb-result')
    expect(pane.querySelector('h3')?.textContent).toBe(EXIT_HEADING[2])
    expect(pane.textContent).toContain('refused: --by "Claude" is not a person')
    expect(pane.getAttribute('data-tone')).toBe('error')
    expect(props.onDone).not.toHaveBeenCalled()
    cleanup()
    runSprintVerb.mockResolvedValue(result(1, { stderr: 'spec 0002 is not slated in S08' }))
    mount(match('verdict 0002 accepted'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByTestId('verb-result').querySelector('h3')?.textContent).toBe(EXIT_HEADING[1]))
    expect(screen.getByTestId('verb-result').textContent).toContain('spec 0002 is not slated in S08')
  })

  it('without an actor the Confirm is disabled with NO_ACTOR; without the capability, with newerPlugin', () => {
    resetConnectionStore()
    mount(match('ack 0006'))
    const confirm = screen.getByRole('button', { name: /^Confirm/ }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(confirm.getAttribute('title')).toBe(NO_ACTOR)
    expect(screen.getByTestId('verb-actor').textContent).toContain(NO_ACTOR)
    cleanup()
    connectionStore.set(signedIn())
    mount(match('ack 0006'), { capabilities: ['sprint-status'] })
    const gated = screen.getByRole('button', { name: /^Confirm/ }) as HTMLButtonElement
    expect(gated.disabled).toBe(true)
    expect(gated.getAttribute('title')).toBe(newerPlugin('sprint-write'))
  })

  it('a recipient the roster does not know disables Confirm with the gap as its reason and offers the picker; picking enables it', () => {
    mount(match('hand 0006 to Zed'))
    // Present and disabled, never withheld: a disabled control always carries its reason (§2.7).
    const gap = screen.getByRole('button', { name: /^Confirm/ }) as HTMLButtonElement
    expect(gap.disabled).toBe(true)
    expect(gap.getAttribute('title')).toBe(notOnRoster('Zed'))
    expect(screen.getAllByText(/“Zed” is not on the roster/).length).toBeGreaterThan(0)
    const picker = screen.getByRole('combobox')
    // Typing alone resolves nothing: 'sam' is not a handle, so Confirm stays disabled.
    fireEvent.change(picker, { target: { value: 'sam' } })
    expect((screen.getByRole('button', { name: /^Confirm/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(picker, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(screen.getByTestId('verb-preview').textContent).toBe('Run: sprint.py handoff --spec 0006 --to @sam-k --by @arjun')
  })

  it('a malformed request shows the table\'s reasons and spawns nothing (n-a without a reason)', async () => {
    mount(match('verdict 0002 n-a data'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('n-a needs a reason')
    expect(runSprintVerb).not.toHaveBeenCalled()
  })

  it('"pull" on a slated spec opens the hand-off flow instead of spawning; "close" opens the close screen', () => {
    const ready = { ...CTX, rows: [{ spec: '0001', status: 'ready', sprint: 'S08', path: 'specs/0001-a.md' }] }
    const props = mount(match('pull 0001', ready))
    const open = screen.getByRole('button', { name: 'Open the hand-off' })
    expect(open.hasAttribute('data-write')).toBe(false)
    fireEvent.click(open)
    expect(props.onHandOff).toHaveBeenCalledWith('0001')
    expect(props.onClose).toHaveBeenCalled()
    expect(runSprintVerb).not.toHaveBeenCalled()
    cleanup()
    const close = mount(match('close S08'))
    fireEvent.click(screen.getByRole('button', { name: 'Open the close screen' }))
    expect(close.onNavigate).toHaveBeenCalledWith({ area: 'closing' })
  })

  it('a bridge without the method is "Not done" in plain words — nothing pretends to have run', async () => {
    // @ts-expect-error - a bridge from before the command center
    window.studio = {}
    mount(match('ack 0006'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByTestId('verb-result')).toBeTruthy())
    expect(screen.getByTestId('verb-result').querySelector('h3')?.textContent).toBe(EXIT_HEADING[1])
    expect(screen.getByTestId('verb-result').textContent).toContain('runSprintVerb is not in this build')
  })
})
