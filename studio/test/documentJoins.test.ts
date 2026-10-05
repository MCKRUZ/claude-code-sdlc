import { describe, expect, it } from 'vitest'
import { joinVersionsWithReasons, type RawChange, type RawVersion } from '../electron/main/history'
import { matchesSection } from '../electron/main/readiness'

// Both of these are joins between two lists the plugin returns separately. A join that is
// quietly off by one produces output that looks entirely plausible and is completely wrong —
// every version attributed to the wrong reason, every finding linked to the wrong field — so
// they are pinned here rather than left to an integration run to notice.

function version(over: Partial<RawVersion> = {}): RawVersion {
  return { n: 1, hash: 'sha256:aaaa', event: 'revised', ts: '2026-09-24T10:00:00Z', actor: 'matt', present: true, ...over }
}

describe('joinVersionsWithReasons', () => {
  it('pairs each version with the reason recorded alongside it', () => {
    const versions = [version({ n: 1 }), version({ n: 2 })]
    const changes: RawChange[] = [{ reason: 'first' }, { reason: 'second' }]
    const joined = joinVersionsWithReasons(versions, changes)
    expect(joined.map((v) => v.reason)).toEqual(['first', 'second'])
  })

  it('shifts by one when the first version is a synthesized baseline', () => {
    // A baseline has no ledger row of its own, so the first REAL reason belongs to v2.
    const versions = [version({ n: 1, event: 'baseline', actor: '', ts: '' }), version({ n: 2 })]
    const changes: RawChange[] = [{ reason: 'the only recorded change' }]
    const joined = joinVersionsWithReasons(versions, changes)
    expect(joined[0].reason).toBe('') // the baseline has no why, and must not borrow one
    expect(joined[1].reason).toBe('the only recorded change')
  })

  it('leaves the reason empty rather than guessing when history is missing', () => {
    const joined = joinVersionsWithReasons([version()], [])
    expect(joined[0].reason).toBe('')
    expect(joined[0].actor).toBe('matt') // who is still known; only why is absent
  })

  it('carries who, when and whether the content is retrievable', () => {
    const joined = joinVersionsWithReasons([version({ present: false })], [{ reason: 'x' }])
    expect(joined[0].actor).toBe('matt')
    expect(joined[0].when).toBe('2026-09-24T10:00:00Z')
    expect(joined[0].present).toBe(false)
  })

  it('preserves a restored-from marker', () => {
    const joined = joinVersionsWithReasons([version({ restored_from: 1 })], [{ reason: 'undo' }])
    expect(joined[0].restoredFrom).toBe(1)
  })

  it('omits restoredFrom entirely for an ordinary version', () => {
    expect(joinVersionsWithReasons([version()], [{}])[0]).not.toHaveProperty('restoredFrom')
  })

  it('trims whitespace around a reason', () => {
    expect(joinVersionsWithReasons([version()], [{ reason: '  spaced  ' }])[0].reason).toBe('spaced')
  })

  it('is empty for a document with no versions', () => {
    expect(joinVersionsWithReasons([], [{ reason: 'orphan' }])).toEqual([])
  })
})

describe('matchesSection', () => {
  it('matches a plain section by its heading', () => {
    expect(matchesSection('Overview', 'Overview', 'Overview')).toBe(true)
  })

  it('matches a repeating instance by the trailing part the plugin reports', () => {
    // The plugin reports "<section heading> > <instance heading>"; Studio keys the instance
    // as "Functional Requirements#2" but displays the instance's own heading.
    expect(matchesSection(
      'Functional Requirements#2',
      'FR-002: Persist the first submission',
      'Functional Requirements > FR-002: Persist the first submission',
    )).toBe(true)
  })

  it('does not match a different instance of the same section', () => {
    expect(matchesSection(
      'Functional Requirements#1',
      'FR-001: Reject duplicates',
      'Functional Requirements > FR-002: Persist the first submission',
    )).toBe(false)
  })

  it('does not match an unrelated section', () => {
    expect(matchesSection('Overview', 'Overview', 'Prioritization Rationale')).toBe(false)
  })

  it('tolerates the spacing the plugin puts around its separator', () => {
    expect(matchesSection('X#1', 'FR-001', 'X >  FR-001 ')).toBe(true)
  })
})
