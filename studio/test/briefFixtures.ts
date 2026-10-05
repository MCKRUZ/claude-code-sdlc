import { vi } from 'vitest'
import type { BriefCandidatesResult, BriefContradiction, BriefQuestion, BuildBriefResult } from '../shared/types'

export type BriefCandidates = Extract<BriefCandidatesResult, { ok: true }>

const source = (side: 'A' | 'B', n: number) => ({
  side, document: `DOC-00${n} s1.${n}`, quote: `Quoted passage ${side}${n}`,
})

export function contradiction(n: number, over: Partial<BriefContradiction> = {}): BriefContradiction {
  const id = `CON-0${n}`
  return {
    id, title: `Contradiction ${n} title`, severity: n <= 2 ? 'blocks-outcome' : 'minor',
    question: `Which is right for item ${n}?`, sources: [source('A', n), source('B', n + 1)],
    recommended: n <= 2, ...over,
  }
}

export function question(n: number, block: string, route: string): BriefQuestion {
  return { id: `Q-0${n}`, question: `Question ${n} for the room?`, block, route }
}

export function briefCandidates(over: Partial<BriefCandidates> = {}): BriefCandidates {
  return {
    ok: true, hasData: true, notes: [],
    contradictions: [1, 2, 3, 4, 5, 6].map((n) => contradiction(n)),
    questions: [
      question(1, 'Scope', 'workshop'), question(2, 'Scope', 'pre-workshop'),
      question(3, 'Data', 'workshop'), question(4, 'Data', 'interview'), question(5, 'Data', 'workshop'),
    ],
    documents: [1, 2, 3, 4, 5].map((n) => ({ id: `DOC-00${n}`, filename: `file-${n}.md`, topics: `topic ${n}` })),
    limits: { contradictions: 5, questions: 12, decisions: [3, 5], loadBearing: [3, 5] },
    standingDecisions: 2, existingBrief: false, provisionalIds: false,
    ...over,
  }
}

export function builtBrief(over: Partial<Extract<BuildBriefResult, { ok: true }>> = {}): BuildBriefResult {
  return {
    ok: true, path: '.sdlc/artifacts/00-discovery/workshop-brief.md',
    contradictionsOnPage: 3, questionsOnPage: 4, emailedInstead: [], notes: [], lint: [], ...over,
  }
}

/** A window.studio double with the brief calls and a two-person roster; each can be overridden. */
export function installBriefApi(over: Record<string, unknown> = {}, candidates: BriefCandidatesResult = briefCandidates()) {
  const studio = {
    getBriefCandidates: vi.fn().mockResolvedValue(candidates),
    buildBrief: vi.fn().mockResolvedValue(builtBrief()),
    getProjectSettings: vi.fn().mockResolvedValue({
      ok: true,
      roster: { file: 'team.yaml', present: true, errors: [], teams: [], people: [{ handle: '@sam-k', name: 'Sam K' }, { handle: '@priya-n' }] },
    }),
    ...over,
  }
  // @ts-expect-error - test double, not the full StudioApi surface
  window.studio = studio
  return studio
}

export function removeBriefApi() {
  // @ts-expect-error - cleaning up the test double
  delete window.studio
}
