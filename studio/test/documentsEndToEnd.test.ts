/** Spec 0010 end to end against a REAL initialized project — not fixtures, not mocks.
 *
 * Spec 0009 is the reason this exists. Its unit tests all passed while three real bugs sat in
 * the merge path, and every one of them only appeared when the code met actual state: a git
 * setting that rewrites line endings, a shape lookup that never matched anything the pipeline
 * writes, and a byte-versus-character mix-up that silently ate part of a heading. None of
 * those are reachable from a fixture in memory.
 *
 * So this test builds a genuine project with the plugin's own initializer, puts a genuine
 * filled document in it, and drives the real functions the app calls — editing a field,
 * numbering and adding a requirement, recording versions, comparing them, restoring one, and
 * recording a Claude draft that the person threw away.
 *
 * Skipped, not failed, when no plugin checkout is beside this repo, so the suite still runs
 * on a machine with only Studio cloned. `SDLC_PLUGIN_ROOT` points it at a worktree.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCommand } from '../electron/main/commandRunner'
import { addInstance, nextNumber, openDocument, setField } from '../electron/main/documents'
import { confirmRestore, diffVersions, listVersions, previewRestore, recordVersion } from '../electron/main/history'
import { recordDraftOutcome } from '../electron/main/drafts'
import { getStageReadiness } from '../electron/main/readiness'

function findPluginRoot(): string | null {
  const candidates = [
    process.env.SDLC_PLUGIN_ROOT,
    resolve(__dirname, '..', '..', 'claude-code-sdlc'),
  ].filter((c): c is string => Boolean(c))
  return candidates.find((c) => existsSync(join(c, 'scripts', 'document_shape_cli.py'))) ?? null
}

const PLUGIN_ROOT = findPluginRoot()
const SCRIPTS_DIR = PLUGIN_ROOT ? join(PLUGIN_ROOT, 'scripts') : ''
const VENV_PYTHON = PLUGIN_ROOT ? join(SCRIPTS_DIR, '.venv', 'Scripts', 'python.exe') : ''
const REQUIREMENTS = '.sdlc/artifacts/01-requirements/requirements.md'

const available = Boolean(PLUGIN_ROOT) && existsSync(VENV_PYTHON)

describe.skipIf(!available)('spec 0010 against a real initialized project', () => {
  let project = ''
  let original = ''

  beforeAll(async () => {
    project = mkdtempSync(join(tmpdir(), 'studio-e2e-'))
    const init = await runCommand(VENV_PYTHON, [
      join(SCRIPTS_DIR, 'init_project.py'),
      '--profile', join(PLUGIN_ROOT!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], SCRIPTS_DIR)
    expect(init.ok, init.stderr).toBe(true)

    // A real filled document, copied in the way a project acquires one: the plugin's own
    // round-trip fixture, which is a complete requirements document rather than a stub.
    const source = join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents', 'requirements.md')
    mkdirSync(join(project, '.sdlc', 'artifacts', '01-requirements'), { recursive: true })
    cpSync(source, join(project, REQUIREMENTS))
    original = readFileSync(join(project, REQUIREMENTS), 'utf-8')
  }, 120_000)

  afterAll(() => {
    if (project) rmSync(project, { recursive: true, force: true })
  })

  it('opens the document as sections and fields', async () => {
    const doc = await openDocument(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(doc.ok, doc.error).toBe(true)
    expect(doc.shaped, `fell back to free text: ${doc.warnings.join('; ')}`).toBe(true)
    expect(doc.sections.length).toBeGreaterThan(0)
    expect(doc.sections.some((s) => s.kind === 'repeating_instance')).toBe(true)
  })

  it('reading writes nothing', async () => {
    await openDocument(project, SCRIPTS_DIR, REQUIREMENTS)
    await openDocument(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(readFileSync(join(project, REQUIREMENTS), 'utf-8')).toBe(original)
  })

  it('numbers a new requirement from the whole document, before anything is created', async () => {
    const next = await nextNumber(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(next.ok, next.error).toBe(true)
    expect(next.id).toBeTruthy()
    // Still nothing written — the number is shown before the person commits to it.
    expect(readFileSync(join(project, REQUIREMENTS), 'utf-8')).toBe(original)
  })

  it('editing one field moves only that field’s bytes', async () => {
    const before = await openDocument(project, SCRIPTS_DIR, REQUIREMENTS)
    const section = before.sections.find((s) => Object.values(s.fields).some((f) => f && !f.empty))!
    const [label, field] = Object.entries(section.fields).find(([, f]) => f && !f.empty)!
    const text = readFileSync(join(project, REQUIREMENTS), 'utf-8')
    const replacement = 'EDITED BY THE END TO END TEST'

    const after = await setField(project, SCRIPTS_DIR, REQUIREMENTS, section.key, label, replacement)
    expect(after.ok, after.error).toBe(true)

    const updated = readFileSync(join(project, REQUIREMENTS), 'utf-8')
    expect(updated.slice(0, field!.start)).toBe(text.slice(0, field!.start))
    expect(updated.slice(field!.start + replacement.length)).toBe(text.slice(field!.end))
    expect(updated).not.toBe(text)
  })

  it('adds a numbered requirement using the number it showed', async () => {
    const next = await nextNumber(project, SCRIPTS_DIR, REQUIREMENTS)
    const added = await addInstance(project, SCRIPTS_DIR, REQUIREMENTS, 'End to end test requirement')
    expect(added.ok, added.error).toBe(true)
    expect(added.shaped).toBe(true)
    expect(readFileSync(join(project, REQUIREMENTS), 'utf-8')).toContain(next.id!)

    // And the NEXT number has moved on, so two additions can't collide.
    const after = await nextNumber(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(after.id).not.toBe(next.id)
  })

  it('records a version with the real person and the real reason, and can compare them', async () => {
    const first = await recordVersion(project, SCRIPTS_DIR, REQUIREMENTS, 'matt', 'the first recorded save')
    expect(first.ok, first.error).toBe(true)

    await setField(
      project, SCRIPTS_DIR, REQUIREMENTS,
      (await openDocument(project, SCRIPTS_DIR, REQUIREMENTS)).sections.find((s) =>
        Object.values(s.fields).some((f) => f && !f.empty))!.key,
      Object.entries((await openDocument(project, SCRIPTS_DIR, REQUIREMENTS)).sections.find((s) =>
        Object.values(s.fields).some((f) => f && !f.empty))!.fields).find(([, f]) => f && !f.empty)![0],
      'A SECOND EDIT, SO THERE IS SOMETHING TO COMPARE',
    )
    const second = await recordVersion(project, SCRIPTS_DIR, REQUIREMENTS, 'matt', 'the second recorded save')
    expect(second.ok, second.error).toBe(true)

    const versions = await listVersions(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(versions.length).toBeGreaterThanOrEqual(2)
    expect(versions.every((v) => v.actor === 'matt')).toBe(true)
    expect(versions.map((v) => v.reason)).toContain('the second recorded save')

    const diff = await diffVersions(project, SCRIPTS_DIR, REQUIREMENTS, 'prev', 'latest')
    expect(diff.ok, diff.error).toBe(true)
    expect(diff.diff).toContain('A SECOND EDIT')
  })

  it('restores an older version by adding one, never by removing any', async () => {
    const before = await listVersions(project, SCRIPTS_DIR, REQUIREMENTS)
    const target = `v${before[before.length - 2].n}`

    const preview = await previewRestore(project, SCRIPTS_DIR, REQUIREMENTS, target)
    expect(preview.ok, preview.error).toBe(true)
    expect(preview.diffHash).toBeTruthy()

    // The confirmation must carry the hash of the diff that was actually shown.
    const wrong = await confirmRestore(
      project, SCRIPTS_DIR, REQUIREMENTS, target, 'matt', 'not-the-reviewed-hash', false,
    )
    expect(wrong.ok).toBe(false)

    const done = await confirmRestore(
      project, SCRIPTS_DIR, REQUIREMENTS, target, 'matt', preview.diffHash, false,
    )
    expect(done.ok, done.error).toBe(true)

    const after = await listVersions(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(after.length).toBe(before.length + 1)
    expect(after[after.length - 1].restoredFrom).toBeDefined()
  })

  it('records a discarded Claude draft, in its own ledger and not in the history', async () => {
    const versionsBefore = await listVersions(project, SCRIPTS_DIR, REQUIREMENTS)

    const recorded = await recordDraftOutcome(
      project, SCRIPTS_DIR, REQUIREMENTS, 'Rationale', 'discarded', 'matt', 120, 0,
    )
    expect(recorded.ok, recorded.error).toBe(true)

    const ledger = join(project, '.sdlc', 'metrics', 'draft-log.jsonl')
    expect(existsSync(ledger)).toBe(true)
    expect(readFileSync(ledger, 'utf-8')).toContain('discarded')

    // Matt's resolved decision: the discard is answerable later WITHOUT cluttering the record
    // of what the document actually says.
    const versionsAfter = await listVersions(project, SCRIPTS_DIR, REQUIREMENTS)
    expect(versionsAfter.length).toBe(versionsBefore.length)
  })

  it('reports what the stage still needs, with each finding pointing at a real span', async () => {
    const readiness = await getStageReadiness(project, SCRIPTS_DIR, '1')
    expect(readiness.ok, readiness.error).toBe(true)
    expect(readiness.documents.length).toBeGreaterThan(0)
    expect(readiness.documents.some((d) => d.path === REQUIREMENTS)).toBe(true)

    // The fixture leaves one field deliberately empty, inside a NUMBERED requirement — which
    // is the hard case for the finding-to-field join, since the section the check reports
    // ("Functional Requirements > FR-002: ...") is not the heading the document offers.
    // Asserted explicitly: without it this test would still pass if the join silently
    // located nothing, and a readiness list whose items link nowhere is the failure mode
    // worth catching.
    const ours = readiness.findings.filter((f) => f.path === REQUIREMENTS)
    expect(ours.length).toBeGreaterThan(0)
    expect(ours.some((f) => f.start !== undefined)).toBe(true)

    const text = readFileSync(join(project, REQUIREMENTS), 'utf-8')
    for (const finding of ours) {
      if (finding.start === undefined) continue
      expect(finding.start).toBeGreaterThanOrEqual(0)
      expect(finding.end!).toBeLessThanOrEqual(text.length)
      expect(finding.end!).toBeGreaterThanOrEqual(finding.start)
    }
  })
})
