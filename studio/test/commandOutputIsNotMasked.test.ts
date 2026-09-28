/** Masking a secret for display must never change the data a command returned.
 *
 * Found on a real project: a spec containing `id-token: write` (a GitHub Actions permission)
 * arrived on the person's machine as `id-token=***`, and the two versions then showed as a clash
 * that looked identical on screen. Studio hides anything shaped like `token: value` in its console
 * and error messages — right for a panel a person might paste into a bug report — but the same
 * masked text was what `git show` handed back as the document's content, so the masking was
 * written INTO the file. The same output path carried the plugin's reading of a document, Claude's
 * combined and drafted text, and version and diff text.
 *
 * The rule now: what is displayed or logged is masked; what a caller uses as data is exact.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { getConsoleLog, rawStdout, runCommand } from '../electron/main/commandRunner'
import { openDocument } from '../electron/main/documents'
import { initSettingsPath } from '../electron/main/settings'
import { pull } from '../electron/main/sync'
import { requirePlugin } from './pluginRoot'

// The text goes in through the environment, not the arguments: arguments are recorded in the entry
// too, and this is about the OUTPUT.
const say = (text: string) =>
  runCommand(process.execPath, ['-e', 'process.stdout.write(process.env.SAY)'], process.cwd(), { env: { SAY: text } })

describe('what a command returns', () => {
  const SECRETISH = 'permissions:\n  id-token: write\npassword: hunter2\n'

  it('masks it for display', async () => {
    const entry = await say(SECRETISH)
    expect(entry.stdout).not.toContain('id-token: write')
    expect(entry.stdout).toContain('id-token=***')
  })

  it('hands the caller the exact text as data', async () => {
    expect(rawStdout(await say(SECRETISH))).toBe(SECRETISH)
  })

  it('keeps the masked text in the console log, never the exact text', async () => {
    await say('api_key: sk-live-not-for-the-log')
    const last = getConsoleLog().at(-1)!
    expect(last.stdout).not.toContain('sk-live-not-for-the-log')
  })

  it('never lets the exact text cross to the window: it is not serialized', async () => {
    const entry = await say(SECRETISH)
    expect(JSON.stringify(entry)).not.toContain('hunter2')
    expect(JSON.stringify(structuredClone(entry))).not.toContain('hunter2')
    expect(rawStdout(structuredClone(entry))).toContain('***') // a copy that crossed over has only the masked text
  })

  it('survives being copied with a changed field, as the plugin-mismatch explainer does', async () => {
    const entry = await say(SECRETISH)
    expect(rawStdout({ ...entry, stderr: 'explained' })).toBe(SECRETISH)
  })

  it('falls back to the displayed text for an entry that never had a raw copy', () => {
    const plain = { id: '1', command: 'x', args: [], cwd: '.', startedAt: '', durationMs: 0, exitCode: 0, ok: true, stdout: 'shown', stderr: '' }
    expect(rawStdout(plain)).toBe('shown')
  })

  it('does not damage a multi-byte character that straddles two chunks of output', async () => {
    // Each chunk used to be decoded on its own, so a character cut by a chunk boundary became U+FFFD.
    // Three-byte characters in a large output guarantee some boundary lands inside one.
    const big = '—é“”'.repeat(60_000)
    const entry = await say(big)
    expect(rawStdout(entry)).toBe(big)
    expect(rawStdout(entry)).not.toContain('�')
  })
})

// --- through the real paths ---------------------------------------------------------------

const PLUGIN = requirePlugin(__dirname)
const DOC = '.sdlc/decision-log.md'
const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
const made: string[] = []
afterAll(() => { for (const ws of made) rmSync(ws, { recursive: true, force: true }) })

describe.skipIf(!PLUGIN.available)('a document that mentions something secret-shaped', () => {
  const WORKFLOW = '# Decisions\n\nD-01 settled.\n\n```yaml\npermissions:\n  id-token: write\n```\n\nthe deploy password: is set in the vault.\n'

  it('arrives from the remote exactly as written', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'studio-mask-'))
    made.push(ws)
    initSettingsPath(join(ws, 'userData'))
    const origin = join(ws, 'origin.git')
    const project = join(ws, 'project')
    git(['init', '--bare', '--initial-branch=main', origin], ws)
    git(['clone', origin, project], ws)
    git(['config', 'user.email', 'me@example.com'], project)
    git(['config', 'user.name', 'Me'], project)
    execFileSync(PLUGIN.python, [
      join(PLUGIN.scriptsDir, 'init_project.py'),
      '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: PLUGIN.scriptsDir })
    mkdirSync(join(project, '.sdlc'), { recursive: true })
    writeFileSync(join(project, DOC), '# Decisions\n\nD-01 settled.\n')
    git(['add', '-A'], project)
    git(['commit', '-m', 'initial'], project)
    git(['push', '-u', 'origin', 'main'], project)
    expect((await pull(project, PLUGIN.scriptsDir)).ok).toBe(true) // Studio and the remote now agree

    const teammate = join(ws, 'teammate')
    git(['clone', origin, teammate], ws)
    git(['config', 'user.email', 'them@example.com'], teammate)
    git(['config', 'user.name', 'Them'], teammate)
    writeFileSync(join(teammate, DOC), WORKFLOW)
    git(['commit', '-am', 'record the deploy permissions'], teammate)
    git(['push'], teammate)

    expect((await pull(project, PLUGIN.scriptsDir)).ok).toBe(true) // the remote's change arrives
    expect(readFileSync(join(project, DOC), 'utf-8')).toBe(WORKFLOW)
  }, 180_000)

  it('is read by Studio exactly as written, so what is shown and edited is the real text', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'studio-mask-doc-'))
    made.push(ws)
    const rel = '.sdlc/artifacts/00-discovery/problem-statement.md'
    mkdirSync(join(ws, '.sdlc', 'artifacts', '00-discovery'), { recursive: true })
    const fixture = readFileSync(join(PLUGIN.scriptsDir, 'tests', 'fixtures', 'documents', 'problem-statement.md'), 'utf-8')
    writeFileSync(join(ws, rel), `${fixture.trimEnd()}\n\n## CI Notes\n\nThe job needs id-token: write and a secret: from the vault.\n`)

    const doc = await openDocument(ws, PLUGIN.scriptsDir, rel)
    expect(doc.ok, doc.error).toBe(true)
    const notes = doc.sections.find((s) => s.heading === 'CI Notes')
    expect(notes, 'the added section should be read').toBeDefined()
    expect(notes!.fields.Content?.value).toContain('id-token: write')
    expect(notes!.fields.Content?.value).not.toContain('***')
  }, 120_000)
})
