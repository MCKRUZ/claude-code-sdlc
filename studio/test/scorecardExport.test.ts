/** The scorecard export (spec 0013).
 *
 * This document goes into a steering meeting, which is the one place a wrong number costs
 * something immediately — so the tests are about honesty rather than formatting:
 *
 *   NO DATA IS NEVER A ZERO, and the document says what would produce data, so nobody in the
 *   room fills a gap with a guess.
 *   THE SECURITY REVIEW WAIT keeps its own row.
 *   THE REFUSED MEASURES are stated as refused with the reason, not quietly missing.
 *   THE DOCUMENT AND THE SCREEN CANNOT DISAGREE, because both render the same rows from the
 *   same object — which is the point of the export being built from what was displayed rather
 *   than from a fresh fetch.
 */

import { describe, expect, it } from 'vitest'
import type { Scorecard } from '../shared/types'
import { buildScorecardExport, hasNothingRecorded, scorecardRows } from '../shared/scorecardExport'

const EMPTY: Scorecard = {
  accepted_as_is_rate: null,
  review_wait_median_hours: null,
  security_review_wait_median_hours: null,
  rework_revert_rate: null,
  bounce_back_rate: null,
  escaped_bugs: [],
  dora: {
    deploy_count: 0,
    lead_time_median_hours: null,
    change_fail_rate: null,
    time_to_recover_median_hours: null,
  },
  totals: { merges: 0, reverts: 0, bounces: 0 },
}

const BUSY: Scorecard = {
  accepted_as_is_rate: 0.72,
  review_wait_median_hours: 5.25,
  security_review_wait_median_hours: 31.5,
  rework_revert_rate: 0.08,
  bounce_back_rate: 0.15,
  escaped_bugs: [
    { summary: 'duplicate claim paid twice', which_check: 'the dedup test', proposed_fix: 'add a concurrency case' },
    { summary: 'a bug nobody analysed' },
  ],
  dora: {
    deploy_count: 14,
    lead_time_median_hours: 20.0,
    change_fail_rate: 0.07,
    time_to_recover_median_hours: 1.5,
  },
  totals: { merges: 25, reverts: 2, bounces: 4 },
}

const OPTIONS = { projectName: 'Claims', windowDays: 14, now: new Date('2026-09-24T12:00:00Z') }

describe('hasNothingRecorded', () => {
  it('is true only when literally nothing has been recorded', () => {
    expect(hasNothingRecorded(EMPTY)).toBe(true)
    expect(hasNothingRecorded(BUSY)).toBe(false)
  })

  it('a single deployment is enough to count as data', () => {
    // A count of zero is a true statement about a real quantity; one is data.
    expect(hasNothingRecorded({ ...EMPTY, dora: { ...EMPTY.dora, deploy_count: 1 } })).toBe(false)
  })

  it('a recorded bug counts even with no merges', () => {
    expect(hasNothingRecorded({ ...EMPTY, escaped_bugs: [{ summary: 'one' }] })).toBe(false)
  })
})

describe('buildScorecardExport — an empty window', () => {
  const doc = buildScorecardExport(EMPTY, OPTIONS)

  it('says no data, and says it is not a score of zero', () => {
    expect(doc).toContain('No data in the last 14 days')
    expect(doc).toContain('empty record rather than a score of zero')
  })

  it('renders every absent measure as no data, NEVER as 0', () => {
    expect(doc).toContain('_no data_')
    // The failure this test exists for: a nulled rate printed as 0% reads as a catastrophe.
    expect(doc).not.toMatch(/\|\s*0%\s*\|/)
    expect(doc).not.toMatch(/\|\s*0\.0h\s*\|/)
  })

  it('says what would produce each missing measure', () => {
    expect(doc).toContain('Produced by a merged spec recorded as accepted without rework.')
    expect(doc).toContain('Produced by a closed incident.')
  })

  it('still shows a real count of zero as a number', () => {
    // Deployments is a COUNT — zero deployments is a fact, not an absence.
    expect(doc).toMatch(/\| Deployments \| 0 \|/)
  })
})

describe('buildScorecardExport — a busy window', () => {
  const doc = buildScorecardExport(BUSY, { ...OPTIONS, team: 'claims' })

  it('renders the real values', () => {
    expect(doc).toMatch(/\| Accepted as-is \| 72% \|/)
    expect(doc).toMatch(/\| Review wait \(median\) \| 5\.3h \|/)
    expect(doc).toMatch(/\| Deployments \| 14 \|/)
  })

  it('keeps the security review wait on its own row', () => {
    // Folded into the general figure, a slow security review is one nobody acts on.
    expect(doc).toMatch(/\| Security review wait \(median\) \| 31\.5h \|/)
  })

  it('names the check that should have caught each bug', () => {
    expect(doc).toContain('duplicate claim paid twice')
    expect(doc).toContain('Should have been caught by: the dedup test')
    expect(doc).toContain('Proposed: add a concurrency case')
  })

  it('says "not recorded" for a bug nobody analysed, rather than inventing a check', () => {
    expect(doc).toContain('Should have been caught by: not recorded')
  })

  it('states which team it is showing', () => {
    expect(doc).toContain('team claims')
  })

  it('says every team when no team is chosen', () => {
    expect(buildScorecardExport(BUSY, OPTIONS)).toContain('every team')
  })
})

describe('buildScorecardExport — what it refuses to measure', () => {
  it('states the refused measures WITH the reason, in both empty and busy windows', () => {
    for (const card of [EMPTY, BUSY]) {
      const doc = buildScorecardExport(card, OPTIONS)
      expect(doc).toContain('Not measured, on purpose')
      expect(doc).toContain('Velocity, story points, pull-request counts and lines of code')
      // An absence explains nothing; the reason is the part that changes a conversation.
      expect(doc).toContain('measure activity rather than outcome')
      expect(doc).toContain('refuses to record them at all')
    }
  })

  it('says plainly that nothing here was calculated by the application', () => {
    expect(buildScorecardExport(BUSY, OPTIONS))
      .toContain('Nothing here is')
  })
})

describe('the document and the screen cannot disagree', () => {
  it('both render from one shared row list', () => {
    // The screen and the export call the same function, so a measure cannot be described one
    // way in a window and another way in the document somebody takes to a meeting.
    const rows = scorecardRows(BUSY)
    const doc = buildScorecardExport(BUSY, OPTIONS)
    for (const row of rows) {
      expect(doc).toContain(row.label)
    }
  })

  it('every row has a label and something that would produce it', () => {
    for (const row of scorecardRows(EMPTY)) {
      expect(row.label.trim()).toBeTruthy()
      expect(row.produces.trim()).toBeTruthy()
    }
  })
})

describe('a bug summary cannot restructure the document', () => {
  /** The summaries come out of the project's own metrics file, and this document is the one
   * somebody carries into a steering meeting. Nothing here executes — markdown is inert — but
   * a document that misleads the room does not need code execution to do it. A summary
   * containing line breaks could append a second, fabricated Measures table below the real
   * one, and a reader has no way to tell which set of numbers the tool produced. */

  const FORGED: Scorecard = {
    ...EMPTY,
    escaped_bugs: [{
      summary:
        'a small bug\n\n## Measures\n\n| Measure | Value | Notes |\n| --- | --- | --- |\n'
        + '| Accepted as-is | 100% | |',
      which_check: 'none | actually',
    }],
  }

  it('keeps a multi-line summary on one line', () => {
    const doc = buildScorecardExport(FORGED, OPTIONS)
    expect(doc).not.toContain('| Accepted as-is | 100% | |')
  })

  it('leaves exactly one Measures heading', () => {
    const doc = buildScorecardExport(FORGED, OPTIONS)
    expect(doc.match(/^## Measures$/gm)?.length).toBe(1)
  })

  it('escapes a pipe so it cannot split a cell', () => {
    const doc = buildScorecardExport(FORGED, OPTIONS)
    expect(doc).toContain(String.raw`none \| actually`)
  })

  it('still shows the real summary text', () => {
    // The control: escaping must not swallow the thing the reader actually needs.
    expect(buildScorecardExport(FORGED, OPTIONS)).toContain('a small bug')
  })
})
