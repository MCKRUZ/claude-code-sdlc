/** The console's Plain view for az (code-host providers §7, Wave 7-B): an `az` invocation is
 * recognised the same three ways a `gh` one is (bare, absolute path, `cmd /c az.cmd`) and each
 * verb gets the plain phrase the plan names. Every existing git/gh phrase is pinned unchanged. */
import { describe, expect, it } from 'vitest'
import { gitOrGhSubcommand, plainSummary, toolPlainPhrase } from '../src/components/Console'
import type { ConsoleEntry } from '../shared/types'

const entry = (command: string, args: string[], over: Partial<ConsoleEntry> = {}): ConsoleEntry => ({
  id: '1', command, args, cwd: '/p', startedAt: '2026-10-05T10:00:00Z', durationMs: 1200, exitCode: 0, ok: true, stdout: '', stderr: '', ...over,
})

describe('gitOrGhSubcommand recognises az however it was launched', () => {
  it('bare az', () => {
    expect(gitOrGhSubcommand(entry('az', ['account', 'show', '--only-show-errors']))).toEqual({ tool: 'az', subArgs: ['account', 'show', '--only-show-errors'] })
  })
  it('a resolved absolute path, with or without .exe', () => {
    expect(gitOrGhSubcommand(entry('/usr/local/bin/az', ['repos', 'pr', 'list']))?.tool).toBe('az')
    expect(gitOrGhSubcommand(entry('C:\\Program Files\\Azure\\az.exe', ['repos', 'pr', 'list']))?.tool).toBe('az')
  })
  it('the Windows az.cmd shim through cmd /c, with the verbs one position further in', () => {
    const r = gitOrGhSubcommand(entry('cmd', ['/c', 'C:\\Program Files\\Azure\\az.cmd', 'repos', 'pr', 'create', '--title', 'x']))
    expect(r).toEqual({ tool: 'az', subArgs: ['repos', 'pr', 'create', '--title', 'x'] })
  })
  it('still recognises git and gh, and nothing else', () => {
    expect(gitOrGhSubcommand(entry('git', ['fetch']))?.tool).toBe('git')
    expect(gitOrGhSubcommand(entry('cmd', ['/c', 'gh.cmd', 'pr', 'list']))?.tool).toBe('gh')
    expect(gitOrGhSubcommand(entry('uv', ['run', 'x.py']))).toBeNull()
    expect(gitOrGhSubcommand(entry('azure', ['x']))).toBeNull()
  })
})

describe('az plain phrases', () => {
  it.each([
    [['repos', 'pr', 'create', '--title', 'x'], 'Opened a pull request'],
    [['repos', 'pr', 'update', '--id', '12', '--status', 'completed'], 'Merged a pull request'],
    [['repos', 'pr', 'update', '--id', '12', '--status', 'abandoned'], 'Updated a pull request'],
    [['repos', 'pr', 'list', '--source-branch', 'spec/0008'], 'Checked pull request status'],
    [['repos', 'pr', 'show', '--id', '12'], 'Checked pull request status'],
    [['account', 'show'], 'Checked who is signed in'],
    [['repos', 'policy', 'list', '--branch', 'main'], 'Checked branch policies'],
    [['devops', 'invoke', '--area', 'git'], 'Talked to the code host'],
    [['version'], 'Talked to the code host'],
  ])('az %j → %s', (args, phrase) => {
    expect(toolPlainPhrase('az', args)).toBe(phrase)
  })

  it('reads through the whole summary sentence, pending and failed included', () => {
    expect(plainSummary(entry('az', ['repos', 'pr', 'create']))).toBe('Opened a pull request — finished in 1.2s.')
    expect(plainSummary(entry('az', ['account', 'show'], { pending: true }))).toBe('Checked who is signed in — still running…')
    expect(plainSummary(entry('az', ['repos', 'pr', 'list'], { ok: false, exitCode: 1 }))).toBe('Checked pull request status — failed after 1.2s.')
  })
})

describe('the existing git and gh phrases are unchanged', () => {
  it.each([
    ['gh', ['pr', 'create'], 'Opened a pull request'],
    ['gh', ['pr', 'merge', '12'], 'Merged a pull request'],
    ['gh', ['pr', 'list'], 'Checked pull request status'],
    ['gh', ['api', 'repos/x/y'], 'Talked to the code host'],
    ['gh', ['auth', 'status'], 'Talked to the code host'],
    ['git', ['fetch'], 'Checked for changes'],
    ['git', ['push'], 'Saved changes to the repository'],
    ['git', ['write-tree'], 'Prepared a commit'],
    ['git', ['frobnicate'], 'Talked to git'],
  ] as const)('%s %j → %s', (tool, args, phrase) => {
    expect(toolPlainPhrase(tool, [...args])).toBe(phrase)
  })
})
