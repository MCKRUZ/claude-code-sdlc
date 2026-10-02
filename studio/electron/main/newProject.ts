// Starting a project from nothing.
//
// "Open folder…" was the only way in, so a person with no folder yet had to leave the app, make
// one in their file manager, and come back. This makes the folder — and starts version tracking
// in it, because everything Studio does after this (saving, syncing, sharing with a team) rides
// on git — then hands it to the same setup wizard an existing folder goes through.
//
// The name is typed by a person and becomes a path, so it is the one input here that is never
// trusted: it is validated before anything touches the disk.

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { runGit } from './git'

const MAX_NAME_LENGTH = 64
// Characters Windows refuses in a file name; refusing them everywhere keeps a project folder
// portable between the machines a team will share it across. Control characters are never valid.
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** A plain-language reason the name cannot be used, or null when it can. The name is judged
 * trimmed, the same way it will be used. */
export function validateProjectName(raw: string): string | null {
  const name = raw.trim()
  if (name === '') return 'Give the project a name.'
  if (name === '.' || name === '..') return 'That isn\'t a usable name for a project.'
  if (ILLEGAL.test(name)) return 'A project name can\'t contain any of  < > : " / \\ | ? *  or control characters.'
  if (name.endsWith('.')) return 'A project name can\'t end with a period.'
  if (name.length > MAX_NAME_LENGTH) return `Keep the project name to ${MAX_NAME_LENGTH} characters or fewer.`
  // "CON" and "con.txt" are both reserved on Windows; the part before the first dot decides it.
  if (WINDOWS_RESERVED.test(name.split('.')[0])) return `"${name}" is a reserved name on Windows, so it can't be used for a folder.`
  return null
}

export interface CreateProjectResult {
  ok: boolean
  path?: string
  error?: string
}

export interface CreateProjectDeps {
  /** Runs git in a directory; throws on failure. Injected so the failure path is testable. */
  git?: (args: string[], cwd: string) => Promise<unknown>
}

/** Makes `<parent>/<name>` and starts a git repository in it. Never touches a folder that
 * already exists, and if version tracking cannot be started it removes the folder it just made
 * rather than leaving a half-built project behind. */
export async function createProjectFolder(
  parent: string,
  rawName: string,
  deps: CreateProjectDeps = {},
): Promise<CreateProjectResult> {
  const git = deps.git ?? ((args: string[], cwd: string) => runGit(args, cwd))

  const invalid = validateProjectName(rawName)
  if (invalid) return { ok: false, error: invalid }
  const name = rawName.trim()

  let parentIsFolder = false
  try { parentIsFolder = statSync(parent).isDirectory() } catch { /* handled below */ }
  if (!parentIsFolder) return { ok: false, error: 'That location no longer exists. Choose where to create the project again.' }

  const target = join(parent, name)
  if (existsSync(target)) {
    return {
      ok: false,
      error: `A folder named "${name}" already exists in that location. Choose another name, or use Open folder… to open it.`,
    }
  }

  try {
    mkdirSync(target) // not recursive: the parent was just checked, and a race must fail, not create a tree
  } catch (err) {
    return { ok: false, error: `Could not create the folder: ${err instanceof Error ? err.message : String(err)}` }
  }

  try {
    try {
      await git(['init', '-b', 'main'], target)
    } catch {
      // `--initial-branch` arrived in git 2.28; an older git still gets a working repository.
      await git(['init'], target)
    }
  } catch (err) {
    rmSync(target, { recursive: true, force: true }) // only ever the folder this call just created
    return {
      ok: false,
      error: `Could not start version tracking in the new folder: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return { ok: true, path: target }
}
