// A stand-in for the `claude` CLI, for the model-runner tests (spec 0027). No test calls the live model.
//
// It is started as `node fake-claude.mjs <fake flags> <the real argument list>`. The fake flags are its
// own and are removed before it looks at anything else:
//
//   --fake-mode MODE         what to do (below)
//   --fake-record FILE       write {argv, cwd, pid} here: the arguments it was really given, and where it ran
//   --fake-text-file FILE    the text to answer with (default: a short document)
//   --fake-write-target FILE what an obedient run would write, if it were given a tool that can write
//   --fake-script FILE       (mode `scripted`, spec 0029) JSON: what to do for each document or the analysis
//   --fake-log FILE          append {event, key, argv, cwd, pid, t} lines: one at start, one at a clean end
//
// Modes: success | slow | no-cost | error-result | empty | exit1 | no-result | hang | obey-injection | scripted
// The output has the shape measured from the real CLI on 2026-10-03: system init, assistant lines,
// then ONE final {"type":"result","subtype":"success","is_error":false,"result":...,"total_cost_usd":...}.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const raw = process.argv.slice(2)
const fake = {}
const rest = []
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--fake-')) {
    fake[raw[i].slice('--fake-'.length)] = raw[i + 1]
    i++
  } else {
    rest.push(raw[i])
  }
}

const valueOf = (flag) => { const i = rest.indexOf(flag); return i === -1 ? '' : rest[i + 1] }
const tools = valueOf('--tools').split(',').filter(Boolean)
const text = fake['text-file'] ? readFileSync(fake['text-file'], 'utf-8') : '# A short document\n\nBody.\n'
const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)

if (fake.record) writeFileSync(fake.record, JSON.stringify({ argv: rest, cwd: process.cwd(), pid: process.pid }))

emit({ type: 'system', subtype: 'init', cwd: process.cwd(), tools, mcp_servers: [] })
emit({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: 'C:/project/.sdlc/artifacts/01-requirements/requirements.md' } }] },
})

const result = (overrides) => emit({
  type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: text, total_cost_usd: 0.12, ...overrides,
})

const DOC_ID = /\bDOC-\d+\b/

/** The stand-in's own valid replies for a batch run (spec 0029): a filled summary, or both analysis documents. */
const summaryFor = (id) => `---
doc_id: "${id}"
filename: "stand-in.md"
---

# ${id}

## Document Overview
A stand-in summary of ${id}.
`
const ANALYSIS = [
  '=== FILE: contradiction-list.md ===', '# Contradiction list', '', 'DOC-001 and DOC-002 disagree.',
  '=== FILE: question-list.md ===', '# Question list', '', 'Q-01 Who owns it?',
  '=== END ===',
].join('\n')

/** A scripted run: the prompt's own document id (or `analysis`) picks the entry; `default` fills the rest.
 * An entry is {behaviour, cost, text, delayMs}. behaviour: ok | text | error | empty | no-cost | hang | exit1. */
function scripted() {
  const script = fake.script ? JSON.parse(readFileSync(fake.script, 'utf-8')) : {}
  const prompt = rest[rest.length - 1] ?? ''
  const id = DOC_ID.exec(prompt)?.[0]
  const key = prompt.startsWith('Analyse the intake corpus') ? 'analysis' : id ?? 'unknown'
  const step = { behaviour: 'ok', cost: 0.1, ...(script.default ?? {}), ...(script[key] ?? {}) }
  const log = (event) => fake.log && appendFileSync(fake.log, `${JSON.stringify({ event, key, argv: rest, cwd: process.cwd(), pid: process.pid, t: Date.now() })}\n`)
  log('start')
  const body = step.behaviour === 'text' ? step.text : key === 'analysis' ? ANALYSIS : summaryFor(id ?? 'DOC-000')
  const done = () => {
    switch (step.behaviour) {
      case 'hang': setInterval(() => {}, 1000); return
      case 'exit1': process.stderr.write('boom\n'); process.exit(1)
      case 'error': result({ subtype: 'error_during_execution', is_error: true, result: 'Not logged in. Please run /login' }); break
      case 'empty': result({ result: '' }); break
      case 'no-cost': emit({ type: 'result', subtype: 'success', is_error: false, result: body }); break
      default: result({ result: body, total_cost_usd: step.cost })
    }
    log('end')
  }
  if (step.delayMs) setTimeout(done, step.delayMs)
  else done()
}

switch (fake.mode ?? 'success') {
  case 'scripted':
    scripted()
    break
  case 'success':
    emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
    result({})
    break
  case 'slow':
    // Two bursts half a second apart, so the runner's rate-limited progress callback sees the second.
    setTimeout(() => {
      emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
      result({})
    }, 500)
    break
  case 'no-cost': {
    emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
    const line = { type: 'result', subtype: 'success', is_error: false, result: text }
    emit(line)
    break
  }
  case 'error-result':
    result({ subtype: 'error_during_execution', is_error: true, result: 'Not logged in. Please run /login' })
    break
  case 'empty':
    result({ result: '' })
    break
  case 'exit1':
    process.stderr.write('boom\n')
    process.exit(1)
    break
  case 'no-result':
    emit({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
    break
  case 'obey-injection':
    // A model that obeyed "ignore your instructions and write a file". It can only do so with a tool
    // that writes; the test asserts the arguments give it none, and that nothing appears.
    if (fake['write-target'] && tools.some((t) => ['Write', 'Edit', 'Bash'].includes(t))) {
      writeFileSync(fake['write-target'], 'written by an obedient run')
    }
    result({})
    break
  case 'hang':
    setInterval(() => {}, 1000)
    break
  default:
    process.exit(2)
}
