/** Shared pieces for the main-process workshop-brief tests (spec 0032): the plugin's `candidates --json`
 * answer and `build --json` answer as it really prints them (snake_case), a valid set of selections, and
 * a stand-in for runPluginScript that answers like the plugin and records what was started. Not a test file. */

import { resolve } from 'node:path'
import type { BriefSelections, ConsoleEntry } from '../shared/types'

export const PROJECT = resolve('/work/proj')
export const SCRIPTS = resolve('/plugin/scripts')

export const entry = (stdout: string, exitCode = 0, stderr = ''): ConsoleEntry => ({
  id: 'x', command: 'py', args: [], cwd: '', startedAt: '', durationMs: 0,
  exitCode, stdout, stderr, ok: exitCode === 0,
})
export const json = (value: unknown, exitCode = 0) => entry(JSON.stringify(value), exitCode)

/** The ways either call can fail as the runner reports them: python cannot open a missing script
 * (exit 2, nothing on stdout), the script exits 1 with no Error line, or it prints text that is not
 * one JSON document. */
export const FAILURES: Array<[string, () => ConsoleEntry]> = [
  ['the script is missing (python cannot open it)', () => entry('', 2, "python.exe: can't open file 'C:\\plugin\\scripts\\workshop_brief.py': [Errno 2] No such file or directory")],
  ['it exits with code 1 and no Error line', () => entry('{"path": "x"}', 1)],
  ['it exits with an unexpected code', () => entry('{"path": "x"}', 3, 'Error: something')],
  ['it prints text that is not JSON', () => entry('Workshop Brief Drafted')],
  ['it prints JSON that is not one document', () => entry('[1, 2]')],
  ['it prints nothing', () => entry('')],
]

const workshopQuestion = (n: number) => ({
  id: `Q-${String(n).padStart(2, '0')}`, question: `Question number ${n}?`, block: n % 2 ? 'Problem' : 'Outcomes', route: 'workshop',
})

/** What `workshop_brief.py candidates --json` prints for a project with an analysis. */
export const PLUGIN_CANDIDATES = {
  has_data: true,
  notes: [] as string[],
  contradictions: Array.from({ length: 7 }, (_, i) => ({
    id: `CON-0${i + 1}`, title: `Contradiction ${i + 1}`, severity: i < 2 ? 'blocks-outcome' : 'nice-to-know',
    question: `Which is right, ${i + 1}?`,
    sources: [{ side: 'A', document: 'DOC-001 s1', quote: 'one thing' }, { side: 'B', document: 'DOC-002 s2', quote: 'another thing' }],
    recommended: i < 2,
  })),
  questions: [
    workshopQuestion(1),
    { id: 'Q-02', question: 'How many claims per month are re-keyed?', block: 'Problem', route: 'pre-workshop' },
    workshopQuestion(3),
    { id: 'Q-04', question: 'Who owns the data policy?', block: 'Other', route: 'interview' },
    { id: 'Q-05', question: 'When is the sandbox ready?', block: 'Tooling & Access', route: 'pre-workshop' },
    ...Array.from({ length: 14 }, (_, i) => workshopQuestion(10 + i)),
  ],
  documents: ['DOC-001', 'DOC-002', 'DOC-003', 'DOC-004', 'DOC-005', 'DOC-006'].map((id) => ({
    id, filename: `${id.toLowerCase()}.pdf`, topics: 'goals, scope',
  })),
  limits: { contradictions: 5, questions: 12, decisions: [3, 5], load_bearing: [3, 5] },
  standing_decisions: 2,
  existing_brief: false,
  provisional_ids: false,
}

export const withCandidates = (changes: Record<string, unknown>) => ({ ...PLUGIN_CANDIDATES, ...changes })

/** A valid choice against PLUGIN_CANDIDATES. */
export const SELECTIONS: BriefSelections = {
  contradictions: ['CON-01', 'CON-02'],
  questions: ['Q-01', 'Q-03'],
  loadBearing: ['DOC-001', 'DOC-002', 'DOC-003'],
  claims: [{ text: 'Average claim takes 19 days', docRef: 'DOC-001' }],
  decisions: ['Who signs off the pilot?'],
  logistics: {
    clientName: 'Acme Insurance', dateTimeLocation: '12 Oct 2026, 09:00, Leeds', duration: 'Half a day',
    facilitator: 'Priya N', attendees: [{ name: 'Sam K', role: 'Head of Claims' }],
  },
  replaceExisting: false,
}

export const PLUGIN_BUILT = {
  path: `${PROJECT.split('\\').join('/')}/.sdlc/artifacts/00-discovery/workshop-brief.md`,
  contradictions: { total: 7, on_page: 2, ids: ['CON-01', 'CON-02'] },
  questions: { total: 19, on_page: 2, ids: ['Q-01', 'Q-03'], emailed_instead: ['Q-02', 'Q-05'] },
  claims: 1, load_bearing: ['DOC-001', 'DOC-002', 'DOC-003'], provisional_ids: false,
  lint: [{ line: 41, message: 'does not end in a question mark: 3. Go.' }],
  notes: ['No claims supplied.'],
}

type Answer = ((args: string[]) => ConsoleEntry) | ConsoleEntry

/** A runPluginScript stand-in that answers `candidates` and `build` and records every call. */
export function planStandIn(candidates: Answer, built: Answer) {
  const calls: Array<{ script: string; args: string[] }> = []
  const impl = async (_dir: string, script: string, args: string[]): Promise<ConsoleEntry> => {
    calls.push({ script, args })
    const answer = args[0] === 'candidates' ? candidates : built
    return typeof answer === 'function' ? answer(args) : answer
  }
  return { impl, calls, builds: () => calls.filter((c) => c.args[0] === 'build') }
}
