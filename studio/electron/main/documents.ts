// Reading and editing a project's documents (spec 0010).
//
// Every read and every write goes through the plugin's shape library, via the
// document_shape_cli.py wrapper — this file never parses or writes Markdown itself. That is
// the whole reason the round-trip guarantee holds: nothing here regenerates a document, it
// only replaces the exact spans the shape library identified.
//
// Reading is strictly read-only. Opening, scrolling and expanding a document writes nothing —
// the acceptance check says so explicitly, and it is easy to violate by accident (a "mark as
// seen" side effect on open would do it), so marking a document seen is a separate, explicit
// call the UI makes when the person dismisses the changes banner.

import { existsSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { runPluginScript } from './project'
import {
  findShapeForPath, readShapeFromBytes, writeShapeUpdates,
  type ShapeField, type ShapeReadResult,
} from './sectionMerge'
import { runGitTolerant } from './git'
import type {
  DocumentChange, DocumentField, DocumentSection, OpenDocumentResult,
} from '../../shared/types'

function docPath(projectPath: string, relPath: string): string {
  return join(projectPath, relPath)
}

function toRelPath(projectPath: string, fullPath: string): string {
  return relative(projectPath, fullPath).split(sep).join('/')
}

/** The shape's own field metadata — type, guidance, enum values — which the block model does
 * not carry but a form needs in order to render anything useful. */
interface ShapeFieldMeta {
  label: string
  type?: string
  required?: boolean
  anchor?: string
  guidance?: string
  enum_values?: string[]
}

function shapeFieldMeta(shapePath: string | null): Map<string, ShapeFieldMeta> {
  const out = new Map<string, ShapeFieldMeta>()
  if (!shapePath || !existsSync(shapePath)) return out
  // The shape is small, flat YAML and the only thing needed from it here is per-label
  // metadata, so it is read with a narrow line scan rather than by adding a YAML parser
  // dependency to an app that deliberately has no runtime dependencies at all.
  let current: Partial<ShapeFieldMeta> = {}
  const flush = () => {
    if (current.label) out.set(current.label, current as ShapeFieldMeta)
    current = {}
  }
  for (const raw of readFileSync(shapePath, 'utf-8').split(/\r?\n/)) {
    const label = raw.match(/^\s*-\s+label:\s*(.+?)\s*$/)
    if (label) {
      flush()
      current = { label: stripQuotes(label[1]) }
      continue
    }
    if (!current.label) continue
    const kv = raw.match(/^\s+(type|required|anchor|guidance|enum_values):\s*(.+?)\s*$/)
    if (!kv) continue
    const [, key, value] = kv
    if (key === 'required') current.required = value.trim() === 'true'
    else if (key === 'enum_values') {
      current.enum_values = value.replace(/^\[|\]$/g, '').split(',').map((v) => stripQuotes(v.trim())).filter(Boolean)
    } else {
      ;(current as Record<string, unknown>)[key] = stripQuotes(value)
    }
  }
  flush()
  return out
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '')
}

function shapeDescription(shapePath: string | null): string | undefined {
  if (!shapePath || !existsSync(shapePath)) return undefined
  const m = readFileSync(shapePath, 'utf-8').match(/^description:\s*(.+?)\s*$/m)
  return m ? stripQuotes(m[1]) : undefined
}

function buildField(label: string, raw: ShapeField | null, meta: Map<string, ShapeFieldMeta>): DocumentField | null {
  if (!raw) return null
  const m = meta.get(label)
  return {
    label,
    value: raw.value,
    start: raw.start,
    end: raw.end,
    type: m?.type ?? 'text',
    required: raw.required,
    anchor: raw.anchor,
    empty: raw.empty,
    guidance: m?.guidance,
    enumValues: m?.enum_values,
  }
}

function buildFields(
  fields: Record<string, ShapeField | null> | undefined,
  meta: Map<string, ShapeFieldMeta>,
): Record<string, DocumentField | null> {
  const out: Record<string, DocumentField | null> = {}
  for (const [label, raw] of Object.entries(fields ?? {})) {
    out[label] = buildField(label, raw, meta)
  }
  return out
}

/** The block model turned into the flat, addressable list a UI renders. Free text keeps its
 * place in document order rather than being collected at the end — it is shown where the
 * person actually wrote it. */
function toSections(text: string, result: ShapeReadResult, meta: Map<string, ShapeFieldMeta>): DocumentSection[] {
  const sections: DocumentSection[] = []

  for (const block of result.blocks) {
    if (block.kind === 'free_text') {
      const body = text.slice(block.start, block.end)
      if (body.trim() === '') continue // pure spacing between sections is not worth showing
      sections.push({
        kind: 'free_text',
        key: `free_text@${block.start}`,
        heading: '',
        start: block.start,
        end: block.end,
        text: body,
        fields: {},
      })
    } else if (block.kind === 'section') {
      sections.push({
        kind: 'section',
        key: block.heading!,
        heading: block.heading!,
        start: block.start,
        end: block.end,
        text: text.slice(block.start, block.end),
        fields: buildFields(block.fields, meta),
      })
    } else if (block.kind === 'repeating_section') {
      for (const inst of block.instances ?? []) {
        sections.push({
          kind: 'repeating_instance',
          key: `${block.heading}#${inst.number}`,
          heading: inst.heading_text,
          start: inst.start,
          end: inst.end,
          text: text.slice(inst.start, inst.end),
          fields: buildFields(inst.fields, meta),
          number: inst.number,
        })
      }
    }
  }

  return sections.sort((a, b) => a.start - b.start)
}

export async function openDocument(
  projectPath: string,
  pluginScriptsDir: string,
  relPath: string,
): Promise<OpenDocumentResult> {
  const full = docPath(projectPath, relPath)
  if (!existsSync(full)) {
    return { ok: false, path: relPath, shaped: false, warnings: [], sections: [], error: `${relPath} does not exist` }
  }

  const bytes = readFileSync(full)
  const text = bytes.toString('utf-8')
  const shapePath = findShapeForPath(pluginScriptsDir, relPath, text)
  const description = shapeDescription(shapePath)

  if (!shapePath) {
    // No shape — the whole document is free text. Readable, not field-editable. This is the
    // shape library's own documented behaviour, not a Studio limitation.
    return {
      ok: true, path: relPath, shaped: false, description,
      warnings: ['This document has no shape, so it is shown as text.'],
      sections: [{ kind: 'free_text', key: 'free_text@0', heading: '', start: 0, end: text.length, text, fields: {} }],
    }
  }

  let result: ShapeReadResult
  try {
    result = await readShapeFromBytes(pluginScriptsDir, bytes, shapePath)
  } catch (err) {
    return {
      ok: false, path: relPath, shaped: false, warnings: [], sections: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const meta = shapeFieldMeta(shapePath)
  return {
    ok: true,
    path: relPath,
    shaped: result.matched,
    description,
    warnings: result.warnings,
    sections: toSections(text, result, meta),
  }
}

/** Writes ONE field, through the shape library, and returns the re-read document so the caller
 * never works from stale spans — every edit shifts the offsets of everything after it. */
export async function setField(
  projectPath: string,
  pluginScriptsDir: string,
  relPath: string,
  sectionKey: string,
  label: string,
  value: string,
): Promise<OpenDocumentResult> {
  const current = await openDocument(projectPath, pluginScriptsDir, relPath)
  if (!current.ok) return current
  if (!current.shaped) {
    return { ...current, ok: false, error: 'This document has no usable shape, so individual fields cannot be edited.' }
  }

  const section = current.sections.find((s) => s.key === sectionKey)
  if (!section) {
    return { ...current, ok: false, error: `Section '${sectionKey}' is not in this document` }
  }
  const field = section.fields[label]
  if (!field) {
    return {
      ...current, ok: false,
      error: `Field '${label}' is not present in '${sectionKey}' — the shape declares it, but this document does not contain it.`,
    }
  }
  if (field.value === value) return current // no-op, so nothing is written at all

  try {
    await writeShapeUpdates(pluginScriptsDir, docPath(projectPath, relPath), [[field.start, field.end, value]])
  } catch (err) {
    return { ...current, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  return openDocument(projectPath, pluginScriptsDir, relPath)
}

export async function nextNumber(
  projectPath: string,
  pluginScriptsDir: string,
  relPath: string,
): Promise<{ ok: boolean; id?: string; number?: number; error?: string }> {
  const full = docPath(projectPath, relPath)
  if (!existsSync(full)) return { ok: false, error: `${relPath} does not exist` }
  const shapePath = findShapeForPath(pluginScriptsDir, relPath, readFileSync(full, 'utf-8'))
  if (!shapePath) return { ok: false, error: 'This document has no shape, so it has no numbered sections.' }

  const entry = await runPluginScript(pluginScriptsDir, 'document_shape_cli.py', [
    'next-number', '--doc', full, '--shape', shapePath,
  ])
  if (!entry.ok) return { ok: false, error: entry.stderr || 'next-number failed' }
  try {
    const parsed = JSON.parse(entry.stdout)
    return { ok: true, id: parsed.id, number: parsed.number }
  } catch {
    return { ok: false, error: 'next-number returned unreadable output' }
  }
}

export async function addInstance(
  projectPath: string,
  pluginScriptsDir: string,
  relPath: string,
  title: string,
): Promise<OpenDocumentResult> {
  const full = docPath(projectPath, relPath)
  if (!existsSync(full)) {
    return { ok: false, path: relPath, shaped: false, warnings: [], sections: [], error: `${relPath} does not exist` }
  }
  const shapePath = findShapeForPath(pluginScriptsDir, relPath, readFileSync(full, 'utf-8'))
  if (!shapePath) {
    return {
      ok: false, path: relPath, shaped: false, warnings: [], sections: [],
      error: 'This document has no shape, so numbered sections cannot be added.',
    }
  }

  const entry = await runPluginScript(pluginScriptsDir, 'document_shape_cli.py', [
    'add-instance', '--doc', full, '--shape', shapePath, '--title', title,
  ])
  if (!entry.ok) {
    return {
      ok: false, path: relPath, shaped: false, warnings: [], sections: [],
      error: entry.stderr || 'add-instance failed',
    }
  }
  return openDocument(projectPath, pluginScriptsDir, relPath)
}

/** Who changed this document since `sinceCommit`, and why — author, date and the commit
 * message. An unknown or missing `sinceCommit` means "everything on this branch", which is
 * the honest answer the first time a person opens a document. */
export async function getDocumentChanges(
  projectPath: string,
  relPath: string,
  sinceCommit: string | null,
  branch: string,
): Promise<DocumentChange[]> {
  // Prefer what the remote has, since that is what other people actually pushed — but fall
  // back to local history, because a project with no remote configured (or one not yet
  // fetched) still has a real history worth showing, and returning nothing would read as
  // "nobody has touched this" when the truth is "we couldn't see the remote".
  const tips = [`origin/${branch}`, 'HEAD']
  let entry = null
  for (const tip of tips) {
    const range = sinceCommit ? `${sinceCommit}..${tip}` : tip
    const attempt = await runGitTolerant(
      ['log', range, '--format=%an%x00%ad%x00%s', '--date=short', '--', relPath],
      projectPath,
    )
    if (attempt.ok) {
      entry = attempt
      break
    }
  }
  if (!entry) return []
  return entry.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [author, when, reason] = line.split('\0')
      return { author: author || 'unknown', when: when || '', reason: reason || '' }
    })
}

export { toRelPath }
