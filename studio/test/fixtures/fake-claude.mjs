// A stand-in for the `claude` CLI, for the model-runner tests (spec 0027). No test calls the live model.
//
// It is started as `node fake-claude.mjs <fake flags> <the real argument list>`. The fake flags are its
// own and are removed before it looks at anything else:
//
//   --fake-mode MODE         what to do (below)
//   --fake-record FILE       write {argv, cwd, pid} here: the arguments it was really given, and where it ran
//   --fake-text-file FILE    the text to answer with (default: a short document)
//   --fake-write-target FILE what an obedient run would write, if it were given a tool that can write
//
// Modes: success | slow | no-cost | error-result | empty | exit1 | no-result | hang | obey-injection
// The output has the shape measured from the real CLI on 2026-10-03: system init, assistant lines,
// then ONE final {"type":"result","subtype":"success","is_error":false,"result":...,"total_cost_usd":...}.

import { readFileSync, writeFileSync } from 'node:fs'

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

switch (fake.mode ?? 'success') {
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
