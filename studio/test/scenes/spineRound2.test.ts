/** The Spine's round-2 words and numbers (studio-upgrade-2 S3, I3, I4, M2/M3): the short label
 * map covers every stage the plugin's registry lists; the figcaption is condensed and still says
 * "carry no meaning"; the Closing ledger line is `signerText` / `formatStageDate` word for word;
 * the reticle follows `viewedStageId` and is null on Closing; the camera's ledger pull-back and
 * the familiarity-tiered breath count are plain numbers. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ProjectStage } from '../../shared/types'
import { nodeKind } from '../../shared/nav'
import {
  buildSpineData, formatStageDate, ledgerLine, NO_NAME_RECORDED, shortLabel, signerText, SPINE_CAPTION, SPINE_LEGEND, STAGE_SHORT_LABEL,
} from '../../src/scenes/spine/spineModel'
import { LEDGER_BACK, LEDGER_SETTLE_S, spinePose } from '../../src/scenes/spine/spineCamera'
import {
  RETICLE_CLEARANCE, RETICLE_RADIUS, RETICLE_SLIDE_S, RETICLE_TUBE, RETICLE_YAW_MAX, reticleIndex, reticleYaw, SPINE_RETICLE_LEGEND,
} from '../../src/scenes/spine/spineReticle'
import { familiarityTierOf, PULSE_CYCLES_BY_TIER } from '../../src/scenes/spine/spineSceneHooks'
import { joinSpineAssemble, onSpineAssemble, resetSpineCeremony, SPINE_ASSEMBLE_AT } from '../../src/scenes/spine/spineCeremony'

const IDS = ['0', '1', '2', '3', 'build', '7', '8', '9', 'close']

function stage(id: string, over: Partial<ProjectStage> = {}): ProjectStage {
  return {
    id, name: `phase-${id}`, display: `Phase ${id}`, status: 'pending', stage_state: 'later',
    artifact_count: 0, entered_at: null, completed_at: null, signed_off_by: null, ...over,
  }
}

function nineStages(): ProjectStage[] {
  return IDS.map((id, i) => {
    if (i < 3) return stage(id, { stage_state: 'signed_off', signed_off_by: i === 1 ? null : 'Priya N', entered_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-05T10:00:00Z', artifact_count: 2 })
    if (i === 3) return stage(id, { stage_state: 'current', entered_at: '2026-09-06T08:00:00Z', artifact_count: 1 })
    return stage(id)
  })
}

describe('S3: short labels and the condensed caption', () => {
  it('STAGE_SHORT_LABEL covers every stage id the plugin registry lists', () => {
    const registry = readFileSync(new URL('../../../phases/phase-registry.yaml', import.meta.url), 'utf8')
    const ids = Array.from(registry.matchAll(/^\s{2}- id:\s*(\S+)/gm), (m) => m[1].replace(/^["']|["']$/g, ''))
    expect(ids.length).toBeGreaterThanOrEqual(9)
    for (const id of ids) expect(STAGE_SHORT_LABEL[id], `short label for stage ${id}`).toBeTruthy()
    expect(STAGE_SHORT_LABEL['1']).toBe('Requirements')
    expect(STAGE_SHORT_LABEL.build).toBe('Build')
    expect(STAGE_SHORT_LABEL.close).toBe('Close')
  })

  it('shortLabel falls back to the words after "Phase N:", then the display, never a blank', () => {
    expect(shortLabel({ id: '7', display: 'Phase 7: Documentation' })).toBe('Documentation')
    expect(shortLabel({ id: '11', display: 'Phase 11: Hardening' })).toBe('Hardening')
    expect(shortLabel({ id: 'x', display: 'Extra' })).toBe('Extra')
  })

  it('the figcaption is the condensed line and still carries the honesty words; the long sentence survives for the table', () => {
    expect(SPINE_CAPTION).toBe('Lit rail = finished stages. Height and depth carry no meaning.')
    expect(SPINE_CAPTION).toContain('carry no meaning')
    expect(SPINE_LEGEND).toContain('carry no meaning')
    expect(SPINE_LEGEND.length).toBeGreaterThan(SPINE_CAPTION.length)
  })
})

describe('I4: the ledger line, word for word', () => {
  const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })
  it('signed → "signed off · <name> · <date>", completed → "completed · no name recorded", later → "not started"', () => {
    const [signed, completed, , current, later] = data.stations
    expect(signed.kind).toBe('signed')
    expect(ledgerLine(signed)).toBe(`signed off · ${signerText(signed)} · ${formatStageDate(signed.completed_at)}`)
    expect(ledgerLine(signed)).toBe('signed off · Priya N · 2026-09-05')
    expect(completed.kind).toBe('completed')
    expect(ledgerLine(completed)).toBe(`completed · ${NO_NAME_RECORDED}`)
    expect(ledgerLine(later)).toBe('not started')
    expect(ledgerLine(current)).toBe('in progress')
    // No fabricated zero and no duration anywhere on the ledger.
    for (const s of data.stations) expect(ledgerLine(s)).not.toMatch(/\b0\b|hours|days/)
  })

  it('the camera opens 8 % further back and settles over 900 ms; `back` 1 is the fit', () => {
    expect(LEDGER_BACK).toBeCloseTo(1.08)
    expect(LEDGER_SETTLE_S).toBe(0.9)
    const fit = spinePose(9, 724, 168)
    const back = spinePose(9, 724, 168, LEDGER_BACK)
    expect(back.distance).toBeCloseTo(fit.distance * LEDGER_BACK)
    expect(spinePose(9, 724, 168, 1)).toEqual(fit)
  })
})

describe('I3: the viewing reticle', () => {
  const data = buildSpineData({ stages: nineStages(), currentPhaseId: '3' })

  it('follows viewedStageId; null (Closing) or absent is no ring; an unknown id is no ring', () => {
    expect(reticleIndex({ ...data, viewedStageId: '2' })).toBe(2)
    expect(reticleIndex({ ...data, viewedStageId: 'close' })).toBe(8)
    expect(reticleIndex({ ...data, viewedStageId: null })).toBeNull()
    expect(reticleIndex(data)).toBeNull()
    expect(reticleIndex({ ...data, viewedStageId: 'nope' })).toBeNull()
    // Distinct from the plugin's "now": the current stage is 3 whatever is viewed.
    expect(data.currentStageId).toBe('3')
  })

  it('is a thin accent ring just outside the station ring, and the camera yaws by at most 0.06 rad', () => {
    expect(RETICLE_RADIUS).toBeCloseTo(0.26 + 0.09)
    expect(RETICLE_TUBE).toBe(0.012)
    expect(RETICLE_CLEARANCE).toBeGreaterThan(0)
    expect(RETICLE_SLIDE_S).toBe(0.32)
    expect(RETICLE_YAW_MAX).toBe(0.06)
    expect(reticleYaw(null, 9)).toBe(0)
    expect(reticleYaw(4, 9)).toBe(0)
    expect(Math.abs(reticleYaw(0, 9))).toBeCloseTo(RETICLE_YAW_MAX)
    expect(Math.abs(reticleYaw(8, 9))).toBeCloseTo(RETICLE_YAW_MAX)
    for (let i = 0; i < 9; i++) expect(Math.abs(reticleYaw(i, 9))).toBeLessThanOrEqual(RETICLE_YAW_MAX + 1e-9)
    expect(SPINE_RETICLE_LEGEND).toBe('The accent ring marks the stage you are viewing.')
  })
})

describe('M2 / M3 joins', () => {
  it('breath count by familiarity: full 3, quiet 1, settled 0; a motion layer without familiarity reads full', () => {
    expect(PULSE_CYCLES_BY_TIER).toEqual({ full: 3, quiet: 1, settled: 0 })
    expect(familiarityTierOf({}, '/p')).toBe('full')
    expect(familiarityTierOf(null, '/p')).toBe('full')
    expect(familiarityTierOf({ familiarity: () => 'settled' }, '/p')).toBe('settled')
    expect(familiarityTierOf({ familiarity: () => 'quiet' }, '/p')).toBe('quiet')
    expect(familiarityTierOf({ familiarity: () => 'nonsense' }, '/p')).toBe('full')
  })

  it('joinSpineAssemble reaches the mounted scene at 0.1 s and is false with none mounted', () => {
    resetSpineCeremony()
    const parent = { add: () => parent } as unknown as gsap.core.Timeline
    expect(joinSpineAssemble(parent)).toBe(false)
    const seen: number[] = []
    const off = onSpineAssemble((_tl, at) => { seen.push(at) })
    expect(joinSpineAssemble(parent)).toBe(true)
    expect(seen).toEqual([SPINE_ASSEMBLE_AT])
    expect(SPINE_ASSEMBLE_AT).toBe(0.1)
    off()
    expect(joinSpineAssemble(parent)).toBe(false)
  })

  it('a stage keeps nodeKind()\'s answer under every new word', () => {
    for (const s of nineStages()) expect(buildSpineData({ stages: [s], currentPhaseId: null }).stations[0].kind).toBe(nodeKind(s))
  })
})
