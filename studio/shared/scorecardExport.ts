// Turning the scorecard on screen into a document for a steering meeting (spec 0013).
//
// Pure, and built from the SAME object the screen rendered — never from a fresh fetch. Spec
// 0013 asks an export to contain exactly what is on screen, and a second fetch could return
// something else between somebody reading a number and sending it to a room full of people.
// That is the one failure here with real consequences, and the only way to rule it out is for
// both to come from one object.
//
// Being pure also means the document itself is testable, which matters because its honesty
// rules are the same ones the screen has: no data is never a zero, the security review wait
// keeps its own line, and the refused activity measures are stated as refused rather than
// quietly missing.

import type { Scorecard } from './types'

/** Every measure, in the order the screen shows them, with how to render a real value and
 * what would produce one. Shared so the document and the screen cannot drift into describing
 * the same number two different ways. */
interface Row {
  label: string
  value: number | null
  render: (v: number) => string
  produces: string
}

function percent(v: number): string {
  return `${Math.round(v * 100)}%`
}

function hours(v: number): string {
  return `${v.toFixed(1)}h`
}

/** One value, kept to one cell of one line.
 *
 * The bug summaries in this document come out of the project's own metrics file, and this
 * document is the one somebody carries into a steering meeting. A summary containing line
 * breaks could append an entire fabricated Measures table below the real one; a pipe character
 * could restructure the row it sits in. Nothing here executes — markdown is inert — but a
 * document that misleads the room is the failure this export exists to prevent, and it does
 * not need code execution to do it.
 */
export function cell(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim()
}

export function scorecardRows(card: Scorecard): Row[] {
  return [
    { label: 'Accepted as-is', value: card.accepted_as_is_rate, render: percent,
      produces: 'a merged spec recorded as accepted without rework' },
    { label: 'Rework or revert', value: card.rework_revert_rate, render: percent,
      produces: 'a merged spec that was later reverted or reworked' },
    { label: 'Sent back', value: card.bounce_back_rate, render: percent,
      produces: 'a spec returned to its developer during checking' },
    { label: 'Review wait (median)', value: card.review_wait_median_hours, render: hours,
      produces: 'a review that has been requested and answered' },
    // Its own row, never folded into the one above.
    { label: 'Security review wait (median)', value: card.security_review_wait_median_hours,
      render: hours, produces: 'a security review that has been requested and answered' },
    { label: 'Deployments', value: card.dora.deploy_count, render: (v) => String(v),
      produces: 'a recorded deployment' },
    { label: 'Lead time (median)', value: card.dora.lead_time_median_hours, render: hours,
      produces: 'a merged change that reached production' },
    { label: 'Change failure rate', value: card.dora.change_fail_rate, render: percent,
      produces: 'a deployment that caused an incident' },
    { label: 'Time to recover (median)', value: card.dora.time_to_recover_median_hours,
      render: hours, produces: 'a closed incident' },
  ]
}

export function hasNothingRecorded(card: Scorecard): boolean {
  return card.totals.merges === 0 && card.totals.reverts === 0 && card.totals.bounces === 0
    && card.dora.deploy_count === 0 && card.escaped_bugs.length === 0
}

/** The document. Markdown, because it reads as plain text when nothing renders it and still
 * formats when something does — which is what a document passed around before a meeting
 * actually needs. */
export function buildScorecardExport(
  card: Scorecard,
  options: { projectName: string; windowDays: number; team?: string; now: Date },
): string {
  const lines: string[] = []
  const scope = options.team ? `team ${options.team}` : 'every team'

  lines.push(`# How Build is going — ${options.projectName}`)
  lines.push('')
  lines.push(`Last ${options.windowDays} days · ${scope} · as at ${options.now.toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('Every number below is computed by the plugin from recorded events. Nothing here is')
  lines.push('calculated by the application, and nothing is estimated.')
  lines.push('')

  if (hasNothingRecorded(card)) {
    lines.push(`## No data in the last ${options.windowDays} days`)
    lines.push('')
    lines.push('These measures come from merged specs, reverts, deployments and incidents. This is')
    lines.push('an empty record rather than a score of zero — nothing has been measured yet, which')
    lines.push('is a different statement from everything measuring badly.')
    lines.push('')
  }

  lines.push('## Measures')
  lines.push('')
  lines.push('| Measure | Value | Notes |')
  lines.push('| --- | --- | --- |')
  for (const row of scorecardRows(card)) {
    // "no data" rather than a zero, and the reason it is absent — so nobody in the room fills
    // the gap with a guess.
    const value = row.value === null ? '_no data_' : row.render(row.value)
    const note = row.value === null ? `Produced by ${row.produces}.` : ''
    lines.push(`| ${cell(row.label)} | ${cell(value)} | ${cell(note)} |`)
  }
  lines.push('')

  lines.push('## Bugs that got through')
  lines.push('')
  if (card.escaped_bugs.length === 0) {
    lines.push('None recorded in this window.')
  } else {
    for (const bug of card.escaped_bugs) {
      lines.push(`- **${cell(String(bug.summary ?? 'a bug'))}**`)
      lines.push(`  - Should have been caught by: ${cell(String(bug.which_check ?? 'not recorded'))}`)
      if (bug.proposed_fix) lines.push(`  - Proposed: ${cell(String(bug.proposed_fix))}`)
    }
  }
  lines.push('')

  lines.push('## Not measured, on purpose')
  lines.push('')
  lines.push('Velocity, story points, pull-request counts and lines of code.')
  lines.push('')
  lines.push('They measure activity rather than outcome, and every one of them improves when work')
  lines.push('is split more finely — so a team can raise them without delivering anything more.')
  lines.push('The plugin refuses to record them at all, so they cannot appear here even by')
  lines.push('accident.')
  lines.push('')

  return lines.join('\n')
}
