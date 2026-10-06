// @vitest-environment jsdom
/** The stage summary strip (studio-upgrade-2 S2): counts match the fixture readiness, a null
 * signer reads "no name recorded" and is never blank, and every fact is a button that asks the
 * tab store for the tab it lives on. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PipelineEvidenceResult, StageDocument, StageReadiness } from '../shared/types'
import { StageSummaryStrip, currentStepFact, documentsFact, pipelineFact, signOffFact } from '../src/components/StageSummaryStrip'
import { readinessWith } from './activityFixtures'

function doc(path: string, ready: boolean): StageDocument {
  return { name: path, path, exists: true, folder: false, shaped: true, findingCount: 0, ready }
}

const QUESTION = (id: string, confirmed: boolean) => ({
  id, text: `Question ${id}`, hint: { status: 'judgement' as const, detail: '' },
  confirmation: confirmed ? { actor: 'Matt K', ts: '2026-10-01T00:00:00Z' } : null,
})

function readiness(over: Partial<StageReadiness> = {}): StageReadiness {
  return readinessWith({
    documents: [doc('a.md', true), doc('b.md', false), doc('c.md', false)],
    judgement: [QUESTION('q1', true), QUESTION('q2', false), QUESTION('q3', false)],
    ...over,
  })
}

const strip = () => screen.getByRole('group', { name: 'Stage summary' })

describe('StageSummaryStrip: the facts come from the readiness rows', () => {
  it('counts documents from the ready flags and names the current step', () => {
    render(<StageSummaryStrip readiness={readiness()} onRequestTab={vi.fn()} />)
    expect(within(strip()).getByText('1 of 3 complete')).toBeTruthy()
    expect(within(strip()).getByRole('button', { name: /^Current step b\.md$/ })).toBeTruthy()
    expect(within(strip()).getByRole('button', { name: /^Sign-off 2 confirmations still needed$/ })).toBeTruthy()
  })

  it('a null signer on a signed-off stage reads "no name recorded", never blank', () => {
    const signed = readiness({ signOff: { status: 'signed_off', signedOffBy: null, completedAt: null } })
    expect(signOffFact(signed)).toBe('signed off · no name recorded')
    const named = readiness({ signOff: { status: 'signed_off', signedOffBy: 'Priya N', completedAt: null } })
    expect(signOffFact(named)).toBe('signed off by Priya N')
    expect(signOffFact(readiness({ isCurrent: false }))).toBe('not current')
    expect(signOffFact(readiness({ judgement: [QUESTION('q1', true)] }))).toBe('every confirmation recorded')
    expect(signOffFact(readiness({ judgement: [QUESTION('q1', false)] }))).toBe('1 confirmation still needed')
  })

  it('documents and current step degrade honestly', () => {
    expect(documentsFact(readiness({ documents: [] }))).toEqual({ text: 'none required', tone: 'neutral' })
    expect(documentsFact(readiness({ documents: [doc('a.md', true)] }))).toEqual({ text: '1 of 1 complete', tone: 'ok' })
    const done = readiness({ documents: [doc('a.md', true)], signOff: { status: 'signed_off', signedOffBy: 'X', completedAt: null } })
    expect(currentStepFact(done)).toBe('nothing left to do')
    expect(currentStepFact(readiness({ documents: [doc('a.md', true)] }))).toBe('Sign-off')
  })

  it('each fact asks the tab store for the tab it lives on', () => {
    const request = vi.fn()
    render(<StageSummaryStrip readiness={readiness()} onRequestTab={request} />)
    fireEvent.click(within(strip()).getByRole('button', { name: /^Documents/ }))
    fireEvent.click(within(strip()).getByRole('button', { name: /^Current step/ }))
    fireEvent.click(within(strip()).getByRole('button', { name: /^Sign-off/ }))
    expect(request.mock.calls.map((c) => c[0])).toEqual(['documents', 'workflow', 'workflow'])
  })

  it('the pipeline fact appears only on Foundation with a gathered result, and counts PROVEN rows', () => {
    const rail = (name: string, status: PipelineEvidenceResult['rails'][number]['status']) => ({
      rail: name, status, reason: '', runs: null, red: null, evidence: [],
    }) as unknown as PipelineEvidenceResult['rails'][number]
    const result = { ok: true, repo: 'acme/x', gatheredAt: 'today', rails: [rail('ci', 'PROVEN'), rail('grader', 'BROKEN'), rail('stop', 'NO_DATA')], proofsNeeded: [] } as unknown as PipelineEvidenceResult
    expect(pipelineFact(result)).toBe('1 of 3 rails proven')

    const { rerender } = render(<StageSummaryStrip readiness={readiness({ name: 'foundation' })} pipeline={result} onRequestTab={vi.fn()} />)
    expect(within(strip()).getByRole('button', { name: /^Pipeline evidence 1 of 3 rails proven$/ })).toBeTruthy()

    rerender(<StageSummaryStrip readiness={readiness({ name: 'requirements' })} pipeline={result} onRequestTab={vi.fn()} />)
    expect(within(strip()).queryByRole('button', { name: /^Pipeline evidence/ })).toBeNull()
    rerender(<StageSummaryStrip readiness={readiness({ name: 'foundation' })} pipeline={null} onRequestTab={vi.fn()} />)
    expect(within(strip()).queryByRole('button', { name: /^Pipeline evidence/ })).toBeNull()
  })
})
