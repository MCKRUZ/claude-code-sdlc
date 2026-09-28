/** The questions for whoever signs a stage off, as a person meets them: a box to tick, and a hint
 * beside it saying what Studio could see.
 *
 * The line these tests hold is that a hint is a pre-check, never a verdict. "Looks done" sits next
 * to an UNTICKED box — only a named person's click ticks it — and a question nothing can check
 * says so rather than guessing. The recording half runs against the real plugin scripts, because
 * "the tick reached the record, with the right name" is only true if the plugin says it did.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { getStageReadiness, setJudgementConfirmation } from '../electron/main/readiness'
import { isAllowlisted } from '../electron/main/projectPaths'
import type { SignOffQuestion } from '../shared/types'
import { SignOffQuestions } from '../src/components/SignOffQuestions'
import { requirePlugin } from './pluginRoot'

const PLUGIN = requirePlugin(__dirname)

const QUESTIONS: SignOffQuestion[] = [
  { id: 'q-1', text: 'Scope boundaries are unambiguous', hint: { status: 'looks_met', detail: '2 thing(s) listed as out of scope. Confirm you agree.' }, confirmation: null },
  { id: 'q-2', text: 'success-criteria.md has at least 3 dimensions', hint: { status: 'not_yet', detail: '2 of 2 dimension(s) have thresholds; at least 3 are needed.' }, confirmation: null },
  { id: 'q-3', text: 'Rollback rehearsed by the operators', hint: { status: 'judgement', detail: 'Needs your judgement — nothing here can check this.' }, confirmation: { actor: 'Priya N', ts: '2026-09-28T17:56:12.000Z' } },
]

const render = (over: Partial<Parameters<typeof SignOffQuestions>[0]> = {}) =>
  renderToStaticMarkup(createElement(SignOffQuestions, {
    questions: QUESTIONS, actor: 'Matt K', busyId: null, error: null, onToggle: () => {}, ...over,
  }))

describe('SignOffQuestions', () => {
  it('has a checkbox for every question, named by the question', () => {
    const html = render()
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(QUESTIONS.length)
    for (const q of QUESTIONS) expect(html).toContain(`aria-label="${q.text}"`)
  })

  it('ticks only what a person confirmed — a hint that says "looks done" does not tick its box', () => {
    const html = render()
    const boxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0])
    expect(boxes[0]).not.toContain('checked')
    expect(boxes[1]).not.toContain('checked')
    expect(boxes[2]).toContain('checked')
  })

  it('says who confirmed a question and when', () => {
    const html = render()
    expect(html).toContain('Priya N')
    expect(html).toContain('2026')
  })

  it('shows each hint in words a person can act on', () => {
    const text = render().replace(/<[^>]+>/g, '')
    expect(text).toContain('Looks done')
    expect(text).toContain('2 thing(s) listed as out of scope')
    expect(text).toContain('Not yet')
    expect(text).toContain('at least 3 are needed')
    expect(text).toContain('Needs your judgement')
  })

  it('counts how many are confirmed', () => {
    expect(render().replace(/<[^>]+>/g, '')).toContain('1 of 3 confirmed')
  })

  it('cannot be ticked without a name to record it under, and says why', () => {
    const html = render({ actor: '' })
    expect(html).toMatch(/type="checkbox"[^>]*disabled/)
    expect(html.replace(/<[^>]+>/g, '')).toContain('sign in')
  })

  it('cannot tick a question from a plugin too old to record confirmations', () => {
    const html = render({ questions: [{ ...QUESTIONS[0], id: '' }] })
    expect(html).toMatch(/type="checkbox"[^>]*disabled/)
    expect(html.replace(/<[^>]+>/g, '')).toContain('update the plugin')
  })

  it('shows a failed recording rather than pretending the tick took', () => {
    expect(render({ error: 'the record could not be written' })).toContain('the record could not be written')
  })

  it('explains that hints only pre-check', () => {
    expect(render().replace(/<[^>]+>/g, '')).toMatch(/pre-check|you still confirm/i)
  })
})

describe.skipIf(!PLUGIN.available)('recording a confirmation, against the real plugin', () => {
  let project = ''

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'studio-signoff-'))
    execFileSync(PLUGIN.python, [
      join(PLUGIN.scriptsDir, 'init_project.py'),
      '--profile', join(PLUGIN.root!, 'profiles', 'microsoft-enterprise', 'profile.yaml'),
      '--target', project,
    ], { cwd: PLUGIN.scriptsDir })
    return () => rmSync(project, { recursive: true, force: true })
  })

  const read = () => getStageReadiness(project, PLUGIN.scriptsDir, '0')

  it('lists each question with an id and a hint, none confirmed yet', async () => {
    const stage = await read()
    expect(stage.ok, stage.error).toBe(true)
    expect(stage.judgement.length).toBeGreaterThanOrEqual(4)
    for (const q of stage.judgement) {
      expect(q.id).toMatch(/^q-/)
      expect(['looks_met', 'not_yet', 'judgement']).toContain(q.hint.status)
      expect(q.confirmation).toBeNull()
    }
  })

  it('records the confirmation under the person’s name and shows it on the next read', async () => {
    const first = (await read()).judgement[0]
    const r = await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', first.id, true, 'Matt K')
    expect(r.ok, r.error).toBe(true)
    const after = (await read()).judgement
    expect(after[0].confirmation?.actor).toBe('Matt K')
    expect(after[1].confirmation).toBeNull()
  })

  it('withdraws a confirmation', async () => {
    const first = (await read()).judgement[0]
    await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', first.id, true, 'Matt K')
    const r = await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', first.id, false, 'Matt K')
    expect(r.ok, r.error).toBe(true)
    expect((await read()).judgement[0].confirmation).toBeNull()
  })

  it('refuses to record without a name, and says so', async () => {
    const first = (await read()).judgement[0]
    const r = await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', first.id, true, '')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/named person|name/i)
    expect((await read()).judgement[0].confirmation).toBeNull()
  })

  it('refuses a question that is not one of the stage’s', async () => {
    const r = await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', 'q-nope', true, 'Matt K')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('leaves the project’s own state file alone', async () => {
    // advance_phase.py owns state.yaml; a tick is a record of a person's word, not a phase change.
    const before = readFileSync(join(project, '.sdlc', 'state.yaml'))
    const first = (await read()).judgement[0]
    await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', first.id, true, 'Matt K')
    expect(readFileSync(join(project, '.sdlc', 'state.yaml')).equals(before)).toBe(true)
  })

  it('does not make the stage’s documents any more ready', async () => {
    const before = await read()
    for (const q of before.judgement) await setJudgementConfirmation(project, PLUGIN.scriptsDir, '0', q.id, true, 'Matt K')
    const after = await read()
    expect(after.ready).toBe(before.ready)
    expect(after.findings.length).toBe(before.findings.length)
  })
})

describe('where the record lives', () => {
  it('is a file Studio syncs, so a teammate sees the tick', () => {
    expect(isAllowlisted('.sdlc/metrics/confirmation-log.jsonl')).toBe(true)
  })
})
