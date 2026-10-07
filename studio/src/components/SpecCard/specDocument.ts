// What the spec card reads from the DOCUMENT itself (togo-command-center.md §3.3): scope in / out,
// `harness_context` and the `**Why this tier:**` notes — no JSON row carries them, so they come
// from `openDocument`'s sections by HEADING lookup, text verbatim. Pure: nothing here judges the
// text; a section that is not there reads as absent and the card says so.
import type { DocumentSection } from '../../../shared/types'

export interface ScopeText {
  /** The `## Scope` section's text (or its "In" child), verbatim; null when the document has none. */
  scopeIn: string | null
  /** A "Scope Out" / "Out of scope" section's text, verbatim; null when absent. */
  scopeOut: string | null
}

const IN_RE = /^scope(\s+in|\s*[-–—:]\s*in)?$|^in scope$/i
const OUT_RE = /^scope\s*(out|[-–—:]\s*out)$|^out of scope$|^not in scope$/i

export function scopeSections(sections: readonly DocumentSection[]): ScopeText {
  const byHeading = (re: RegExp) => sections.find((s) => re.test(s.heading.trim()))
  const scope = byHeading(IN_RE)
  const out = byHeading(OUT_RE)
  return {
    scopeIn: scope ? bodyOf(scope) : null,
    scopeOut: out ? bodyOf(out) : null,
  }
}

/** A section's text without its own heading line and without the template's SCAFFOLDING: its
 * HTML comments (`<!-- What the change must not touch … -->` is guidance to the author, not the
 * spec's scope — v13: the card showed it as the "In" text) and its empty list markers (a `- `
 * with nothing after it is the template's stand-in bullet — v14: the card drew a lone "-"). A
 * body left with nothing but sub-headings (`### In scope` over that empty bullet) reads as `''`
 * too: the section exists, says nothing, and the card says "no data" — the DoR already names
 * the gap. Everything else is the document's own markdown, kept verbatim for the renderer. */
function bodyOf(section: DocumentSection): string {
  const lines = stripScaffold(section.text.replace(/\r\n/g, '\n')).split('\n')
  if (lines[0]?.trim().startsWith('#')) lines.shift()
  const body = lines.join('\n').trim()
  return headingsOnly(body) ? '' : body
}

/** `<!-- … -->` removed, across lines; the text between comments is kept byte-for-byte. */
export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

/** A list marker with nothing after it — `-`, `*`, `+`, `1.` alone on its line — is the
 * template's unfilled bullet, not a list; the line is dropped and every other line is kept. */
export function stripEmptyListMarkers(text: string): string {
  return text.split('\n').filter((line) => !/^\s*(?:[-*+]|\d+[.)])\s*$/.test(line)).join('\n')
}

/** Both scaffold rules, in the order the template lays them down (a comment may hold a dash). */
export function stripScaffold(text: string): string {
  return stripEmptyListMarkers(stripHtmlComments(text))
}

/** True when the body has lines and every one of them is a markdown heading — titles over nothing. */
export function headingsOnly(body: string): boolean {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  return lines.length > 0 && lines.every((l) => /^#{1,6}\s/.test(l))
}

/** `harness_context` — the ONE reused pattern. A section or field whose heading / label names it;
 * null when the document has neither. */
export function harnessContext(sections: readonly DocumentSection[]): string | null {
  for (const s of sections) {
    if (/harness[\s_-]?context/i.test(s.heading)) return bodyOf(s) || null
    for (const field of Object.values(s.fields)) {
      if (field && /harness[\s_-]?context/i.test(field.label)) return field.value.trim() || null
    }
  }
  return null
}

/** Every `**Why this tier:**` note in the document, the words after the marker on that line. A
 * marker with nothing after it (the template's own line) is not a note — so the eyebrow appears
 * only when there is something to read under it. */
export function whyTierNotes(sections: readonly DocumentSection[]): string[] {
  const notes: string[] = []
  for (const s of sections) {
    for (const line of s.text.replace(/\r\n/g, '\n').split('\n')) {
      const m = line.match(/\*\*Why this tier:\*\*\s*(.*)$/)
      const note = m?.[1].trim() ?? ''
      if (note.length > 0) notes.push(note)
    }
  }
  return notes
}
