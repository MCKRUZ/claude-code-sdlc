/** A project with no shared repository is a state, not a failure.
 *
 * Found by the smoke suite (docs/studio-smoke-review-2026-10-05.md, bug 1): every new project has
 * no `origin` yet, so the background pull's `git fetch origin` failed on every cycle, the sidebar
 * said a red "Sync error" on every screen, and the Console listed two failed commands in red. A
 * person starting a project met an error on their first screen, with the reason only in a tooltip.
 *
 * What is pinned here is the contract the screen relies on: with no remote, a pull reports
 * `localOnly` (not an error), starts no command that is bound to fail, and a save refuses in plain
 * words instead of leaking a git message.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { getConsoleLog } from '../electron/main/commandRunner'
import { getDocumentChanges } from '../electron/main/documents'
import { initSettingsPath } from '../electron/main/settings'
import { getConnectionInfo, onSyncState, pull, save } from '../electron/main/sync'
import type { SyncState } from '../shared/types'

const made: string[] = []
const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()

/** A real git repository with a commit and, deliberately, no remote at all. */
function localOnlyProject(): string {
  const ws = mkdtempSync(join(tmpdir(), 'studio-no-remote-'))
  made.push(ws)
  initSettingsPath(join(ws, 'userData'))
  const project = join(ws, 'project')
  mkdirSync(join(project, '.sdlc'), { recursive: true })
  git(['init', '-q', '--initial-branch=main'], project)
  git(['config', 'user.email', 'me@example.com'], project)
  git(['config', 'user.name', 'Me'], project)
  writeFileSync(join(project, '.sdlc', 'state.yaml'), 'project_name: x\n')
  git(['add', '-A'], project)
  git(['commit', '-q', '-m', 'start'], project)
  return project
}

// Only git: whether `gh` is signed in is a fact about the machine (it is not, in CI) and has
// nothing to do with whether this project has a remote.
const failedGit = (project: string) =>
  getConsoleLog()
    .filter((e) => e.cwd === project && !e.ok && /(^|[\\/])git(\.exe)?$/i.test(e.command))
    .map((e) => `${e.command} ${e.args.join(' ')}`)

afterAll(() => {
  for (const ws of made) rmSync(ws, { recursive: true, force: true })
})

describe('a project with no shared repository', () => {
  it('pulls as local-only: no error state, and no command that was bound to fail', async () => {
    const project = localOnlyProject()
    const states: SyncState[] = []
    const off = onSyncState((s) => states.push(s))
    const result = await pull(project, join(project, 'no-plugin-needed'))
    off()

    expect(result.ok, result.error).toBe(true)
    expect(result.noRemote).toBe(true)
    expect(states.map((s) => s.kind)).toContain('localOnly')
    expect(states.map((s) => s.kind)).not.toContain('error')
    expect(failedGit(project)).toEqual([])
  })

  it('does not run the connection check as a failing command either', async () => {
    const project = localOnlyProject()
    const info = await getConnectionInfo(project)
    expect(info.repo).toBe('')
    expect(failedGit(project)).toEqual([])
  })

  it('reads a document\'s history from this computer without first trying a branch that cannot exist', async () => {
    const project = localOnlyProject()
    const changes = await getDocumentChanges(project, '.sdlc/state.yaml', null, 'main')
    expect(changes.map((c) => c.reason)).toEqual(['start'])
    expect(failedGit(project)).toEqual([])
  })

  it('refuses a save in plain words, without a git message in it', async () => {
    const project = localOnlyProject()
    const result = await save(project, join(project, 'no-plugin-needed'), 'a change')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not connected to a shared repository/i)
    expect(result.error).not.toMatch(/fatal|origin|exit/i)
  })
})
