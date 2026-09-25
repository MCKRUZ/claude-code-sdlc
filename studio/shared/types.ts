// Types shared between the main process and the renderer. This file MUST stay pure
// (interfaces/types only, no `node:*` imports, no runtime code) — it's included directly
// in BOTH tsconfig.json (renderer) and tsconfig.node.json (main/preload), which are
// otherwise separate TypeScript projects with no built .d.ts output to reference each
// other through.

export interface ConsoleEntry {
  id: string
  command: string
  args: string[]
  cwd: string
  startedAt: string
  durationMs: number
  exitCode: number | null
  stdout: string
  stderr: string
  ok: boolean
}

export interface ToolStatus {
  found: boolean
  path?: string
  version?: string
  error?: string
}

export interface ToolingReport {
  claude: ToolStatus
  uv: ToolStatus
  pluginScripts: ToolStatus
  git: ToolStatus
  gh: ToolStatus
}

export interface RecentProject {
  path: string
  name: string
  lastOpenedAt: string
}

/** Studio's per-file sync bookkeeping for one project — the ancestor is the last blob hash
 * both sides were known to agree on (spec 0009's decision 4: no scratch clone, so this lives
 * only in Studio's own settings, never in the repository itself). A file with any entry in
 * `pendingClashSections` is frozen: pull() will not advance its ancestor or write to it again
 * until every listed section is resolved. */
export interface FileSyncState {
  ancestorHash: string
  pendingClashSections?: string[]
}

export interface ProjectSyncState {
  lastPulledAt: string | null
  files: Record<string, FileSyncState>
  /** Per-document, the commit this person had already seen when they last looked — what makes
   * "changes since you last opened it" answerable (spec 0010). Keyed by repo-relative path. */
  lastSeenCommits?: Record<string, string>
  /** The exact branch THIS Studio pushed when a save fell back to a pull request. The merge
   * poller will only ever merge a pull request whose head branch equals this. Without it the
   * poller was choosing by a name search, which anyone can match. */
  pendingPrBranch?: string | null
}

export interface Settings {
  recentProjects: RecentProject[]
  claudePathOverride?: string
  uvPathOverride?: string
  pluginScriptsPathOverride?: string
  gitPathOverride?: string
  ghPathOverride?: string
  /** Keyed by project path. */
  projectSyncState?: Record<string, ProjectSyncState>
}

export interface ProjectStage {
  id: string
  name: string
  display: string
  status: string
  stage_state: 'current' | 'signed_off' | 'later'
  artifact_count: number
  entered_at: string | null
  completed_at: string | null
}

export interface ProjectStatus {
  project_name: string
  profile_id: string
  current_phase: { id: string; display: string }
  stages: ProjectStage[]
}

export interface OpenProjectResult {
  hasProject: boolean
  status?: ProjectStatus
  entry?: ConsoleEntry
  error?: string
}

export interface SetupPlan {
  already_exists: boolean
  directories: string[]
  files: string[]
}

export interface PreviewSetupResult {
  plan?: SetupPlan
  entry?: ConsoleEntry
  error?: string
}

export interface RunSetupResult {
  ok: boolean
  entry?: ConsoleEntry
  error?: string
}

// --- Repository sync (spec 0009) ---------------------------------------------------------

export interface ConnectionInfo {
  repo: string
  branch: string
  localFolder: string
  /** The signed-in code-host account (`gh api user`), or null when unknown/unauthenticated. */
  account: string | null
  lastPulledAt: string | null
  /** Best-effort display only (a `gh api .../rulesets` probe) — the actual gate is always
   * "did the direct push get rejected," never this value. See sync.ts. */
  branchProtected: boolean | null
}

export interface ArrivedChange {
  path: string
  author: string
  when: string
}

/** One clashing section within one document. `key` is the section's heading for a plain
 * section, `heading#<number>` for a repeating block instance, or `__whole_file__` for an
 * unshaped document (or one whose headings no longer match its shape) — see document_shape_cli
 * and spec 0007's own free-text fallback, which this mirrors rather than special-cases. */
export interface ClashSection {
  key: string
  heading: string
  localText: string
  remoteText: string
}

export interface FileClash {
  path: string
  sections: ClashSection[]
}

export interface PullResult {
  ok: boolean
  mergedFiles: string[]
  clashes: FileClash[]
  arrivedChanges: ArrivedChange[]
  entries: ConsoleEntry[]
  error?: string
}

export type ClashChoice = 'local' | 'remote' | 'combined'

export interface ResolveClashResult {
  ok: boolean
  /** True once every clash in this file is resolved — that's when the file's ancestor
   * advances and it becomes eligible to be included in the next save(). */
  fileFullyResolved: boolean
  entry?: ConsoleEntry
  error?: string
}

export type SaveOutcome = 'pushed_directly' | 'opened_pull_request' | 'merged_pull_request'

export interface SaveResult {
  ok: boolean
  outcome?: SaveOutcome
  prUrl?: string
  entries: ConsoleEntry[]
  error?: string
}

// --- Documents (spec 0010) ---------------------------------------------------------------

/** One field inside a section, as the shape library describes it. `value` is the current text;
 * `start`/`end` are JS string indices into the document (sectionMerge converts the CLI's byte
 * offsets at the boundary). A field the shape declares but the document does not contain is
 * `null` in `DocumentSection.fields` — there is no span to point at. */
export interface DocumentField {
  label: string
  value: string
  start: number
  end: number
  /** Metadata for rendering, straight from the shape: text | longtext | enum | boolean |
   * number | date | checklist | table. The library never interprets it. */
  type: string
  required: boolean
  anchor: string
  empty: boolean
  guidance?: string
  enumValues?: string[]
}

/** One addressable piece of a document. `kind: 'free_text'` is anything the shape did not
 * recognise — shown in place, never hidden and never dropped, which is the whole promise of
 * the shape library. */
export interface DocumentSection {
  kind: 'section' | 'repeating_instance' | 'free_text'
  /** Stable address used for edits: the heading, `heading#<number>` for a repeating instance,
   * or `free_text@<start>`. */
  key: string
  heading: string
  start: number
  end: number
  text: string
  /** null for a field the shape declares but this document does not carry. */
  fields: Record<string, DocumentField | null>
  /** Set on a repeating instance, e.g. 3 for FR-003. */
  number?: number
}

export interface OpenDocumentResult {
  ok: boolean
  path: string
  /** False when the document's headings no longer match its shape, or it has no shape at all —
   * the whole document then arrives as a single free_text section, per spec 0007's own
   * unconditional fallback. Reading still works; only field-level editing is unavailable. */
  shaped: boolean
  /** Why it is unshaped, when it is — the shape library's own warnings, verbatim. */
  warnings: string[]
  description?: string
  sections: DocumentSection[]
  error?: string
}

/** A change that arrived from someone else since this person last opened the document. */
export interface DocumentChange {
  author: string
  when: string
  /** The commit message — the "why". */
  reason: string
}

export interface StageDocument {
  name: string
  path: string
  exists: boolean
  shaped: boolean
  description?: string
  findingCount: number
  ready: boolean
}

export interface ReadinessFinding {
  path: string
  section: string
  field: string | null
  reason: string
  /** Where to jump to in the document. Absent when the field is missing entirely — the caller
   * falls back to the section. */
  start?: number
  end?: number
}

export interface StageReadiness {
  ok: boolean
  stageId: string
  display: string
  description?: string
  isCurrent: boolean
  documents: StageDocument[]
  findings: ReadinessFinding[]
  /** Exit-gate conditions no check can answer — questions for whoever signs off. */
  judgementConditions: string[]
  signOff: {
    status: string
    signedOffBy: string | null
    completedAt: string | null
  }
  ready: boolean
  error?: string
}

export interface DocumentVersion {
  n: number
  hash: string
  event: string
  when: string
  actor: string
  /** The commit-style reason, joined from the change ledger — `version list` alone drops it. */
  reason: string
  /** False when the version exists in metadata but its bytes are not on this machine (the
   * object store is local and gitignored). Showing or restoring it is then unavailable. */
  present: boolean
  restoredFrom?: number
}

export interface RestorePreview {
  ok: boolean
  /** Echoed back to confirm — proves the person saw this exact diff before it is applied. */
  diffHash: string
  diff: string
  /** True when the artifact is signed off, so confirming needs an explicit acknowledgement. */
  needsSignOffAck: boolean
  error?: string
}

export type DraftOutcome = 'accepted' | 'edited' | 'discarded'

export interface DraftResult {
  ok: boolean
  text?: string
  error?: string
}

/** Pushed to the renderer as sync activity happens, so the Header pill (spec 0009's "sync
 * indicator on every screen") updates live rather than only after a full pull/save
 * completes. */
export type SyncState =
  | { kind: 'idle'; lastPulledAt: string | null }
  | { kind: 'pulling' }
  | { kind: 'saving' }
  | { kind: 'clashes'; count: number }
  | { kind: 'waitingForApproval'; approver: string }
  | { kind: 'waitingForChecks' }
  | { kind: 'error'; message: string }

/** The ONLY surface the renderer gets — see electron/preload/index.ts. Both the preload
 * script's implementation and the renderer's `window.studio` typing point at this one
 * interface, so they can never silently drift apart. */

// --- Handing a spec to a developer (spec 0011) -----------------------------------------

export type RefusalKind =
  | 'not_ready'
  | 'unknown_developer'
  | 'developer_is_checker'
  | 'team_at_limit'
  | 'other'

export interface HandoffRefusal {
  kind: RefusalKind
  message: string
}

export interface HandoffResult {
  ok: boolean
  refusal?: HandoffRefusal
  branch?: string
  developer?: string
  checker?: string | null
  prUrl?: string | null
  /** The local hand-off succeeded but the code host could not be told. Reported, never
   * fatal — the branch and the commit are real either way, and hiding this would leave
   * someone waiting for a review request that was never sent. */
  assignmentError?: string | null
  alreadyInFlight?: boolean
}



/** One spec's full status, as the plugin reads it from the pull request. Every field comes
 * from the code host; Studio computes none of it. */
export interface SpecStatusCheck {
  name: string
  status: string | null
  conclusion: string | null
}

export interface SpecStatusVerdict {
  check: string
  covered: string
  reason: string
}

export interface SpecStatus {
  spec: string
  branch: string
  code_host_available: boolean
  /** Present only when the code host could not be reached — then `local_status` is what the
   * spec file itself says, which is the honest fallback, never "not started". */
  error?: string
  local_status?: string
  pull_request: {
    number: number
    url: string
    state: string
    merged_at: string | null
    checks: SpecStatusCheck[]
    grader_ran: boolean
    verdicts: SpecStatusVerdict[] | null
    verdict_error: string | null
    security_review: { conclusion: string | null } | null
    approvals: Array<{ by: string | null; at: string | null }>
    waiting_on: string
  } | null
}


/** One Definition-of-Ready finding about a SPEC, exactly as the plugin's protected checker
 * produced it. Studio never writes one of these itself.
 *
 * Distinct from `ReadinessFinding`, which spec 0010 uses for a field a STAGE still needs.
 * Two different questions; sharing a name would make them look like one. */
export interface SpecReadinessFinding {
  check: string
  passed: boolean
  severity: string
  message: string
}

export interface SpecReadiness {
  ok: boolean
  error?: string
  spec: string
  risk: string
  status: string
  /** True only when nothing MUST-level is outstanding — the same rule the hand-off applies,
   * read from the same source so the screen and the command cannot disagree. */
  ready: boolean
  blocking: SpecReadinessFinding[]
  /** Shown, never blocking — including the vague-acceptance-check lint. That is the
   * checker's own contract, not Studio's choice. */
  advisory: SpecReadinessFinding[]
  passed: SpecReadinessFinding[]
}


/** The outcome of marking a spec ready or changing its risk tier. A refusal carries the
 * plugin's own message — Studio has no rule of its own here to explain. */
export interface SpecTransitionResult {
  ok: boolean
  changed?: boolean
  message?: string
  /** What the change means beyond what it did — notably whether it reached the repository, so
   * a person is never left thinking a change everybody can see is one only they can. */
  note?: string
  refusal?: { kind: string; message: string }
}


// --- Project settings (spec 0012) -------------------------------------------------------

/** Every section carries the FILE it came from: spec 0012 asks each settings screen to name
 * where the setting is stored, because a setting whose home is invisible is one nobody can
 * correct outside the app.
 *
 * `present: false` means the project has not adopted this setting — ordinary, not broken.
 * Errors mean the file exists and is wrong. Those two send a person to different places, so
 * the screen must never merge them. */
export interface SettingsSection {
  file: string
  present: boolean
  errors: string[]
}

export interface RosterPerson {
  handle: string
  name?: string
  team?: string
  roles?: string[]
  signs_off?: string[]
}

export interface TeamLimit {
  team: string
  wip_limit: number
  in_flight: number
  at_limit: boolean
  over_limit: boolean
  review_alarm_hours?: number
  security_alarm_hours?: number
}

export interface ApprovalStage {
  stage: string
  approval_required?: boolean
  approver?: string | null
}

/** A rule a person cannot change here, with WHERE it is enforced. Every entry names real
 * code — a screen listing an unenforced rule as a fact tells someone they are protected by
 * something that is not there. */
export interface FixedRule {
  rule: string
  enforced_by: string
}

export interface ProjectSettings {
  ok: boolean
  roster: SettingsSection & { teams: Array<{ name: string; lead: string }>; people: RosterPerson[] }
  wip_limits: SettingsSection & { teams: TeamLimit[] }
  approval: SettingsSection & { stages: ApprovalStage[] }
  fixed_rules: FixedRule[]
}

/** The outcome of changing a setting. A refusal carries the plugin's own message and kind —
 * Studio has no rule of its own to explain here. `file` names what changed, so the screen
 * can offer to commit exactly that and nothing else. */
export interface SettingChangeResult {
  ok: boolean
  changed?: boolean
  message?: string
  note?: string
  file?: string
  refusal?: { kind: string; message: string }
}

/** One answered question about whether this project is wired up.
 *
 * `state` is three-valued on purpose. "unknown" means the check could not look — which is a
 * real answer, and a different one from "no". Reporting "no" for something unmeasured sends a
 * person to fix what was never broken. */
export interface ConnectionCheck {
  check: string
  question: string
  state: 'yes' | 'no' | 'unknown'
  detail: string
}

export interface ConnectionReport {
  ok: boolean
  checks: ConnectionCheck[]
  /** Pipelines deliberately not expected of every project, each with its reason — so the
   * screen can explain an absence rather than implying it is a gap. */
  not_universally_expected: Record<string, string>
}

// --- The three read-only views (spec 0013) ---------------------------------------------

/** The steering scorecard, exactly as the plugin computes it.
 *
 * A rate is `null` when nothing has happened to compute it from — NOT zero. The distinction
 * is the whole point: "nobody has merged anything yet" and "everything merged was rejected"
 * are opposite situations, and a zero would show them identically. Studio performs no
 * arithmetic on these; every number is the plugin's.
 *
 * Counts stay numeric because a count of zero is a true statement about a real quantity. */
export interface Scorecard {
  accepted_as_is_rate: number | null
  review_wait_median_hours: number | null
  /** On its own line, never folded into the general figure — spec 0013 asks for that
   * explicitly, because a slow security review hidden inside an average is a slow security
   * review nobody acts on. */
  security_review_wait_median_hours: number | null
  rework_revert_rate: number | null
  bounce_back_rate: number | null
  escaped_bugs: Array<{
    /** The check that should have caught it, and what to do about that — the retro input,
     * not just a bug count. */
    which_check?: string
    proposed_fix?: string
    summary?: string
    [key: string]: unknown
  }>
  dora: {
    deploy_count: number
    lead_time_median_hours: number | null
    change_fail_rate: number | null
    time_to_recover_median_hours: number | null
  }
  totals: { merges: number; reverts: number; bounces: number }
}

/** One gate, as the rails guide describes it and as this project actually has it. */
export interface GateEntry {
  gate: string
  file: string
  fires_on: string
  blocks: string
  optional: boolean
  /** installed — described and present. missing — the playbook ships it, this project does
   * not run it. not_a_pipeline — a local gate that cannot be confirmed from the repository
   * alone, so calling it missing would be a false alarm. */
  state: 'installed' | 'missing' | 'not_a_pipeline'
  detail: string
}

export interface GateInventory {
  ok: boolean
  /** Which copy of the guide was read — the project's own wins over the playbook's. */
  guide_source: string | null
  gates: GateEntry[]
  unexpected: Array<{ file: string; detail: string }>
  bypass_ledgers: Array<{ file: string; gate: string; present: boolean }>
  error: string | null
}

/** One document Foundation was meant to hand to Build.
 *
 * `sections` is read from the file itself, not from a list in the application — spec 0013 asks
 * for exactly that, because a written-in list looks right the day it is written and stops
 * matching the moment a template changes.
 *
 * A document that does not exist is still listed, with a note. A Build that opened without a
 * risk-tier map is a real situation, and a quietly shorter list would hide it. */
export interface FoundationDocument {
  name: string
  path: string
  exists: boolean
  sections: string[]
  note: string | null
}

export interface FoundationSummary {
  ok: boolean
  error: string | null
  stage: { id: string; display: string; description: string } | null
  documents: FoundationDocument[]
}

// --- Declaring Build finished (spec 0014) ----------------------------------------------

/** One thing standing between this project and a declaration.
 *
 * It carries its ITEMS, not just a count. A refusal a person cannot act on is a wall; one that
 * lists the specs and who is building each is a to-do list. */
export interface DeclarationBlocker {
  kind: 'unfinished_specs' | 'deferred_without_reason' | 'specs_with_no_team'
    | 'unconfirmed_teams' | string
  count: number
  message: string
  specs?: Array<{
    spec: string
    name: string
    status: string
    team?: string
    developer?: string | null
    risk?: string
    reason?: string
  }>
  teams?: string[]
}

export interface DeclarationStatus {
  ok: boolean
  can_declare: boolean
  /** Every problem at once, never just the first — somebody ending a phase wants the list. */
  blockers: DeclarationBlocker[]
  unfinished: Array<{ spec: string; name: string; status: string; team: string; developer: string | null; risk: string }>
  deferred: Array<{ spec: string; name: string; team: string; reason: string }>
  teamless: Array<{ spec: string; name: string; status: string }>
  teams_in_list: string[]
  totals: { specs: number; unfinished: number; deferred: number }
}

/** The outcome of producing the hand-over document (spec 0014).
 *
 * `wroteLocally` exists because the two halves fail separately and a person needs to know
 * which one they have: a document written here but not saved is not a hand-over document at
 * all, since the whole point is that somebody else reads it.
 */
export interface HandoffReportResult {
  ok: boolean
  path?: string
  /** The generator refused rather than overwrite a report somebody has already edited. */
  alreadyExists?: boolean
  /** The document was written on this machine but did not reach the repository. */
  wroteLocally?: boolean
  note?: string
  error?: string
}

export interface DeclarationResult {
  ok: boolean
  declared_by?: string
  deferred?: Array<{ spec: string; name: string; team: string; reason: string }>
  message?: string
  /** What still has to happen, said plainly: this reports that a declaration is PERMITTED and
   * does not advance the phase, because that transition already has an owner. */
  next_step?: string
  refusal?: { kind: string; message: string }
}

export interface StudioApi {
  detectTooling(): Promise<ToolingReport>
  getSettings(): Promise<Settings>
  setToolOverride(kind: 'claude' | 'uv' | 'pluginScripts' | 'git' | 'gh', path: string): Promise<Settings>

  pickFolder(): Promise<string | null>
  hasSdlcProject(projectPath: string): Promise<boolean>
  openProject(projectPath: string): Promise<OpenProjectResult>

  listProfiles(): Promise<string[]>
  previewSetup(projectPath: string, profileId: string): Promise<PreviewSetupResult>
  runSetup(projectPath: string, profileId: string): Promise<RunSetupResult>

  getConnectionInfo(projectPath: string): Promise<ConnectionInfo>
  pull(projectPath: string): Promise<PullResult>
  resolveClash(
    projectPath: string,
    filePath: string,
    sectionKey: string,
    choice: ClashChoice,
    combinedText?: string,
  ): Promise<ResolveClashResult>
  /** Commit and push the project's changed documents.
   *
   * `actor` is what records a version against a person — without it the save still happens
   * but the history cannot answer "who changed this", which is most of the point of having
   * one. `onlyPath` narrows the commit to a single file, so one deliberate change does not
   * sweep up whatever else happened to be edited. */
  save(
    projectPath: string,
    changeNote: string,
    options?: { actor?: string; onlyPath?: string },
  ): Promise<SaveResult>
  onSyncState(callback: (state: SyncState) => void): () => void
  getPendingClashes(projectPath: string): Promise<FileClash[]>
  combineWithClaude(projectPath: string, localText: string, remoteText: string): Promise<{ combined: string } | { error: string }>

  // --- Documents (spec 0010) ---
  getStageReadiness(projectPath: string, stageId?: string): Promise<StageReadiness>
  openDocument(projectPath: string, relPath: string): Promise<OpenDocumentResult>
  /** Changes by other people since this person last opened the document. Marking it seen is a
   * separate, explicit call so merely listing changes never clears them. */
  getDocumentChanges(projectPath: string, relPath: string): Promise<DocumentChange[]>
  markDocumentSeen(projectPath: string, relPath: string): Promise<void>
  /** Writes one field through the shape library. Saving to the repository is a separate step
   * (spec 0009's save), so an edit is local until the person chooses to save it. */
  setField(projectPath: string, relPath: string, sectionKey: string, label: string, value: string): Promise<OpenDocumentResult>
  nextNumber(projectPath: string, relPath: string): Promise<{ ok: boolean; id?: string; number?: number; error?: string }>
  addInstance(projectPath: string, relPath: string, title: string): Promise<OpenDocumentResult>

  listVersions(projectPath: string, relPath: string): Promise<DocumentVersion[]>
  getVersionText(projectPath: string, relPath: string, ref: string): Promise<{ ok: boolean; text?: string; error?: string }>
  diffVersions(projectPath: string, relPath: string, a: string, b: string): Promise<{ ok: boolean; diff?: string; error?: string }>
  previewRestore(projectPath: string, relPath: string, ref: string): Promise<RestorePreview>
  confirmRestore(projectPath: string, relPath: string, ref: string, actor: string, diffHash: string, ackSignOff: boolean): Promise<{ ok: boolean; error?: string }>

  /** Every spec, with live pull-request state, in ONE code-host request. Fetched once; the
   * board filters and groups what it already has, because switching a role view must not
   * re-read the repository (spec 0011). */
  getBoard(projectPath: string): Promise<Board>
  /** Every project setting and the file that owns it. Read-only. */
  getProjectSettings(projectPath: string): Promise<ProjectSettings>
  /** Whether this project is actually wired up — signed in, readable, able to open pull
   * requests, and holding every check its playbook expects. Read-only. */
  getConnectionReport(projectPath: string): Promise<ConnectionReport>
  /** The steering scorecard. Studio renders it and computes nothing. */
  getScorecard(projectPath: string, windowDays: number): Promise<Scorecard | null>
  /** Every gate a change must pass, against what this project actually has. */
  getGateInventory(projectPath: string): Promise<GateInventory>
  /** What Foundation handed to Build, read from those documents. */
  getFoundationSummary(projectPath: string): Promise<FoundationSummary>
  /** What stands between this project and declaring Build finished. Read-only. */
  getDeclarationStatus(projectPath: string, confirmedTeams: Record<string, string>):
    Promise<DeclarationStatus>
  /** Refuse, or report that a declaration is permitted. Refuses in the PLUGIN. */
  declareComplete(projectPath: string, declaredBy: string, confirmedTeams: Record<string, string>):
    Promise<DeclarationResult>
  /** Defer one spec with a reason. The plugin refuses an empty or token reason. */
  deferSpec(projectPath: string, specPath: string, reason: string, actor?: string):
    Promise<SpecTransitionResult>
  /** Produce the hand-over document through the plugin's own generator, and save it. */
  generateHandoffReport(
    projectPath: string,
    options?: { actor?: string; replaceExisting?: boolean },
  ): Promise<HandoffReportResult>
  /** Save a document the person has already seen.
   *
   * Takes the TEXT rather than fetching anything, deliberately: spec 0013 asks an export to
   * contain exactly what is on screen, and a second fetch could return something else. The
   * person chooses the location through a save dialog — the one way Studio writes outside a
   * project folder, and only ever because somebody pointed at the place. */
  exportDocument(suggestedName: string, contents: string):
    Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>
  /** Add or update someone in the roster. The PLUGIN validates the whole roster first and
   * refuses a change that would break it. Writes the file only; committing is a separate,
   * deliberate save. */
  setRosterPerson(
    projectPath: string, handle: string,
    fields: { name?: string; team?: string; roles?: string[]; signsOff?: string[] },
  ): Promise<SettingChangeResult>
  setTeamLimit(projectPath: string, team: string, limit: number): Promise<SettingChangeResult>
  setStageApproval(projectPath: string, stage: string, required: boolean, approver?: string):
    Promise<SettingChangeResult>
  /** One spec in full. NOTE: this is the plugin's per-spec call, which records
   * `status: merged` if the pull request has merged since anyone last looked — a read
   * that can commit, stated here rather than discovered. */
  getSpecReadiness(projectPath: string, specPath: string): Promise<SpecReadiness>
  /** Mark a spec ready. Refused by the PLUGIN unless it actually is. */
  markSpecReady(projectPath: string, specPath: string): Promise<SpecTransitionResult>
  /** Change a spec's risk tier. Raising is free; lowering is refused without a named
   * person, and that name is written into the spec. */
  setSpecRisk(projectPath: string, specPath: string, tier: string, authorisedBy?: string):
    Promise<SpecTransitionResult>
  getSpecStatus(projectPath: string, specPath: string):
    Promise<{ ok: boolean; status?: SpecStatus; error?: string }>
  /** Hands a spec to a developer through the plugin's own command. Every rule about who may
   * be handed what lives there; a refusal comes back with a `kind` so the window knows what
   * to offer next, without reading the refusal's English. */
  handOff(projectPath: string, specPath: string, developer: string, overLimitReason?: string):
    Promise<HandoffResult>

  draftField(projectPath: string, relPath: string, sectionKey: string, label: string, guidance: string): Promise<DraftResult>
  recordDraftOutcome(
    projectPath: string, relPath: string, label: string, outcome: DraftOutcome,
    actor: string, charsOffered: number, charsKept: number, instance?: string,
  ): Promise<void>

  getConsoleLog(): Promise<ConsoleEntry[]>
  onConsoleEntry(callback: (entry: ConsoleEntry) => void): () => void
}

// --- The Build board (spec 0011) ------------------------------------------------------

/** Which view of the board is showing. `needs-me` is the one it opens on, because the
 * spec's constraint is not writing code but knowing what is waiting to be checked and on
 * whom. */
export type BoardRole = 'needs-me' | 'owner' | 'developer' | 'checker' | 'everything'

export type BoardGrouping = 'none' | 'epic' | 'team' | 'person'

export interface BoardFilters {
  role: BoardRole
  search?: string
  team?: string
  risk?: string
  status?: string
}

/** One spec's live pull request, as the plugin's bulk status call reports it.
 *
 * `waitingOn` is a sentence for a person to read. `waitingOnHandle` is the same fact as
 * data, and is what the board compares against — pattern-matching the sentence would break
 * the first time its wording improved. It is null whenever nobody in particular is blocking
 * (CI, the grader, an unclaimed review), which is a real answer, not a missing one. */
export interface BoardPullRequest {
  number: number
  url: string
  state: string
  mergedAt: string | null
  updatedAt: string | null
  waitingOn: string
  waitingOnHandle: string | null
}

/** One row. Everything but `pullRequest` comes from the spec file itself, so a row is
 * complete and useful before the code host answers — or when it never does. */
export interface BoardRow {
  spec: string
  name: string
  path: string
  title: string
  status: string
  risk: string
  team: string
  channel: string
  owner: string
  developer: string
  checker: string
  branch: string
  epic?: string
  pullRequest: BoardPullRequest | null
  /** Set only when the spec file itself could not be read — the row is still shown, saying
   * so, rather than silently dropped. */
  error?: string
}

export interface Board {
  rows: BoardRow[]
  /** False when the live half is missing. The rows are still here: an empty board would
   * read as "there is no work", which is a different claim. */
  codeHostAvailable: boolean
  error: string | null
  /** Per-team work-in-progress limits, or null for a project that has not adopted them. */
  teamLimits: Record<string, { in_flight: number; wip_limit: number }> | null
}
