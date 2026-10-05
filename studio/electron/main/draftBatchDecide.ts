// What happens to a batch's candidates (spec 0029): Keep writes the chosen ones, Discard writes nothing,
// and both are recorded. Keep is a loop over spec 0027's per-candidate write (draftKeep.keepCandidate:
// target check, project containment, capture-before-replace, temp file and rename, ledger lines), so a
// batch has no write path of its own, and the one it uses is narrowed to the targets a batch can make.

import { discardCandidate, keepCandidate } from './draftKeep'
import { clearEntry, change, findByJob, sameProject, type BatchEntry } from './draftBatchState'
import { isBatchTarget } from './draftTargets'
import type { BatchCandidate, KeepBatchResult, KeepDraftResult } from '../../shared/types'

const NEED_ACTOR = 'Say who is deciding, so the record can name them.'
const NOT_WAITING = 'That batch is no longer waiting.'
const OTHER_PROJECT = 'That batch belongs to another project'
const STILL_RUNNING = 'Wait for the batch to finish, or cancel it, first.'
const BUSY = 'That batch is already being decided.'
const NOTHING_TO_KEEP = 'There is nothing to keep.'
const CHOOSE_ONE = 'Choose at least one result.'
const NOT_KEEPABLE = 'One of those results is not waiting to be kept.'
const NOT_THERE = 'One of those results is not waiting.'
const NOT_ATTEMPTED = 'Not written, because the other document could not be written.'

type Found = { entry: BatchEntry; who: string } | { error: string }

function findBatch(projectPath: string, jobId: unknown, actor: unknown): Found {
  if (typeof actor !== 'string' || !actor.trim()) return { error: NEED_ACTOR }
  const entry = findByJob(jobId)
  if (!entry) return { error: NOT_WAITING }
  if (!sameProject(entry.key, projectPath)) return { error: OTHER_PROJECT }
  if (entry.active || entry.job.phase === 'running') return { error: STILL_RUNNING }
  if (entry.deciding) return { error: BUSY }
  return { entry, who: actor.trim() }
}

/** The named candidates, in the order the batch holds them; every candidate that `allowed` accepts when
 * none are named. A name that is not an acceptable candidate refuses the whole request. */
function choose(
  entry: BatchEntry, ids: unknown, allowed: (c: BatchCandidate) => boolean, unacceptable: string,
): BatchCandidate[] | { error: string } {
  if (ids === undefined || ids === null) return entry.candidates.filter(allowed)
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) return { error: CHOOSE_ONE }
  const named = new Set<string>(ids)
  const chosen = entry.candidates.filter((c) => named.has(c.id))
  if (chosen.length !== named.size || !chosen.every(allowed)) return { error: unacceptable }
  return chosen
}

/** Removes the decided candidates. A batch with nothing left to decide, and no run going, is over. */
function settle(entry: BatchEntry, decided: ReadonlySet<string>): void {
  const candidates = entry.candidates.filter((c) => !decided.has(c.id))
  if (candidates.length === 0 && !entry.active) clearEntry(entry)
  else change(entry, { candidates }, true)
}

const refusal = (error: string): KeepBatchResult => ({ ok: false, error, kept: [], failed: [], warnings: [] })
const isReady = (c: BatchCandidate) => c.status === 'ready'

/** One line naming what was written and what was not, so a person is never left guessing which half landed. */
function describe(kept: readonly BatchCandidate[], failed: KeepBatchResult['failed']): string {
  const written = kept.length > 0 ? `Written: ${kept.map((c) => c.label).join(', ')}. ` : ''
  return `${written}Not written: ${failed.map((f) => `${f.label} (${f.error.split('\n')[0]})`).join('; ')}`
}

export async function keepBatch(
  projectPath: string, scriptsDir: string, jobId: unknown, actor: unknown, candidateIds?: unknown,
): Promise<KeepBatchResult> {
  const found = findBatch(projectPath, jobId, actor)
  if ('error' in found) return refusal(found.error)
  const { entry, who } = found
  const chosen = choose(entry, candidateIds, isReady, NOT_KEEPABLE)
  if ('error' in chosen) return refusal(chosen.error)
  if (chosen.length === 0) return refusal(NOTHING_TO_KEEP)

  entry.deciding = true
  try {
    const kept: BatchCandidate[] = []
    const failed: KeepBatchResult['failed'] = []
    const warnings: string[] = []
    // The two analysis documents belong together: once one cannot be written, the other is left alone.
    let stop = false
    for (const candidate of chosen) {
      if (stop) {
        failed.push({ id: candidate.id, label: candidate.label, error: NOT_ATTEMPTED })
        continue
      }
      const result = await keepCandidate(projectPath, scriptsDir, candidate, who, isBatchTarget)
        .catch((): KeepDraftResult => ({ ok: false, error: 'It could not be written.' }))
      if (result.ok) {
        kept.push(candidate)
        if (result.warning) warnings.push(`${candidate.label}: ${result.warning}`)
      } else {
        failed.push({ id: candidate.id, label: candidate.label, error: result.error ?? 'It could not be written.' })
        stop = entry.job.kind === 'analyse'
      }
    }
    settle(entry, new Set(kept.map((c) => c.id)))
    return {
      ok: failed.length === 0,
      ...(failed.length > 0 ? { error: describe(kept, failed) } : {}),
      kept: kept.map((c) => c.id), failed, warnings,
    }
  } finally {
    entry.deciding = false
  }
}

export async function discardBatch(
  projectPath: string, scriptsDir: string, jobId: unknown, actor: unknown, candidateIds?: unknown,
): Promise<{ ok: boolean; error?: string; warnings: string[] }> {
  const found = findBatch(projectPath, jobId, actor)
  if ('error' in found) return { ok: false, error: found.error, warnings: [] }
  const { entry, who } = found
  const chosen = choose(entry, candidateIds, () => true, NOT_THERE)
  if ('error' in chosen) return { ok: false, error: chosen.error, warnings: [] }

  entry.deciding = true
  try {
    const warnings: string[] = []
    // Only a result that was offered is a draft to record; a run that produced none has nothing to say.
    for (const candidate of chosen.filter(isReady)) {
      const result = await discardCandidate(projectPath, scriptsDir, candidate, who)
      if (result.warning) warnings.push(`${candidate.label}: ${result.warning}`)
    }
    settle(entry, new Set(chosen.map((c) => c.id)))
    return { ok: true, warnings }
  } finally {
    entry.deciding = false
  }
}
