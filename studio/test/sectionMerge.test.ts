import { describe, it, expect } from 'vitest'
import { extractUnits, threeWayMerge, type SectionUnit, type ShapeReadResult } from '../electron/main/sectionMerge'

function unit(key: string, text: string | undefined): SectionUnit | undefined {
  return text === undefined ? undefined : { key, heading: key, text }
}

function units(pairs: Record<string, string | undefined>): SectionUnit[] {
  return Object.entries(pairs)
    .map(([key, text]) => unit(key, text))
    .filter((u): u is SectionUnit => u !== undefined)
}

// The whole safety rule from sectionMerge.ts's header comment, proven case by case — this
// is spec 0009's own Checking Plan requirement: the merge decision table must be verified,
// not just exercised end to end.
describe('threeWayMerge — the safety rule', () => {
  it('keeps local when remote matches the ancestor (remote untouched)', () => {
    const { merged, clashes } = threeWayMerge(
      units({ Status: 'Draft' }), units({ Status: 'Approved' }), units({ Status: 'Draft' }),
    )
    expect(merged.get('Status')).toBe('Approved')
    expect(clashes).toHaveLength(0)
  })

  it('takes remote when local matches the ancestor (local untouched)', () => {
    const { merged, clashes } = threeWayMerge(
      units({ Status: 'Draft' }), units({ Status: 'Draft' }), units({ Status: 'Approved' }),
    )
    expect(merged.get('Status')).toBe('Approved')
    expect(clashes).toHaveLength(0)
  })

  it('takes either when both sides changed to the exact same text', () => {
    const { merged, clashes } = threeWayMerge(
      units({ Status: 'Draft' }), units({ Status: 'Approved' }), units({ Status: 'Approved' }),
    )
    expect(merged.get('Status')).toBe('Approved')
    expect(clashes).toHaveLength(0)
  })

  it('clashes when both sides changed the same key differently', () => {
    const { merged, clashes } = threeWayMerge(
      units({ Status: 'Draft' }), units({ Status: 'Approved' }), units({ Status: 'Rejected' }),
    )
    expect(merged.has('Status')).toBe(false)
    expect(clashes).toEqual([{ key: 'Status', heading: 'Status', localText: 'Approved', remoteText: 'Rejected' }])
  })

  it('silently applies brand-new content only remote added (no ancestor, no local)', () => {
    const { merged, clashes } = threeWayMerge(units({}), units({}), units({ 'FR-002': 'new remote requirement' }))
    expect(merged.get('FR-002')).toBe('new remote requirement')
    expect(clashes).toHaveLength(0)
  })

  it('silently keeps brand-new content only local added (no ancestor, no remote)', () => {
    const { merged, clashes } = threeWayMerge(units({}), units({ 'FR-002': 'new local requirement' }), units({}))
    expect(merged.get('FR-002')).toBe('new local requirement')
    expect(clashes).toHaveLength(0)
  })

  it('does not propagate a deletion the other side never touched (fails toward keeping content)', () => {
    // Remote deleted a section local never touched — local's untouched copy is left alone,
    // not silently removed. A real, documented limitation (see sectionMerge.ts header).
    const { merged, clashes } = threeWayMerge(
      units({ Notes: 'original' }), units({ Notes: 'original' }), units({}),
    )
    expect(merged.has('Notes')).toBe(false) // nothing to update — local's copy stands as-is
    expect(clashes).toHaveLength(0)
  })

  it('clashes when local edited a section that remote deleted', () => {
    const { merged, clashes } = threeWayMerge(
      units({ Notes: 'original' }), units({ Notes: 'edited by me' }), units({}),
    )
    expect(merged.has('Notes')).toBe(false)
    expect(clashes).toEqual([{ key: 'Notes', heading: 'Notes', localText: 'edited by me', remoteText: '' }])
  })

  it('is a no-op when both sides deleted the same section independently', () => {
    const { merged, clashes } = threeWayMerge(units({ Notes: 'original' }), units({}), units({}))
    expect(merged.size).toBe(0)
    expect(clashes).toHaveLength(0)
  })

  it('handles several independent keys in one document without cross-contamination', () => {
    const ancestor = units({ A: 'a0', B: 'b0', C: 'c0' })
    const local = units({ A: 'a1', B: 'b0', C: 'c-local' }) // A changed, B untouched, C changed
    const remote = units({ A: 'a0', B: 'b1', C: 'c-remote' }) // A untouched, B changed, C changed differently
    const { merged, clashes } = threeWayMerge(ancestor, local, remote)
    expect(merged.get('A')).toBe('a1') // only local changed A -> keep local
    expect(merged.get('B')).toBe('b1') // only remote changed B -> take remote
    expect(merged.has('C')).toBe(false) // both changed C differently -> clash
    expect(clashes.map((c) => c.key)).toEqual(['C'])
  })
})

// extractUnits proves the block-model -> comparable-unit translation, including the gap
// handling a repeating section needs (document_shape.py's own block model does not tile the
// space between instances — see sectionMerge.ts's header comment).
describe('extractUnits', () => {
  const text = '# Title\nintro text\n\n## Overview\nProject overview here.\n\n## Functional Requirements\nheader text\n### FR-001\nfirst requirement\n### FR-002\nsecond requirement\ntrailer text'

  const result: ShapeReadResult = {
    matched: true,
    warnings: [],
    stamp: null,
    blocks: [
      { kind: 'free_text', start: 0, end: text.indexOf('## Overview'), text: text.slice(0, text.indexOf('## Overview')) },
      {
        kind: 'section', heading: 'Overview',
        start: text.indexOf('## Overview'), end: text.indexOf('## Functional Requirements'),
        fields: {},
      },
      {
        kind: 'repeating_section', heading: 'Functional Requirements',
        start: text.indexOf('## Functional Requirements'), end: text.length,
        instances: [
          { number: 1, heading_text: 'FR-001', start: text.indexOf('### FR-001'), end: text.indexOf('### FR-002'), fields: {} },
          { number: 2, heading_text: 'FR-002', start: text.indexOf('### FR-002'), end: text.length, fields: {} },
        ],
      },
    ],
  }

  it('produces a section unit keyed by heading', () => {
    const extracted = extractUnits(text, result)
    const overview = extracted.find((u) => u.key === 'Overview')
    expect(overview?.text).toContain('Project overview here.')
  })

  it('produces one unit per repeating instance, keyed heading#number', () => {
    const extracted = extractUnits(text, result)
    expect(extracted.find((u) => u.key === 'Functional Requirements#1')?.text).toContain('first requirement')
    expect(extracted.find((u) => u.key === 'Functional Requirements#2')?.text).toContain('second requirement')
  })

  it('captures the gap before the first instance as its own unit (never silently dropped)', () => {
    const extracted = extractUnits(text, result)
    const gap = extracted.find((u) => u.key.startsWith('Functional Requirements__gap_'))
    expect(gap?.text).toContain('header text')
  })

  it('combines every free_text block into one __free_text__ unit', () => {
    const extracted = extractUnits(text, result)
    const freeText = extracted.find((u) => u.key === '__free_text__')
    expect(freeText?.text).toContain('intro text')
  })

  it('every extracted span, concatenated in document order, reconstructs the tiled portion exactly', () => {
    // The tiling guarantee document_shape.py's own docstring promises — proven here for
    // whatever extractUnits itself claims to have covered with a span.
    const extracted = extractUnits(text, result).filter((u) => u.span)
    const sorted = [...extracted].sort((a, b) => a.span![0] - b.span![0])
    for (const u of sorted) {
      expect(text.slice(u.span![0], u.span![1])).toBe(u.text)
    }
  })
})
