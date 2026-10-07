/** The words a write shows (Q4): the pending line promises only that a request was sent; the
 * answer is the exit heading plus the plugin's FIRST line verbatim; between exit 0 and the
 * refreshed read the line says re-reading. No optimistic word, no metric word, no digit Studio
 * typed itself. */
import { describe, expect, it } from 'vitest'
import {
  answeredFromOk, answeredWording, isTruthfulWording, NOT_RUN, pluginFirstLine, REREADING, rereadingWording, SENDING, sendingWording,
  toneForExit,
} from '../src/stores/toastWording'
import { EXIT_HEADING } from '../shared/reasons'

const ARGV = 'Run: sprint.py verdict --spec 0002 --lane eng --verdict accepted --by @arjun'

describe('the pending line', () => {
  it('says only that the request is on its way, with the exact argv, and stays until replaced', () => {
    expect(sendingWording(ARGV)).toEqual({ tone: 'info', title: SENDING, detail: ARGV, sticky: true })
    expect(SENDING).toBe('sending to the plugin…')
    expect(SENDING).not.toMatch(/done|moved|recorded|saved/i)
  })
  it('between exit 0 and the refreshed read: re-reading, nothing changed yet', () => {
    expect(rereadingWording(ARGV)).toMatchObject({ tone: 'info', title: REREADING, sticky: true })
    expect(REREADING).toMatch(/re-reading/)
    expect(REREADING).toMatch(/before anything on screen changes/)
  })
})

describe('the answer is the plugin\'s', () => {
  it('exit 0 → Done + the first stdout line, not sticky', () => {
    const w = answeredWording({ exitCode: 0, stdout: '\n  Recorded: eng verdict accepted on 0002 (by @arjun)  \nnext line', stderr: '' })
    expect(w).toEqual({ tone: 'ok', title: EXIT_HEADING[0], detail: '  Recorded: eng verdict accepted on 0002 (by @arjun)', sticky: false })
  })
  it('exit 1 → Not done + the first stderr line, sticky; exit 2 → Refused by the plugin, error tone, sticky', () => {
    expect(answeredWording({ exitCode: 1, stdout: '', stderr: 'spec 0002 is not slated in S08' })).toEqual({ tone: 'warn', title: EXIT_HEADING[1], detail: 'spec 0002 is not slated in S08', sticky: true })
    expect(answeredWording({ exitCode: 2, stdout: '', stderr: 'REFUSED: --by must name a person' })).toMatchObject({ tone: 'error', title: EXIT_HEADING[2], detail: 'REFUSED: --by must name a person', sticky: true })
  })
  it('a plugin that printed nothing gives the heading alone — no detail is invented', () => {
    expect(answeredWording({ exitCode: 0, stdout: '', stderr: '' })).toEqual({ tone: 'ok', title: EXIT_HEADING[0], detail: undefined, sticky: false })
  })
  it('exit null is Studio\'s own refusal, headed "Not run", never attributed to the plugin', () => {
    const w = answeredWording({ exitCode: null, stdout: '', stderr: 'Sign in or type your name — the plugin records who is accountable' })
    expect(w.title).toBe(NOT_RUN)
    expect(w.detail).toBe('Sign in or type your name — the plugin records who is accountable')
    expect(Object.values(EXIT_HEADING)).not.toContain(NOT_RUN)
  })
  it('an {ok, message} script reads as exit 0 / exit 1 — these scripts never exit 2', () => {
    expect(answeredFromOk(true, 'risk_confirmed_by written')).toMatchObject({ tone: 'ok', title: EXIT_HEADING[0], detail: 'risk_confirmed_by written' })
    expect(answeredFromOk(false, '', '"Claude" is not a person')).toMatchObject({ tone: 'warn', title: EXIT_HEADING[1], detail: '"Claude" is not a person' })
  })
  it('pluginFirstLine: the first non-empty line, verbatim, from the first text that has one', () => {
    expect(pluginFirstLine('', '\n\n  two  \nthree')).toBe('  two')
    expect(pluginFirstLine('', '')).toBe('')
    expect(toneForExit(0)).toBe('ok'); expect(toneForExit(1)).toBe('warn'); expect(toneForExit(2)).toBe('error'); expect(toneForExit(null)).toBe('warn')
  })
})

describe('isTruthfulWording', () => {
  it('passes every fixed wording; fails a metric word; fails a digit Studio typed unless the plugin said it', () => {
    expect(isTruthfulWording(sendingWording('Run: sprint.py ack --spec 0002 --by @arjun'), ['Run: sprint.py ack --spec 0002 --by @arjun'])).toBe(true)
    expect(isTruthfulWording(rereadingWording(''))).toBe(true)
    expect(isTruthfulWording({ tone: 'ok', title: 'velocity up' })).toBe(false)
    expect(isTruthfulWording({ tone: 'ok', title: 'Done', detail: '3 cards moved' })).toBe(false)
    expect(isTruthfulWording({ tone: 'ok', title: 'Done', detail: 'Slated 0002 into S08' }, ['Slated 0002 into S08'])).toBe(true)
  })
})
