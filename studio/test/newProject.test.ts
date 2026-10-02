import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProjectFolder, validateProjectName } from '../electron/main/newProject'

// "Open folder…" was the only way in, so a person starting from nothing had to leave the app,
// make a folder in their file manager, and come back. Creating the folder is Studio's job; the
// name is typed by a person, so it is the one thing that must never be trusted.

describe('validateProjectName — a name that is safe as a folder on every platform', () => {
  it.each(['Claims Portal', 'token-tracker', 'acme_2026', 'Project (v2)', 'a'])('accepts %j', (name) => {
    expect(validateProjectName(name)).toBeNull()
  })

  it.each([
    ['', /name/i],
    ['   ', /name/i],
    ['a/b', /can't contain/i],
    ['a\\b', /can't contain/i],
    ['..', /name/i],
    ['.', /name/i],
    ['a:b', /can't contain/i],
    ['what?', /can't contain/i],
    ['pipe|name', /can't contain/i],
    ['trailing.', /end with/i],
    ['trailing ', null], // trimmed, so this one is fine — handled below
    ['x'.repeat(65), /64/],
    ['CON', /reserved/i],
    ['nul', /reserved/i],
    ['Com1', /reserved/i],
    ['lpt9.txt', /reserved/i],
  ])('rejects %j', (name, reason) => {
    const result = validateProjectName(name)
    if (reason === null) expect(result).toBeNull()
    else expect(result).toMatch(reason)
  })

  it('rejects a name with a control character', () => {
    expect(validateProjectName('bad\u0000name')).toMatch(/can't contain/i)
    expect(validateProjectName('bad\nname')).toMatch(/can't contain/i)
  })

  it('does not reject a name just because it contains a reserved word as a part', () => {
    expect(validateProjectName('console')).toBeNull()
    expect(validateProjectName('CONNECT')).toBeNull()
  })
})

describe('createProjectFolder', () => {
  let parent: string
  beforeEach(() => { parent = mkdtempSync(join(tmpdir(), 'studio-newproject-')) })
  afterEach(() => rmSync(parent, { recursive: true, force: true }))

  const gitThatWorks = () => vi.fn().mockResolvedValue('')

  it('creates the folder inside the chosen location and starts version tracking in it', async () => {
    const git = gitThatWorks()
    const result = await createProjectFolder(parent, 'Claims Portal', { git })
    expect(result).toEqual({ ok: true, path: join(parent, 'Claims Portal') })
    expect(existsSync(join(parent, 'Claims Portal'))).toBe(true)
    expect(git).toHaveBeenCalledWith(['init', '-b', 'main'], join(parent, 'Claims Portal'))
  })

  it('trims the name, so a stray space never becomes part of the folder name', async () => {
    const result = await createProjectFolder(parent, '  Acme  ', { git: gitThatWorks() })
    expect(result).toEqual({ ok: true, path: join(parent, 'Acme') })
  })

  it('falls back to plain `git init` on a git too old to know --initial-branch', async () => {
    const git = vi.fn()
      .mockRejectedValueOnce(new Error('unknown switch `b'))
      .mockResolvedValueOnce('')
    const result = await createProjectFolder(parent, 'Old Git', { git })
    expect(result.ok).toBe(true)
    expect(git).toHaveBeenNthCalledWith(2, ['init'], join(parent, 'Old Git'))
  })

  it('refuses a name that already exists and touches nothing in it', async () => {
    mkdirSync(join(parent, 'Existing'))
    writeFileSync(join(parent, 'Existing', 'precious.txt'), 'keep me')
    const git = gitThatWorks()
    const result = await createProjectFolder(parent, 'Existing', { git })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already exists/i)
    expect(result.error).toMatch(/Open folder/)
    expect(git).not.toHaveBeenCalled()
    expect(readdirSync(join(parent, 'Existing'))).toEqual(['precious.txt'])
  })

  it('refuses an unsafe name before touching the disk at all', async () => {
    const git = gitThatWorks()
    const result = await createProjectFolder(parent, '../escape', { git })
    expect(result.ok).toBe(false)
    expect(git).not.toHaveBeenCalled()
    expect(readdirSync(parent)).toEqual([])
    expect(existsSync(join(parent, '..', 'escape'))).toBe(false)
  })

  it('says so when the chosen location is gone, and creates nothing', async () => {
    const result = await createProjectFolder(join(parent, 'deleted-since'), 'Proj', { git: gitThatWorks() })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/location/i)
    expect(existsSync(join(parent, 'deleted-since'))).toBe(false)
  })

  it('refuses a location that is a file, not a folder', async () => {
    writeFileSync(join(parent, 'a-file'), 'x')
    const result = await createProjectFolder(join(parent, 'a-file'), 'Proj', { git: gitThatWorks() })
    expect(result.ok).toBe(false)
  })

  it('if version tracking cannot be started, removes the folder it just made rather than leaving a half-built project', async () => {
    const git = vi.fn().mockRejectedValue(new Error('git exploded'))
    const result = await createProjectFolder(parent, 'Doomed', { git })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/git exploded/)
    expect(existsSync(join(parent, 'Doomed'))).toBe(false)
  })

  it('really starts a git repository, with the real git', async () => {
    const result = await createProjectFolder(parent, 'Real Repo')
    expect(result.ok, result.error).toBe(true)
    expect(existsSync(join(parent, 'Real Repo', '.git'))).toBe(true)
  })
})
