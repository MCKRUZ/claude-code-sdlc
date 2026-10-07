/** The Spine's model as a set of honesty promises (studio-observatory.md §5.1, §5.4): a station's
 * ring kind is `nodeKind()`'s answer, never re-derived; the lit rail is a count of signed-off
 * stations by order, never time; stations are equally spaced; the doc arc exists only when both
 * numbers are known; and the span between the last signed station and the current one is a FLAT
 * line — proven on the shader's own uniforms, not on a screenshot. */

import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { readFileSync } from 'node:fs'
import { nodeKind, stageMeta } from '../../shared/nav'
import type { ProjectStage } from '../../shared/types'
import { RailMaterial } from '../../src/scenes/core/materials/RailMaterial'
import { RingMaterial } from '../../src/scenes/core/materials/RingMaterial'
import {
  buildSpineData, discRadius, docArcTheta, finishedText, formatStageDate, groupCaptions, KNOT_RADIUS, KNOT_REACH, KNOT_TUBE,
  LATER_RING_TOKEN, plateLines, railProgress, RING_RADIUS, RING_TUBE, signerText, spineSummary, STATION_PITCH, stationPoint,
  stationU, NO_NAME_RECORDED,
} from '../../src/scenes/spine/spineModel'

const IDS = ['0', '1', '2', '3', 'build', '7', '8', '9', 'close']

function stage(id: string, over: Partial<ProjectStage> = {}): ProjectStage {
  return {
    id, name: `phase-${id}`, display: `Phase ${id}`, status: 'pending', stage_state: 'later',
    artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null, ...over,
  }
}

/** Three signed (one without a name), Phase 3 current, the rest later. */
function nineStages(): ProjectStage[] {
  return IDS.map((id, i) => {
    if (i < 3) return stage(id, { stage_state: 'signed_off', signed_off_by: i === 1 ? null : 'Priya N', entered_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-05T10:00:00Z', artifact_count: 2 })
    if (i === 3) return stage(id, { stage_state: 'current', entered_at: '2026-09-06T08:00:00Z', artifact_count: 1 })
    return stage(id)
  })
}

describe('spineModel: stations', () => {
  const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3', currentDocs: { complete: 2, total: 5 } })

  it('keeps the plugin order and takes every ring kind from nodeKind()', () => {
    expect(data.stations.map((s) => s.id)).toEqual(IDS)
    for (const [i, s] of nineStages().entries()) expect(data.stations[i].kind).toBe(nodeKind(s))
    expect(data.stations.map((s) => s.kind)).toEqual(['signed', 'completed', 'signed', 'current', 'later', 'later', 'later', 'later', 'later'])
  })

  it('flags the current station, the Build loop and the group captions', () => {
    expect(data.currentStageId).toBe('3')
    expect(data.stations.filter((s) => s.isCurrent).map((s) => s.id)).toEqual(['3'])
    expect(data.stations.filter((s) => s.isBuild).map((s) => s.id)).toEqual(['build'])
    expect(groupCaptions(data)).toEqual([
      { label: 'Foundation', from: 0, to: 3 }, { label: 'Build', from: 4, to: 4 }, { label: 'Ship', from: 5, to: 7 }, { label: 'Close', from: 8, to: 8 },
    ])
  })

  it('counts FINISHED stations (nodeKind signed or completed) for the rail, so a completed-without-a-name stage still lights it', () => {
    expect(data.signedCount).toBe(3)
    expect(finishedText(data)).toBe('2 signed off, 1 completed without a name')
  })

  it('says only "N signed off" when every finished station has a recorded name', () => {
    const allNamed = buildSpineData({ stages: nineStages().map((s) => (s.stage_state === 'signed_off' ? { ...s, signed_off_by: 'Priya N' } : s)), currentPhaseId: '3' })
    expect(finishedText(allNamed)).toBe('3 signed off')
    expect(allNamed.signedCount).toBe(3)
  })
})

describe('spineModel: geometry is equal spacing and a count, never time', () => {
  it('spaces stations equally along x regardless of their dates', () => {
    const xs = Array.from({ length: 9 }, (_, i) => stationPoint(i, 9).x)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(STATION_PITCH, 10)
    expect(xs[4]).toBeCloseTo(0, 10)
    expect(stationU(0, 9)).toBe(0)
    expect(stationU(8, 9)).toBe(1)
    expect(stationU(2, 9)).toBeCloseTo(0.25, 10)
  })

  it('lights the rail to the last signed station and places uCurrent at the current one', () => {
    const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
    expect(railProgress(data)).toEqual({ uLit: 0.25, uCurrent: 0.375 })
  })

  it('lights nothing when no station is signed off, and a long-unsigned stretch does not count', () => {
    const fresh = buildSpineData({ stages: IDS.map((id, i) => stage(id, i === 0 ? { stage_state: 'current' } : {})), currentPhaseId: '0' })
    expect(railProgress(fresh)).toEqual({ uLit: 0, uCurrent: 0 })
    const none = buildSpineData({ stages: IDS.map((id) => stage(id)), currentPhaseId: null })
    expect(railProgress(none)).toEqual({ uLit: 0, uCurrent: 0 })
  })

  it('yields a FLAT unsigned span: the rail material has only uLit / uCurrent to separate the two regions and no gradient between them', () => {
    const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
    const { uLit, uCurrent } = railProgress(data)
    const material = new RailMaterial(new Color('#888888'), new Color('#22aa66'))
    material.setProgress(uLit, uCurrent)
    expect(material.uniforms.uLit.value).toBe(0.25)
    expect(material.uniforms.uCurrent.value).toBe(0.375)
    expect(Object.keys(material.uniforms).sort()).toEqual(['uCurrent', 'uDraw', 'uLine', 'uLit', 'uSigned'])
    // Between uLit and uCurrent the fragment is `color = uLine` and nothing else: no mix, no
    // smoothstep, no interpolation across the span.
    const between = material.fragmentShader.split('u <= uCurrent) {')[1].split('}')[0]
    expect(between.trim()).toBe('color = uLine;')
    expect(between).not.toMatch(/mix\(|smoothstep\(|uLit|uCurrent|alpha/)
    expect(material.fragmentShader).not.toMatch(/mix\(/)
  })
})

describe('spineModel: the doc arc exists only when both numbers are known', () => {
  const stages = nineStages()
  it('draws 2π · complete/total for the current station', () => {
    const data = buildSpineData({ stages, currentPhaseId: '3', currentDocs: { complete: 2, total: 5 } })
    expect(data.currentDocs).toEqual({ complete: 2, total: 5 })
    expect(docArcTheta(data)).toBeCloseTo(Math.PI * 2 * 0.4, 10)
  })
  it.each([
    ['no readiness yet', undefined], ['null', null], ['total missing', { complete: 2 }], ['non-numeric', { complete: '2', total: 5 }],
    ['total zero', { complete: 0, total: 0 }], ['NaN', { complete: NaN, total: 5 }],
  ])('has no arc when %s (null, not an empty arc)', (_label, docs) => {
    const data = buildSpineData({ stages, currentPhaseId: '3', currentDocs: docs as never })
    expect(data.currentDocs).toBeNull()
    expect(docArcTheta(data)).toBeNull()
  })
  it('has no arc without a current station even when numbers are given', () => {
    const data = buildSpineData({ stages, currentPhaseId: null, currentDocs: { complete: 2, total: 5 } })
    expect(data.currentDocs).toBeNull()
  })
})

describe('spineModel: words', () => {
  it('says "no name recorded" for a null or blank signer and "—" for a station that is not signed off', () => {
    expect(signerText({ stage_state: 'signed_off', signed_off_by: null })).toBe(NO_NAME_RECORDED)
    expect(signerText({ stage_state: 'signed_off', signed_off_by: '   ' })).toBe(NO_NAME_RECORDED)
    expect(signerText({ stage_state: 'signed_off', signed_off_by: ' Priya N ' })).toBe('Priya N')
    expect(signerText({ stage_state: 'current', signed_off_by: null })).toBe('—')
  })
  it('renders dates as dates (never a length) and null as "—"', () => {
    expect(formatStageDate('2026-09-05T10:00:00Z')).toBe('2026-09-05')
    expect(formatStageDate(null)).toBe('—')
  })
  it('opens every plate with the sidebar\'s own stageMeta sentence, word for word', () => {
    const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3', currentDocs: { complete: 0, total: 5 } })
    for (const station of data.stations) {
      expect(plateLines(station, data.currentDocs)[0]).toBe(stageMeta(station, station.isCurrent ? data.currentDocs : null))
    }
  })
  it('says "Not started" for a later station — no date, and never a bare "0 artifacts" that reads as a measurement', () => {
    const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
    const later = plateLines(data.stations[5])
    expect(later).toEqual(['Not started'])
    expect(later.join(' ')).not.toMatch(/\b0\b|Later|\d{4}-\d{2}-\d{2}/)
    // A later station the plugin does count files for still reports them: that number is data.
    expect(plateLines({ ...data.stations[5], artifact_count: 2 })).toEqual(['Not started', '2 artifacts'])
    // Build is a loop that may already hold specs, so its line is the sidebar's, not "Not started".
    expect(plateLines(data.stations[4])).toEqual(['Specs, checks and close-out', 'Home · Planning · Board · How it is going · Closing · Documents'])
  })
  it('reads the current station as the sidebar does: "0 of 5 documents complete" when readiness is known, "In progress" when not', () => {
    const known = buildSpineData({ stages: nineStages(), currentPhaseId: '3', currentDocs: { complete: 0, total: 5 } })
    expect(plateLines(known.stations[3], known.currentDocs)).toEqual(['0 of 5 documents complete', 'Entered 2026-09-06', 'Completed —', '1 artifact'])
    const unknown = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
    expect(plateLines(unknown.stations[3], unknown.currentDocs)[0]).toBe('In progress')
    // The docs line belongs to the current station only; a signed station never borrows it.
    expect(plateLines(known.stations[0], known.currentDocs)[0]).toBe('Signed off · Priya N')
  })
  it('a completed station with no recorded signer reads "Completed · no name recorded" — never a signature nobody recorded', () => {
    const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
    const completed = plateLines(data.stations[1])
    expect(completed).toEqual([`Completed · ${NO_NAME_RECORDED}`, 'Entered 2026-09-01', 'Completed 2026-09-05', '2 artifacts'])
    expect(completed.join(' ')).not.toMatch(/Signed off/)
    const signed = plateLines(data.stations[0])
    expect(signed).toEqual(['Signed off · Priya N', 'Entered 2026-09-01', 'Completed 2026-09-05', '2 artifacts'])
  })
  it('summarises position, signed and completed counts separately, and the next station', () => {
    const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
    expect(spineSummary(data)).toBe('Phase 3 (4 of 9) current; 2 signed off, 1 completed without a name; next: Phase build')
  })
})

describe('spineModel: station discs and the dark later ring', () => {
  it('measures a disc as the ring\'s outer rim, and Build as the knot\'s widest reach — the same numbers the meshes draw', () => {
    expect(discRadius(false)).toBeCloseTo(RING_RADIUS + RING_TUBE, 10)
    expect(discRadius(true)).toBeCloseTo(KNOT_RADIUS * KNOT_REACH + KNOT_TUBE, 10)
    expect(discRadius(true)).toBeGreaterThan(discRadius(false))
    // Equal for every station of a kind: no fact in the data is a size.
    expect(KNOT_REACH).toBe(1.5)
  })

  /** WCAG relative luminance of a `#rrggbb`. */
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  /** `fg` drawn at `alpha` over `bg`, as the ring shader blends it. */
  const over = (fg: string, bg: string, alpha: number) => {
    const mix = (i: number) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha))
    return '#' + [1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('')
  }
  const token = (css: string, name: string) => {
    const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
    if (!m) throw new Error(`token ${name} not found`)
    return m[1]
  }

  it('draws a not-started ring in dark from the ink ramp at ≥ 3:1 over the dark ground, at the shader\'s own alpha — a grey, never a stage colour', () => {
    const dark = readFileSync(new URL('../../src/theme/dark.css', import.meta.url), 'utf8')
    const ring = new RingMaterial('later', new (class { clone() { return this } })() as never)
    // The dashed ring's alpha, read off the shader rather than assumed.
    const alpha = Number(ring.fragmentShader.split('later: dashed ring')[1].match(/alpha = ([0-9.]+);/)![1])
    expect(alpha).toBeGreaterThan(0)
    expect(LATER_RING_TOKEN.dark).toMatch(/^ink-/)
    expect(LATER_RING_TOKEN.light).toBe('stage-later-fill')
    const later = token(dark, LATER_RING_TOKEN.dark)
    for (const ground of ['surface-0', 'surface-1']) {
      expect(contrast(over(later, token(dark, ground), alpha), token(dark, ground)), `${LATER_RING_TOKEN.dark} over ${ground}`).toBeGreaterThanOrEqual(3)
    }
    // The grey the stage token gave was the problem: it does not reach 3:1 once the alpha is applied.
    expect(contrast(over(token(dark, 'stage-later-fill'), token(dark, 'surface-1'), alpha), token(dark, 'surface-1'))).toBeLessThan(3)
    // Not lit: darker than the signed and current stage colours it sits between.
    for (const lit of ['stage-signed-fill', 'stage-current-fill']) expect(luminance(later)).toBeLessThan(luminance(token(dark, lit)))
  })
})
