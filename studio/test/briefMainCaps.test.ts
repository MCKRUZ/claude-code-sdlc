/** A brief's claims and attendees travel on the command line, so there are caps (spec 0032) — and the
 * main process refuses past them with one line, before any process starts, rather than letting the
 * operating system's command-line limit turn it into an unreadable failure. */

import { describe, expect, it } from 'vitest'
import { parseSelections } from '../electron/main/briefValidate'
import { MAX_ATTENDEES, MAX_CLAIMS } from '../shared/briefLimits'
import { SELECTIONS } from './briefPluginFixtures'

const claims = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Claim ${i + 1}`, docRef: 'DOC-001' }))
const attendees = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1}`, role: 'Role' }))

describe('brief caps', () => {
  it('are 15 claims and 30 attendees', () => {
    expect([MAX_CLAIMS, MAX_ATTENDEES]).toEqual([15, 30])
  })

  it('accept exactly the maximum', () => {
    expect(parseSelections({ ...SELECTIONS, claims: claims(MAX_CLAIMS) }).ok).toBe(true)
    expect(parseSelections({ ...SELECTIONS, logistics: { ...SELECTIONS.logistics, attendees: attendees(MAX_ATTENDEES) } }).ok).toBe(true)
  })

  it('refuse one claim too many, in one line naming the cap', () => {
    const parsed = parseSelections({ ...SELECTIONS, claims: claims(MAX_CLAIMS + 1) })
    expect(parsed).toEqual({ ok: false, error: 'The page takes up to 15 claims.' })
  })

  it('refuse one attendee too many, in one line naming the cap', () => {
    const parsed = parseSelections({ ...SELECTIONS, logistics: { ...SELECTIONS.logistics, attendees: attendees(MAX_ATTENDEES + 1) } })
    expect(parsed).toEqual({ ok: false, error: 'The page takes up to 30 attendees.' })
  })

  it('keep the longest allowed brief well inside a Windows command line', () => {
    const longest = JSON.stringify(Array.from({ length: MAX_CLAIMS }, () => ({ text: 'x'.repeat(500), doc_ref: 'DOC-001' })))
      + JSON.stringify(Array.from({ length: MAX_ATTENDEES }, () => ({ name: 'x'.repeat(200), role: 'x'.repeat(200) })))
    expect(longest.length).toBeLessThan(26_000)
  })
})
