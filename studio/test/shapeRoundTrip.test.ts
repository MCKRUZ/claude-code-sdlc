/** Spec 0010's most important acceptance check, driven through the real Studio code path:
 * every shaped template's real fixture is read and written back, and the file must come out
 * byte-for-byte identical.
 *
 * The plugin has its own round-trip test, but it exercises `document_shape.py` as a Python
 * library, where offsets never leave Python-string space. Studio's path is different and is
 * where the danger actually lives: the CLI emits UTF-8 BYTE offsets, Node slices UTF-16
 * STRING indices, and `readShapeFromBytes` / `writeShapeUpdates` convert between them. These
 * templates are full of em dashes and curly quotes, so the two genuinely diverge — a real bug
 * found this way during spec 0009 silently ate the `##` off a heading. A pure-Python test
 * cannot see that class of bug at all.
 *
 * Hence the deliberate shape of the check below: rather than writing zero updates (which is
 * identity regardless of whether the conversion is right), every field is written back with
 * its OWN current value. Both directions of the conversion must be exactly correct for the
 * file to survive unchanged.
 *
 * Skipped, not failed, when the plugin checkout isn't beside this repo — this suite must stay
 * runnable on a machine with only Studio cloned.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readShapeFromBytes, writeShapeUpdates, type ShapeBlock } from '../electron/main/sectionMerge'
import { requirePlugin } from './pluginRoot'

/** The plugin checkout to test against. `SDLC_PLUGIN_ROOT` wins, so this can be pointed at a
 * worktree — which is where plugin work in progress actually lives, and therefore the only
 * place the scripts this test drives exist before they reach the default branch. */
// Located once, in one place, and LOUD when it cannot be found — a run that skipped the
// integration tests used to report success, which is how a run that proved nothing came
// to look like a run that proved everything. See test/pluginRoot.ts.
const PLUGIN = requirePlugin(__dirname)

const PLUGIN_ROOT = PLUGIN.root
const SCRIPTS_DIR = PLUGIN.scriptsDir
const FIXTURES_DIR = PLUGIN_ROOT ? join(SCRIPTS_DIR, 'tests', 'fixtures', 'documents') : ''
const TEMPLATES_DIR = PLUGIN_ROOT ? join(PLUGIN_ROOT, 'templates') : ''

const available = PLUGIN.available && existsSync(FIXTURES_DIR) && existsSync(TEMPLATES_DIR)

/** Every `<id>.shape.yaml` under templates/, keyed by the template id its fixture is named
 * for — the same pairing the plugin's own round-trip test makes. */
function shapesByTemplateId(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) shapesByTemplateId(path, out)
    else if (entry.name.endsWith('.shape.yaml')) {
      const declared = /^template:\s*(.+)$/m.exec(readFileSync(path, 'utf-8'))
      out.set((declared?.[1] ?? entry.name.replace(/\.shape\.yaml$/, '')).trim(), path)
    }
  }
  return out
}

/** Every field span in the block model, as [start, end, currentText] — the rewrite-in-place
 * updates. Repeating instances included: that's where the numbered headings live. */
function fieldSpans(blocks: ShapeBlock[], text: string): Array<[number, number, string]> {
  const spans: Array<[number, number, string]> = []
  const collect = (fields: Record<string, { start: number; end: number } | null> | undefined) => {
    for (const field of Object.values(fields ?? {})) {
      if (field) spans.push([field.start, field.end, text.slice(field.start, field.end)])
    }
  }
  for (const block of blocks) {
    if (block.kind === 'section') collect(block.fields)
    else if (block.kind === 'repeating_section') for (const inst of block.instances ?? []) collect(inst.fields)
  }
  // The CLI applies updates against the original text, so overlapping or out-of-order spans
  // would be the test's own bug rather than the code's. Sorted and asserted disjoint below.
  return spans.sort((a, b) => a[0] - b[0])
}

describe.skipIf(!available)('every shaped template round-trips through Studio unchanged', () => {
  const pairs = available
    ? readdirSync(FIXTURES_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ id: f.replace(/\.md$/, ''), fixture: join(FIXTURES_DIR, f) }))
        .map((p) => ({ ...p, shape: shapesByTemplateId(TEMPLATES_DIR).get(p.id) }))
    : []

  it('finds fixtures to check', () => {
    expect(pairs.length).toBeGreaterThan(0)
  })

  for (const { id, fixture, shape } of pairs) {
    it(`${id}`, { timeout: 30_000 }, async () => {
      expect(shape, `no shape file for fixture ${id}.md`).toBeTruthy()
      const original = readFileSync(fixture)
      const read = await readShapeFromBytes(SCRIPTS_DIR, original, shape!)
      expect(read.matched, `${id} fell back to free text: ${read.warnings.join('; ')}`).toBe(true)

      const text = original.toString('utf-8')
      const updates = fieldSpans(read.blocks, text)
      expect(updates.length, `${id} exposed no editable fields`).toBeGreaterThan(0)
      for (let i = 1; i < updates.length; i++) {
        expect(updates[i][0], `${id}: overlapping spans`).toBeGreaterThanOrEqual(updates[i - 1][1])
      }

      const dir = mkdtempSync(join(tmpdir(), 'studio-roundtrip-'))
      try {
        const doc = join(dir, `${id}.md`)
        writeFileSync(doc, original)
        await writeShapeUpdates(SCRIPTS_DIR, doc, updates)
        expect(readFileSync(doc).equals(original)).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
