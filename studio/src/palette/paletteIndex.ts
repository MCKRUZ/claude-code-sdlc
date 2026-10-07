// The palette index (studio-observatory.md §6.1 "Index"). `buildIndex` is PURE: it reads only
// the `PaletteIndexInput` the host assembled from state already on screen, and the entries it
// returns navigate or call a host callback. Nothing here touches the preload bridge — a palette
// that fetched on its own would be a second, unmutexed reader of the project, and the person
// typing "#" would start a subprocess by looking.
import { targetForBuildView, targetForStage } from '../../shared/nav'
import { stageStateLabel } from '../../shared/stageLabel'
import type { StageDocument } from '../../shared/types'
import { buildActionEntries } from './paletteActions'
import type { PaletteEntry, PaletteIndexInput, SettingsAnchor } from './types'

export const SETTINGS_ANCHOR_LABEL: Record<SettingsAnchor, string> = {
  'repository': 'Repository',
  'gate-approvals': 'Gate approvals',
  'connection': 'Connection',
  'people': 'People',
  'limits': 'Build limits',
  'approval': 'Change approval',
  'tooling': 'Tooling',
  'fixed-rules': 'Fixed rules',
  'appearance': 'Appearance',
}

export const EMPTY_SPECS_ENTRY_ID = 'specs:empty'

function stageEntries(input: PaletteIndexInput): PaletteEntry[] {
  return input.stages.map((stage) => ({
    id: `stage:${stage.id}`,
    group: 'stages',
    title: `Go to ${stage.display}`,
    subtitle: stage.id === input.viewedStageId ? `${stageStateLabel(stage)} · viewing` : stageStateLabel(stage),
    keywords: [stage.id, stage.name, stage.display, `phase ${stage.id}`],
    run: () => input.navigate(targetForStage(stage.id)),
  }))
}

function buildViewEntries(input: PaletteIndexInput): PaletteEntry[] {
  if (input.stages.length === 0) return []
  return input.buildViews.map((view) => ({
    id: `build:${view.id}`,
    group: 'build',
    title: `Go to ${view.label}`,
    // No subtitle: the row already sits under the Build group heading. Every Build view answers
    // to "sprint" too — Planning, Closing and the home are the sprint's screens.
    keywords: [view.id, view.label, 'build', 'sprint'],
    run: () => input.navigate(targetForBuildView(view.id)),
  }))
}

/** One row per spec id. Board rows and the sprint slate overlap; the board row wins because it
 * carries the title. Neither empty list is an error — the palette says what to do about it. */
function specEntries(input: PaletteIndexInput): PaletteEntry[] {
  // Before a project is open there is no Board to send anyone to.
  if (input.stages.length === 0) return []
  const { rows, slate } = input.backlog
  if (rows.length === 0 && slate.length === 0) {
    return [{
      id: EMPTY_SPECS_ENTRY_ID,
      group: 'specs',
      title: 'Open the Board once to index specs',
      subtitle: 'Specs appear here after the Board has read them',
      keywords: ['spec', 'specs', 'board'],
      run: () => input.navigate(targetForBuildView('board')),
    }]
  }
  const seen = new Set<string>()
  const out: PaletteEntry[] = []
  for (const row of rows) {
    if (seen.has(row.spec)) continue
    seen.add(row.spec)
    out.push({
      id: `spec:${row.spec}`,
      group: 'specs',
      title: `Open spec ${row.spec} — ${row.title || row.name}`,
      subtitle: [row.status, row.risk, row.sprint].filter(Boolean).join(' · ') || undefined,
      keywords: [row.spec, row.name, row.title, row.status, row.risk, row.sprint, row.epic ?? ''].filter(Boolean),
      run: () => input.openSpec(row.path),
    })
  }
  for (const row of slate) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push({
      id: `spec:${row.id}`,
      group: 'specs',
      title: `Open spec ${row.id} — ${row.name}`,
      subtitle: [row.status, row.risk, row.sprint].filter(Boolean).join(' · ') || undefined,
      keywords: [row.id, row.name, row.status, row.risk, row.sprint].filter(Boolean),
      run: () => input.openSpec(row.relPath),
    })
  }
  return out
}

const docLabel = (doc: StageDocument) => doc.name.replace(/\.md$/, '')

function documentEntries(input: PaletteIndexInput): PaletteEntry[] {
  const readiness = input.readiness
  if (!readiness) return []
  const stageName = readiness.display
  const out: PaletteEntry[] = []
  for (const doc of readiness.documents) {
    // A folder (Design's adrs/) has no single document to open; a missing document opens
    // nothing either — the Documents tab is where it gets created from its template.
    if (doc.folder || !doc.exists) continue
    out.push({
      id: `doc:${doc.path}`,
      group: 'documents',
      title: `Open ${doc.name}`,
      subtitle: stageName,
      keywords: [doc.path, docLabel(doc), doc.description ?? ''].filter(Boolean),
      run: () => input.openDocument(doc.path),
    })
  }
  readiness.findings.forEach((finding, i) => {
    const doc = readiness.documents.find((d) => d.path === finding.path)
    const where = doc ? docLabel(doc) : finding.path
    out.push({
      id: `finding:${finding.path}:${finding.section}:${finding.field ?? ''}:${i}`,
      group: 'documents',
      title: `Go to ${finding.field ? `${finding.section} › ${finding.field}` : finding.section} in ${where}`,
      subtitle: finding.reason,
      keywords: [finding.section, finding.field ?? '', finding.path].filter(Boolean),
      run: () => input.openDocument(finding.path),
    })
  })
  return out
}

function settingsEntries(input: PaletteIndexInput): PaletteEntry[] {
  if (input.stages.length === 0) return []
  return input.settingsAnchors.map((anchor) => ({
    id: `settings:${anchor}`,
    group: 'settings',
    title: `Settings: ${SETTINGS_ANCHOR_LABEL[anchor]}`,
    keywords: [anchor, SETTINGS_ANCHOR_LABEL[anchor], 'settings', 'preferences'],
    run: () => input.openSettings(anchor),
  }))
}

/** The whole index in group order. Recent picks are not separate rows: `withRecentGroup`
 * re-tags the matching entries so a pick is listed once, under Recent, not twice. */
export function buildIndex(input: PaletteIndexInput): PaletteEntry[] {
  return [
    ...stageEntries(input),
    ...buildViewEntries(input),
    ...specEntries(input),
    ...documentEntries(input),
    ...settingsEntries(input),
    ...buildActionEntries(input.actions),
  ]
}

/** Entries whose id is in `recentIds` move to the Recent group in pick order (most recent
 * first); the rest keep their place. Used for the empty-query menu only — with a query typed,
 * recency is a score boost in `score.ts` and the row stays in its own group. */
export function withRecentGroup(entries: readonly PaletteEntry[], recentIds: readonly string[]): PaletteEntry[] {
  if (recentIds.length === 0) return [...entries]
  const byId = new Map(entries.map((e) => [e.id, e]))
  const recent: PaletteEntry[] = []
  for (const id of recentIds) {
    const e = byId.get(id)
    if (e) recent.push({ ...e, group: 'recent' })
  }
  const recentSet = new Set(recent.map((e) => e.id))
  return [...recent, ...entries.filter((e) => !recentSet.has(e.id))]
}
