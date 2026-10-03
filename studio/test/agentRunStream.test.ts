/** How a model job's output is read (spec 0027): the CLI's final `result` line is authoritative, a cost
 * that is not a real number is "unknown" rather than $0.00, and every failure is ONE plain line. Run
 * against the stand-in `claude` (test/fixtures/fake-claude.mjs), never the live model. */

import { describe, expect, it } from 'vitest'
import { parseAgentStream, runAgent } from '../electron/main/agentRun'
import { claudeWorkingDirectory } from '../electron/main/claudeAssist'
import { fakeClaude } from './draftHarness'

const line = (o: object) => `${JSON.stringify(o)}\n`
const result = (o: object = {}) => line({ type: 'result', subtype: 'success', is_error: false, result: 'Hello', total_cost_usd: 0.12, ...o })

describe('parseAgentStream', () => {
  it('takes the text and the cost from the final result line', () => {
    expect(parseAgentStream(line({ type: 'assistant', message: { content: [] } }) + result())).toEqual({ ok: true, text: 'Hello', costUsd: 0.12 })
  })

  it('uses the LAST result line when there is more than one', () => {
    expect(parseAgentStream(result({ result: 'first' }) + result({ result: 'second', total_cost_usd: 1 }))).toMatchObject({ text: 'second', costUsd: 1 })
  })

  it.each([
    ['absent', { total_cost_usd: undefined }],
    ['a string', { total_cost_usd: '0.12' }],
    ['negative', { total_cost_usd: -1 }],
    ['null', { total_cost_usd: null }],
  ])('reports the cost as unknown, never 0, when it is %s', (_name, override) => {
    expect(parseAgentStream(result(override))).toEqual({ ok: true, text: 'Hello', costUsd: null })
  })

  it('keeps a genuine zero cost as zero', () => {
    expect(parseAgentStream(result({ total_cost_usd: 0 }))).toMatchObject({ ok: true, costUsd: 0 })
  })

  it('is one plain error line when the result says it failed', () => {
    const parsed = parseAgentStream(result({ is_error: true, result: 'Not logged in. Please run /login\nstack...' }))
    expect(parsed).toEqual({ ok: false, error: 'Claude could not finish this draft: Not logged in. Please run /login' })
  })

  it('is an error when there is no result line, or the text is empty', () => {
    expect(parseAgentStream(line({ type: 'assistant', message: { content: [] } }))).toEqual({ ok: false, error: 'Claude finished without giving a result.' })
    expect(parseAgentStream('')).toMatchObject({ ok: false })
    expect(parseAgentStream(result({ result: '  \n ' }))).toEqual({ ok: false, error: 'Claude returned nothing for this draft.' })
    expect(parseAgentStream(result({ result: 42 }))).toMatchObject({ ok: false })
  })

  it('does not echo a secret that appears in an error line', () => {
    const parsed = parseAgentStream(result({ is_error: true, result: 'failed with token=abcdef0123456789abcdef' }))
    expect(JSON.stringify(parsed)).not.toContain('abcdef0123456789abcdef')
  })
})

describe('runAgent against the stand-in claude', () => {
  const run = (mode: string, text?: string) => {
    const fake = fakeClaude(mode, { text })
    return { fake, promise: runAgent({ kind: 'enhance', prompt: 'p', projectPath: 'C:/p', pluginRoot: 'C:/pl', launch: fake.launch }) }
  }

  it('returns the text and the cost of a successful run', async () => {
    const { promise } = run('success', '# Draft\n\nSome text.\n')
    expect(await promise).toEqual({ ok: true, text: '# Draft\n\nSome text.', costUsd: 0.12 })
  })

  it('returns a null cost, not 0, when the run reports none', async () => {
    expect(await run('no-cost').promise).toMatchObject({ ok: true, costUsd: null })
  })

  it("runs in Studio's empty directory and passes the exact built arguments after the stand-in's own", async () => {
    const { fake, promise } = run('success')
    await promise
    const seen = fake.recorded()
    expect(seen.cwd.toLowerCase()).toBe(claudeWorkingDirectory().toLowerCase())
    expect(seen.argv).toContain('--tools')
    expect(seen.argv.slice(-3)).toEqual(['-p', '--', 'p'])
  })

  it.each([
    ['error-result', 'Claude could not finish this draft: Not logged in. Please run /login'],
    ['empty', 'Claude returned nothing for this draft.'],
    ['no-result', 'Claude finished without giving a result.'],
    ['exit1', 'Claude stopped with an error (exit code 1). The console has the details.'],
  ])('is exactly one plain error line for a %s run', async (mode, error) => {
    expect(await run(mode).promise).toEqual({ ok: false, error })
  })

  it('reports what Claude is doing, in plain words, as the stream arrives', async () => {
    const fake = fakeClaude('slow')
    const labels: string[] = []
    await runAgent({ kind: 'enhance', prompt: 'p', projectPath: 'C:/p', pluginRoot: 'C:/pl', launch: fake.launch, onActivity: (l) => labels.push(l) })
    // The runner rate-limits its progress callback, so only the later burst is guaranteed to be heard.
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((l) => /^(Reading|Writing|Searching|Thinking|Working)/.test(l) && !l.includes('/'))).toBe(true)
  })
})
