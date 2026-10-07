// The spec card's read and its two tier/role writes (togo-command-center.md §2.2, §2.4, §3.3).
// `getSpecCard` fans out over the plugin's per-spec reads — DoR findings (with the checking
// ladder when the plugin emits one), live PR status, the findings ledger scoped to the spec,
// the channel lint, and the hand-off dry run — each as its own `SourcedBlock`. The ladder is
// `risk_model.required_rungs()` as the plugin printed it; Studio never lists a rung itself. The
// channel block is null when the plugin says `bound:false`, the hand-off block null when no
// developer was named. Capabilities gate every verb an older plugin lacks, before any spawn.

import { runPluginScript } from './project'
import { rawStdout } from './commandRunner'
import { resolveProjectDocument } from './projectPaths'
import { getSpecStatus } from './board'
import { checkHandOff } from './handoff'
import { getCapabilities, invalidateCommandCenter } from './commandCenter'
import { parseDocument, readChannelCheck, readFindings, readReadiness, readReadinessAll } from './commandCenterReaders'
import { CAPABILITIES, NO_ACTOR, newerPlugin } from '../../shared/reasons'
import type {
  ActorInfo, AssignRolesResult, ChannelCheckView, ConfirmTierResult, FindingsView, HandOffCheck, ReadinessAll, SpecCard,
  SpecLadder, SpecReadinessFull, SpecStatus, SourcedBlock,
} from '../../shared/types'

type Read<T> = { ok: true; data: T } | { ok: false; error: string }
const stateArgs = (projectPath: string) => ['--state', `${projectPath}/.sdlc/state.yaml`]
const sourced = <T>(source: string, read: Read<T>): SourcedBlock<T> => ({
  source, fetchedAt: new Date().toISOString(), ok: read.ok, data: read.ok ? read.data : null, error: read.ok ? null : read.error,
})

async function readOne<T>(scriptsDir: string, script: string, args: string[], read: (raw: unknown) => T | null, exitZero = true): Promise<Read<T>> {
  const entry = await runPluginScript(scriptsDir, script, args)
  const data = (!exitZero || entry.exitCode === 0) ? read(parseDocument(rawStdout(entry))) : null
  return data !== null ? { ok: true, data } : { ok: false, error: entry.stderr.trim() || entry.stdout.trim() || `${script} gave no readable answer` }
}

export async function getSpecCard(
  projectPath: string, scriptsDir: string, specPath: string, developer?: string,
): Promise<SpecCard> {
  const capabilities = await getCapabilities(projectPath, scriptsDir)
  let full: string
  try {
    full = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    const error = (err as Error).message
    const refused = <T>(source: string) => sourced<T>(source, { ok: false, error })
    return {
      spec: '', path: specPath, readiness: refused('spec_readiness.py --spec --json'), ladder: refused('spec_readiness.py --spec --json ladder'),
      status: refused('spec_status.py --spec --json'), findings: refused('record_findings.py report --json'), channel: null, handoffCheck: null,
    }
  }
  const findingsArgs = capabilities.includes(CAPABILITIES.findingsJson) ? ['--spec', full] : []
  const [readiness, status, findings, channel, handoff] = await Promise.all([
    readOne<SpecReadinessFull>(scriptsDir, 'spec_readiness.py', ['--spec', full, ...stateArgs(projectPath), '--json'], readReadiness),
    getSpecStatus(projectPath, scriptsDir, specPath).then<Read<SpecStatus>>((r) => (r.ok && r.status ? { ok: true, data: r.status } : { ok: false, error: r.error ?? 'unreadable' })),
    readOne<FindingsView>(scriptsDir, 'record_findings.py', ['report', '--repo', projectPath, '--json', ...findingsArgs], readFindings, false),
    // No `--state`: with one, check_channel logs to .sdlc/metrics/channel-log.jsonl — a read must not write.
    readOne<ChannelCheckView>(scriptsDir, 'check_channel.py', ['--spec', full, '--json'], readChannelCheck),
    developer?.trim()
      ? (capabilities.includes(CAPABILITIES.handoffCheck)
        ? checkHandOff(projectPath, scriptsDir, specPath, developer).then<Read<HandOffCheck>>((d) => ({ ok: true, data: d }))
        : Promise.resolve<Read<HandOffCheck>>({ ok: false, error: newerPlugin(CAPABILITIES.handoffCheck) }))
      : Promise.resolve(null),
  ])
  const ladder: Read<SpecLadder> = readiness.ok && readiness.data.ladder
    ? { ok: true, data: readiness.data.ladder }
    : { ok: false, error: readiness.ok ? newerPlugin(CAPABILITIES.readinessAll) : readiness.error }
  return {
    spec: readiness.ok ? readiness.data.spec : (status.ok ? status.data.spec : ''),
    path: specPath,
    readiness: sourced('spec_readiness.py --spec --json', readiness),
    ladder: sourced('spec_readiness.py --spec --json ladder', ladder),
    status: sourced('spec_status.py --spec --json', status),
    findings: sourced(findingsArgs.length ? 'record_findings.py report --json --spec' : 'record_findings.py report --json', findings),
    channel: channel.ok && !channel.data.bound ? null : sourced('check_channel.py --json', channel),
    handoffCheck: handoff === null ? null : sourced('handoff.py --check --json', handoff),
  }
}

/** `spec_readiness.py --all --json`: one spawn for every Refining and backlog row. */
export async function getReadinessAll(projectPath: string, scriptsDir: string): Promise<ReadinessAll> {
  const capabilities = await getCapabilities(projectPath, scriptsDir)
  if (!capabilities.includes(CAPABILITIES.readinessAll)) return { ok: false, specs: [] }
  const r = await readOne(scriptsDir, 'spec_readiness.py', ['--all', ...stateArgs(projectPath), '--json'], readReadinessAll)
  return r.ok ? r.data : { ok: false, specs: [] }
}

// --- spec_transition.py confirm-tier | assign ----------------------------------------------------

type Refusal = { ok: false; refusal: { kind: string; message: string } }
const refuse = (kind: string, message: string): Refusal => ({ ok: false, refusal: { kind, message } })

async function transition<T extends ConfirmTierResult | AssignRolesResult>(
  projectPath: string, scriptsDir: string, specPath: string, verbArgs: string[], extra: (doc: Record<string, unknown>) => Partial<T>,
): Promise<T | Refusal> {
  let full: string
  try {
    full = resolveProjectDocument(projectPath, specPath)
  } catch (err) {
    return refuse('other', (err as Error).message)
  }
  const entry = await runPluginScript(scriptsDir, 'spec_transition.py', ['--spec', full, ...stateArgs(projectPath), '--json', ...verbArgs])
  invalidateCommandCenter(projectPath)
  const doc = parseDocument(rawStdout(entry))
  if (!doc) return refuse('other', entry.stderr.trim() || 'The change command gave no readable answer.')
  if (doc.ok !== true) {
    const r = (doc.refusal ?? {}) as { kind?: unknown; message?: unknown }
    return refuse(String(r.kind ?? 'other'), String(r.message ?? 'The change was refused.'))
  }
  return { ok: true, changed: doc.changed === true, message: String(doc.message ?? ''), ...extra(doc) } as T
}

export async function confirmTier(
  projectPath: string, scriptsDir: string, specPath: string, actor: ActorInfo | null, capabilities?: readonly string[],
): Promise<ConfirmTierResult> {
  if (!actor) return refuse('no_actor', NO_ACTOR)
  const caps = capabilities ?? await getCapabilities(projectPath, scriptsDir)
  if (!caps.includes(CAPABILITIES.confirmTier)) return refuse('newer_plugin', newerPlugin(CAPABILITIES.confirmTier))
  return transition<ConfirmTierResult>(projectPath, scriptsDir, specPath, ['confirm-tier', '--by', actor.name], (doc) => ({
    ...(typeof doc.risk === 'string' ? { risk: doc.risk } : {}),
    ...(typeof doc.confirmed_by === 'string' ? { confirmedBy: doc.confirmed_by } : {}),
    ...(typeof doc.confirmation_cleared === 'boolean' ? { confirmationCleared: doc.confirmation_cleared } : {}),
  }))
}

const HANDLE = /^@?[A-Za-z0-9][A-Za-z0-9._-]*$/

export async function assignRoles(
  projectPath: string, scriptsDir: string, specPath: string, roles: { developer?: string; checker?: string },
  actor: ActorInfo | null, capabilities?: readonly string[],
): Promise<AssignRolesResult> {
  if (!actor) return refuse('no_actor', NO_ACTOR)
  const caps = capabilities ?? await getCapabilities(projectPath, scriptsDir)
  if (!caps.includes(CAPABILITIES.assignRoles)) return refuse('newer_plugin', newerPlugin(CAPABILITIES.assignRoles))
  const developer = roles?.developer?.trim(), checker = roles?.checker?.trim()
  if (!developer && !checker) return refuse('nothing_to_assign', 'Name a builder or a checker to assign.')
  for (const h of [developer, checker]) if (h && !HANDLE.test(h)) return refuse('not_a_handle', `'${h}' is not a roster handle.`)
  const args = ['assign', ...(developer ? ['--developer', developer] : []), ...(checker ? ['--checker', checker] : []), '--by', actor.name]
  return transition<AssignRolesResult>(projectPath, scriptsDir, specPath, args, (doc) => ({
    ...(typeof doc.developer === 'string' ? { developer: doc.developer } : {}),
    ...(typeof doc.checker === 'string' ? { checker: doc.checker } : {}),
  }))
}
