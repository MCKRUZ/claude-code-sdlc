// Per-section three-way merge (spec 0009) — the first section-level diff in this ecosystem
// (confirmed: the plugin has none). Built entirely on document_shape_cli.py's block model
// (spec 0007's section model, called as a subprocess) rather than re-parsing Markdown here —
// Studio never re-implements what the plugin already does.
//
// Split from sync.ts on purpose: everything below the subprocess boundary (extractUnits,
// threeWayMerge) is pure — same ancestor/local/remote text in, same result out, no git, no
// filesystem beyond the one subprocess call — so it can be unit-tested directly against
// synthetic block models, which is exactly what spec 0009's Checking Plan needs proven.
//
// Safety rule, stated once so every case below can be checked against it: a section key is
// ONLY silently resolved when its ancestor/local/remote values agree in one of three safe
// ways — remote matches the ancestor (nothing remote did conflicts, keep local, including
// local-only new content), local matches the ancestor (remote's edit applies cleanly,
// including brand-new content only remote added), or local and remote ended up identical.
// A genuine three-way disagreement — local changed it one way, remote changed or deleted it
// another way, and the two don't match — is the only case that becomes a clash. One
// deliberate asymmetry: if a side deletes a section the OTHER side never touched, that
// deletion is not propagated (the untouched side's content is left as-is rather than
// silently removed) — a real limitation, but one that fails toward keeping content rather
// than losing it, which is the direction spec 0009 asks for.

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPluginScript } from './project'
import type { ClashSection } from '../../shared/types'

// --- document_shape_cli.py subprocess boundary -------------------------------------------

interface ShapeField {
  value: string
  start: number
  end: number
}

interface ShapeBlock {
  kind: 'free_text' | 'section' | 'repeating_section'
  start: number
  end: number
  text?: string
  heading?: string
  fields?: Record<string, ShapeField | null>
  instances?: Array<{ number: number; heading_text: string; start: number; end: number; fields: Record<string, ShapeField | null> }>
}

export interface ShapeReadResult {
  matched: boolean
  warnings: string[]
  stamp: [string, string] | null
  blocks: ShapeBlock[]
}

const STAMP_RE = /<!--\s*template:\s*([a-z0-9][a-z0-9-]*)\s+v([0-9]+\.[0-9]+)\s*-->/
const TEMPLATE_ID_LINE_RE = /^template:\s*["']?([a-z0-9][a-z0-9-]*)["']?\s*$/m

function walkShapeFiles(dir: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) walkShapeFiles(full, out)
    else if (e.isFile() && e.name.endsWith('.shape.yaml')) out.push(full)
  }
}

/** The shape whose `template:` id matches this document's own stamp comment, or null when
 * the document carries no stamp (or no shape declares that id) — exactly document_shape.py's
 * own "unstamped documents are readable and writable as all free text" case, not a Studio
 * special case. */
export function findShapeForContent(pluginScriptsDir: string, text: string): string | null {
  const stampMatch = text.match(STAMP_RE)
  if (!stampMatch) return null
  const templateId = stampMatch[1]
  const templatesRoot = join(pluginScriptsDir, '..', 'templates')
  const shapePaths: string[] = []
  walkShapeFiles(templatesRoot, shapePaths)
  for (const shapePath of shapePaths) {
    const shapeText = readFileSync(shapePath, 'utf-8')
    const m = shapeText.match(TEMPLATE_ID_LINE_RE)
    if (m && m[1] === templateId) return shapePath
  }
  return null
}

/** The shape for a document at a known repo-relative path — tried FIRST by path convention
 * (`.sdlc/artifacts/<phase-dir>/<name>.md` mirrors `templates/phases/<phase-dir>/<name>.shape.yaml`
 * exactly, verified against the plugin's real template layout), falling back to the stamp
 * (findShapeForContent) for anything outside that convention (specs/**, etc.).
 *
 * This is the primary lookup Studio uses, in preference to the stamp alone: verified live
 * that NOTHING in the current plugin pipeline (init_project.py, new_spec.py, the authoring
 * agents) ever calls document_shape.py's own stamp_document() — no document created by a
 * real project carries a stamp today, only the library's own tests do. Path-based
 * resolution works regardless, because Studio always knows the exact path it's syncing;
 * the stamp fallback keeps this forward-compatible once stamping is wired in for real. */
export function findShapeForPath(pluginScriptsDir: string, relPath: string, text: string): string | null {
  const templatesRoot = join(pluginScriptsDir, '..', 'templates')
  const normalized = relPath.replace(/\\/g, '/')
  const m = normalized.match(/^\.sdlc\/artifacts\/([^/]+)\/(.+)\.md$/)
  if (m) {
    const [, phaseDir, basename] = m
    const candidate = join(templatesRoot, 'phases', phaseDir, `${basename}.shape.yaml`)
    if (existsSync(candidate)) return candidate
  }
  return findShapeForContent(pluginScriptsDir, text)
}

// document_shape_cli.py deliberately emits UTF-8 BYTE offsets (that's what its own --updates
// contract for `write` needs — see writeShapeUpdates below). But every consumer on this side
// (extractUnits, threeWayMerge) works with plain JS strings, which `.slice()` by UTF-16 code
// unit, not by byte. Any multi-byte UTF-8 character before a span (these templates are full
// of em dashes and curly quotes) throws a byte offset out of alignment with the matching
// string index — verified live: an em dash earlier in a real document caused a "## Overview"
// heading to be sliced as " Overview", silently eating two characters. Every offset in a
// ShapeReadResult is converted to a JS string index here, immediately on the way out of the
// subprocess boundary, so nothing downstream ever has to think about the distinction again.

function byteOffsetsToStringIndices(text: string, offsets: Iterable<number>): Map<number, number> {
  const buf = Buffer.from(text, 'utf-8')
  const unique = [...new Set(offsets)].sort((a, b) => a - b)
  const map = new Map<number, number>()
  for (const off of unique) {
    map.set(off, buf.subarray(0, off).toString('utf-8').length)
  }
  return map
}

function collectOffsets(blocks: ShapeBlock[], out: Set<number>): void {
  for (const block of blocks) {
    out.add(block.start)
    out.add(block.end)
    if (block.kind === 'section' && block.fields) {
      for (const f of Object.values(block.fields)) {
        if (f) { out.add(f.start); out.add(f.end) }
      }
    } else if (block.kind === 'repeating_section' && block.instances) {
      for (const inst of block.instances) {
        out.add(inst.start)
        out.add(inst.end)
        for (const f of Object.values(inst.fields)) {
          if (f) { out.add(f.start); out.add(f.end) }
        }
      }
    }
  }
}

function convertBlocksToStringIndices(text: string, blocks: ShapeBlock[]): ShapeBlock[] {
  const offsets = new Set<number>()
  collectOffsets(blocks, offsets)
  const map = byteOffsetsToStringIndices(text, offsets)
  const conv = (n: number) => map.get(n)!
  const convField = (f: ShapeField | null) => (f ? { ...f, start: conv(f.start), end: conv(f.end) } : f)

  return blocks.map((block) => {
    const b: ShapeBlock = { ...block, start: conv(block.start), end: conv(block.end) }
    if (b.kind === 'section' && b.fields) {
      b.fields = Object.fromEntries(Object.entries(b.fields).map(([k, f]) => [k, convField(f)]))
    } else if (b.kind === 'repeating_section' && b.instances) {
      b.instances = b.instances.map((inst) => ({
        ...inst,
        start: conv(inst.start),
        end: conv(inst.end),
        fields: Object.fromEntries(Object.entries(inst.fields).map(([k, f]) => [k, convField(f)])),
      }))
    }
    return b
  })
}

/** Reads `bytes` against `shapePath` via document_shape_cli.py — writes to a throwaway temp
 * file first since the CLI reads a real path, not stdin, then always cleans it up. Every
 * offset in the result is converted from the CLI's UTF-8 byte offsets to JS string indices
 * before returning (see the comment above) — callers never see a byte offset. */
export async function readShapeFromBytes(
  pluginScriptsDir: string,
  bytes: Buffer,
  shapePath: string,
): Promise<ShapeReadResult> {
  const tmpFile = join(tmpdir(), `studio-shape-${randomUUID()}.md`)
  writeFileSync(tmpFile, bytes)
  try {
    const entry = await runPluginScript(pluginScriptsDir, 'document_shape_cli.py', [
      'read', '--doc', tmpFile, '--shape', shapePath,
    ])
    if (!entry.ok) throw new Error(entry.stderr || 'document_shape_cli.py read failed')
    const result = JSON.parse(entry.stdout) as ShapeReadResult
    if (!result.matched) return result // the single free_text block spans [0, len) either way
    const text = bytes.toString('utf-8')
    return { ...result, blocks: convertBlocksToStringIndices(text, result.blocks) }
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile)
  }
}

/** Applies `updates` ([stringStart, stringEnd, newText] triples — JS string indices, the
 * same currency every ShapeReadResult already uses after readShapeFromBytes's conversion)
 * to the real file at `docPath` via document_shape_cli.py write — the only path anything in
 * this module writes a real document through. Converts back to UTF-8 byte offsets here,
 * against the file's OWN current on-disk content, immediately before the subprocess call —
 * the one place that boundary needs crossing again. */
export async function writeShapeUpdates(
  pluginScriptsDir: string,
  docPath: string,
  updates: Array<[number, number, string]>,
): Promise<void> {
  const currentText = readFileSync(docPath, 'utf-8')
  const byteUpdates: Array<[number, number, string]> = updates.map(([start, end, newText]) => [
    Buffer.byteLength(currentText.slice(0, start), 'utf-8'),
    Buffer.byteLength(currentText.slice(0, end), 'utf-8'),
    newText,
  ])

  const tmpUpdates = join(tmpdir(), `studio-updates-${randomUUID()}.json`)
  writeFileSync(tmpUpdates, JSON.stringify(byteUpdates))
  try {
    const entry = await runPluginScript(pluginScriptsDir, 'document_shape_cli.py', [
      'write', '--doc', docPath, '--updates', tmpUpdates,
    ])
    if (!entry.ok) throw new Error(entry.stderr || 'document_shape_cli.py write failed')
  } finally {
    if (existsSync(tmpUpdates)) unlinkSync(tmpUpdates)
  }
}

// --- pure merge logic ----------------------------------------------------------------------

export interface SectionUnit {
  key: string
  heading: string
  /** Byte span into the buffer this unit was extracted from — present for every unit except
   * a key that doesn't exist in that particular version (there's nothing to point at). */
  span?: [number, number]
  text: string
}

/** Every addressable unit of a document: each plain section, each repeating-block instance
 * (keyed `<heading>#<number>`), each gap between/around repeating instances (keyed
 * `<heading>__gap_<offset>`, since document_shape.py's own block model does not tile the
 * space between repeating instances individually — see its "left as free text implicitly"
 * comment), and all free text in the document combined into one `__free_text__` unit. The
 * free-text combination is coarse (a change anywhere in the document's free text clashes as
 * a whole) but safe — it can never silently lose a free-text edit, only ask about it. */
export function extractUnits(text: string, result: ShapeReadResult): SectionUnit[] {
  const units: SectionUnit[] = []
  const freeTextParts: string[] = []

  for (const block of result.blocks) {
    if (block.kind === 'free_text') {
      freeTextParts.push(text.slice(block.start, block.end))
    } else if (block.kind === 'section') {
      units.push({ key: block.heading!, heading: block.heading!, span: [block.start, block.end], text: text.slice(block.start, block.end) })
    } else if (block.kind === 'repeating_section') {
      const heading = block.heading!
      const instances = [...(block.instances ?? [])].sort((a, b) => a.start - b.start)
      let cursor = block.start
      for (const inst of instances) {
        if (inst.start > cursor) {
          units.push({ key: `${heading}__gap_${cursor}`, heading, span: [cursor, inst.start], text: text.slice(cursor, inst.start) })
        }
        units.push({ key: `${heading}#${inst.number}`, heading, span: [inst.start, inst.end], text: text.slice(inst.start, inst.end) })
        cursor = inst.end
      }
      if (cursor < block.end) {
        units.push({ key: `${heading}__gap_${cursor}`, heading, span: [cursor, block.end], text: text.slice(cursor, block.end) })
      }
    }
  }

  if (freeTextParts.length > 0) {
    units.push({ key: '__free_text__', heading: '(unstructured text)', text: freeTextParts.join('') })
  }

  return units
}

export interface MergeResult {
  /** key -> resolved text, for every key that was silently resolved (one side unchanged, or
   * both sides identical) — the caller applies these against the LOCAL document's own spans. */
  merged: Map<string, string>
  clashes: ClashSection[]
}

/** The whole safety rule lives here: a key resolves silently only when ancestor/local/remote
 * agree in one of the three safe ways; every other combination — including asymmetric
 * presence — becomes a clash. See this module's header comment for why that's the right
 * trade for spec 0009. */
export function threeWayMerge(
  ancestorUnits: SectionUnit[],
  localUnits: SectionUnit[],
  remoteUnits: SectionUnit[],
): MergeResult {
  const byKey = (units: SectionUnit[]) => new Map(units.map((u) => [u.key, u]))
  const aMap = byKey(ancestorUnits)
  const lMap = byKey(localUnits)
  const rMap = byKey(remoteUnits)

  const allKeys = new Set([...aMap.keys(), ...lMap.keys(), ...rMap.keys()])
  const merged = new Map<string, string>()
  const clashes: ClashSection[] = []

  for (const key of allKeys) {
    const a = aMap.get(key)?.text
    const l = lMap.get(key)?.text
    const r = rMap.get(key)?.text
    const heading = (lMap.get(key) ?? rMap.get(key) ?? aMap.get(key))?.heading ?? key

    if (r === a) {
      if (l !== undefined) merged.set(key, l) // local unchanged, or local-only new content — safe either way
      continue
    }
    if (l === a) {
      if (r !== undefined) merged.set(key, r) // remote changed, local didn't touch it
      continue
    }
    if (l === r) {
      if (l !== undefined) merged.set(key, l) // both changed to the exact same thing
      continue
    }
    clashes.push({ key, heading, localText: l ?? '', remoteText: r ?? '' })
  }

  return { merged, clashes }
}
