/** Spec 0029's registry button when the script does not answer well: a missing script, a refusal, output
 * that is not the expected document. Each is ONE plain line and zeros, never a traceback or a half-result.
 * The plugin is replaced by canned answers here; the real script's own refusal is in writeRegistry.test.ts. */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleEntry } from '../shared/types'

const answers: { next: Partial<ConsoleEntry> } = { next: {} }

vi.mock('../electron/main/project', () => ({
  hasSdlcProject: (p: string) => p.includes('studio-registry-'),
  runPluginScript: async () => ({
    id: '1', command: 'python', args: [], cwd: '', startedAt: '', durationMs: 1, exitCode: 0, ok: true, stdout: '', stderr: '', ...answers.next,
  }),
}))

import { writeRegistry } from '../electron/main/batchRegistry'

const ZEROS = {
  documents: 0, summarised: 0, missingSummaries: [], indexTokens: 0, indexBudget: 0, indexWithinBudget: false,
  trimmed: [], registryCreated: false, warnings: [],
}

describe('writeRegistry when the script does not give a usable answer', () => {
  let project = ''
  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'studio-registry-'))
    mkdirSync(join(project, '.sdlc'))
    writeFileSync(join(project, '.sdlc', 'state.yaml'), 'x: 1\n')
  })
  afterEach(() => rmSync(project, { recursive: true, force: true }))

  const run = (next: Partial<ConsoleEntry>) => {
    answers.next = next
    return writeRegistry(project, 'C:/plugin/scripts')
  }

  it("uses the script's own Error line when it refuses (exit 1)", async () => {
    expect(await run({ exitCode: 1, ok: false, stderr: 'Error: no catalog to build a registry from; run intake first\n' }))
      .toEqual({ ok: false, error: 'no catalog to build a registry from; run intake first', ...ZEROS })
  })

  it('says one generic line, not a traceback, when the script is missing or crashes', async () => {
    const traceback = 'Traceback (most recent call last):\n  File "x.py", line 1\nFileNotFoundError: no such file\n'
    expect(await run({ exitCode: 2, ok: false, stderr: traceback })).toEqual({ ok: false, error: 'The registry could not be written.', ...ZEROS })
    expect(await run({ exitCode: null, ok: false, stderr: 'spawn ENOENT' })).toEqual({ ok: false, error: 'The registry could not be written.', ...ZEROS })
  })

  it.each([
    ['output that is not JSON', 'Registry written.'],
    ['a JSON list', '[1,2]'],
    ['an object without the counts', '{"registry":"x","index":"y"}'],
    ['counts of the wrong type', '{"documents":"3","summarised":1,"index_tokens":1,"index_budget":5000,"index_within_budget":true,"registry_created":true}'],
    ['nothing at all', ''],
  ])('says the result could not be read for %s', async (_name, stdout) => {
    expect(await run({ stdout })).toEqual({ ok: false, error: 'The registry result could not be read.', ...ZEROS })
  })

  it('reads a complete answer, ignoring a field of the wrong type it does not need', async () => {
    const stdout = JSON.stringify({
      registry: 'r.md', index: 'i.md', documents: 3, summarised: 2, missing_summaries: ['DOC-003', 7], index_tokens: 90,
      index_budget: 5000, index_within_budget: false, trimmed: ['DOC-001'], registry_created: true, warnings: ['careful'],
    })
    expect(await run({ stdout })).toEqual({
      ok: true, registry: 'r.md', index: 'i.md', documents: 3, summarised: 2, missingSummaries: ['DOC-003'], indexTokens: 90,
      indexBudget: 5000, indexWithinBudget: false, trimmed: ['DOC-001'], registryCreated: true, warnings: ['careful'],
    })
  })
})
