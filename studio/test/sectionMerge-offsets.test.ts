import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractUnits, readShapeFromBytes, writeShapeUpdates } from '../electron/main/sectionMerge'

// Regression test for a real, serious bug: document_shape_cli.py deliberately emits UTF-8
// BYTE offsets (needed for its own write round-trip), but JS strings index by UTF-16 code
// unit. Feeding a byte offset straight into `.slice()` silently misaligns as soon as a
// multi-byte character (an em dash, a curly quote — both routine in these templates) appears
// earlier in the document. Verified live: this ate the "##" off a heading, turning
// "## Overview" into " Overview". readShapeFromBytes/writeShapeUpdates must convert at the
// boundary so nothing downstream ever has to think about byte-vs-string-index again.

const PLUGIN_SCRIPTS = String.raw`C:\Users\kruz7\OneDrive\Documents\Code Repos\MCKRUZ\claude-code-sdlc\.claude\worktrees\plugin-frontend-design-9d0552\scripts`
const SHAPE_PATH = join(PLUGIN_SCRIPTS, '..', 'templates', 'phases', '01-requirements', 'requirements.shape.yaml')

describe('byte-offset / string-index conversion (real subprocess, real multi-byte content)', () => {
  it.skipIf(!existsSync(PLUGIN_SCRIPTS))(
    'a heading positioned after an em dash is extracted intact, not truncated',
    async () => {
      const text = [
        '# Requirements',
        '<!-- Phase 1 \u2014 Requirements | Required artifact -->', // em dash: 3 UTF-8 bytes, 1 JS char
        '',
        '## Overview',
        '',
        '**Project:** Acme Claims Portal',
        '**Version:** 1.0',
        '**Date:** 2026-09-23',
        '**Status:** Draft',
        '',
        'Requirements are testable statements.',
        '',
        '---',
        '',
        '## Functional Requirements',
        '',
        '### FR-001: Something',
        '',
        '**Priority:** P0',
        '**Source:** x',
        '**Rationale:** x',
        '',
        '**Requirement:**',
        '> The system SHALL do the thing.',
        '',
        '**Acceptance criteria:**',
        '- [ ] Given, when, then',
        '',
        '**Dependencies:** none',
        '',
      ].join('\n')

      const result = await readShapeFromBytes(PLUGIN_SCRIPTS, Buffer.from(text, 'utf-8'), SHAPE_PATH)
      expect(result.matched).toBe(true)

      const units = extractUnits(text, result)
      const overview = units.find((u) => u.key === 'Overview')
      expect(overview).toBeDefined()
      // The bug produced " Overview\n\n**Project:**..." — missing "## " entirely.
      expect(overview!.text.startsWith('## Overview')).toBe(true)
      expect(overview!.text).toContain('**Project:** Acme Claims Portal')

      // Every unit's own span must slice the ORIGINAL text to exactly its own captured text
      // — the real, general proof that offsets are self-consistent with plain JS slicing.
      for (const u of units) {
        if (!u.span) continue
        expect(text.slice(u.span[0], u.span[1])).toBe(u.text)
      }
    },
  )

  it.skipIf(!existsSync(PLUGIN_SCRIPTS))(
    'a write using a span computed after a multi-byte character lands on the correct text',
    async () => {
      const text = [
        '# Requirements',
        '<!-- Phase 1 \u2014 Requirements | Required artifact -->',
        '',
        '## Overview',
        '',
        '**Project:** Acme Claims Portal',
        '**Version:** 1.0',
        '**Date:** 2026-09-23',
        '**Status:** Draft',
        '',
        'Body text.',
        '',
        '## Functional Requirements',
        '',
        '### FR-001: Something',
        '',
        '**Priority:** P0',
        '**Source:** x',
        '**Rationale:** x',
        '',
        '**Requirement:**',
        '> The system SHALL do the thing.',
        '',
        '**Acceptance criteria:**',
        '- [ ] Given, when, then',
        '',
        '**Dependencies:** none',
        '',
      ].join('\n')

      const tmpDir = mkdtempSync(join(tmpdir(), 'offset-write-test-'))
      const docPath = join(tmpDir, 'requirements.md')
      writeFileSync(docPath, text, 'utf-8')

      try {
        const result = await readShapeFromBytes(PLUGIN_SCRIPTS, Buffer.from(text, 'utf-8'), SHAPE_PATH)
        const overview = result.blocks.find((b) => b.kind === 'section' && b.heading === 'Overview')
        expect(overview).toBeDefined()
        const statusField = overview!.fields!.Status
        expect(statusField?.value).toBe('Draft')

        await writeShapeUpdates(PLUGIN_SCRIPTS, docPath, [[statusField!.start, statusField!.end, 'Approved']])

        const { readFileSync } = await import('node:fs')
        const after = readFileSync(docPath, 'utf-8')
        expect(after).toContain('**Status:** Approved')
        expect(after).not.toContain('**Status:** Draft')
        // Nothing before the edited field should have moved.
        expect(after).toContain('## Overview')
        expect(after).toContain('**Project:** Acme Claims Portal')
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    },
  )
})
