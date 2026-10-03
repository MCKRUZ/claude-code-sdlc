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
  /** True only for an interim broadcast of a command that is still running — never present on
   * an entry in getConsoleLog()'s own list, which holds finished commands only. Lets the
   * console show a long-running command (spec 0016's chat turns) as it happens rather than
   * only once it exits, without changing what a finished entry looks like. */
  pending?: boolean
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
 * until every listed section is resolved.
 *
 * `ancestorHash` is absent for a file Studio has never seen the two sides agree on: it exists
 * here and on the remote, they differ, and nobody can say which is newer. That is a clash like
 * any other and is saved as one; it just has no shared version to compare against, which a
 * whole-file clash does not need. */
export interface FileSyncState {
  ancestorHash?: string
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
  /** Who opened the draft above, and which files it covers. Set together with
   * pendingPrBranch, cleared together with it (merged, landed directly, or found closed
   * without merging). Spec 0010: while a draft waits for approval, only the person who
   * opened it may change it — everyone else is refused with a clear reason. */
  pendingDraftOwner?: string | null
  pendingDraftFiles?: string[]
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
  /** Keyed by `${projectPath}\u0000${stageId}` — spec 0016's chat transcripts. Local-only, by
   * Matt's resolved decision (Decision List): a chat transcript never syncs to the repository,
   * matching how a pending draft already behaves. */
  chatState?: Record<string, ChatState>
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
  /** Who signed this stage off, as the plugin recorded it. Null means NOT RECORDED — a stage
   * advanced before sign-offs existed, or advanced without a name — which is a different and
   * equally real thing from a stage nobody signed. Never render a null as a blank signature. */
  signed_off_by: string | null
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
  /** When this machine's copy of the file was last saved (ISO). Absent if it could not be read. */
  localModifiedAt?: string
  /** The last change to the remote's copy: who, when (ISO), and their own words for why. Absent if
   * the file has no history on the remote yet. Lets a person see which version is newer. */
  remote?: { author: string; when: string; subject: string }
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
  /** True for a section the person added that the template never had. It is still editable —
   * as one whole-body field — but is not part of what the phase gate checks. */
  custom?: boolean
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
  /** The installed plugin is older than this Studio expects, so parts of the document may show
   * less than they could (for example a section the person added shown as text rather than an
   * editable field). Nothing is broken — the fix is `claude plugin update`. */
  pluginBehind?: boolean
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
  /** A folder of documents (Design's `adrs/`), not one document. It is listed and its
   * completeness reported, but it has no single shape and cannot be opened as a document. */
  folder: boolean
  shaped: boolean
  description?: string
  findingCount: number
  ready: boolean
}

/** Where a readiness item wants the reader taken. The finding already carries this; what was
 * missing was anything to carry it TO — the stage home rendered a count and dropped the list,
 * so the join from "what is missing" to "the field it refers to" existed and was never seen. */
export interface DocumentFocus {
  /** The section as the plugin reported it — matched loosely, since a repeating instance is
   * reported by its trailing part rather than the whole heading. */
  section: string
  /** null when the shape declares the field but the document does not carry it at all. */
  field: string | null
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

/** What the plugin can say about a sign-off question. A pre-check, never a verdict: `looks_met`
 * means what a check can see is in order and the person still confirms; `judgement` means nothing
 * here can check it. */
export type HintStatus = 'looks_met' | 'not_yet' | 'judgement'

export interface SignOffQuestion {
  /** What a confirmation is recorded against. Empty when the installed plugin predates
   * confirmations, in which case the question is shown but cannot be ticked. */
  id: string
  text: string
  hint: { status: HintStatus; detail: string }
  confirmation: { actor: string; ts: string } | null
}

/** One optional thing a person can do in a stage, as `stage_readiness.py` reports it (spec 0023):
 * the plugin declares the list and computes the status, Studio only draws it (spec 0024). */
export type ActivityKind = 'run' | 'create' | 'check' | 'draft' | 'talk'
export type ActivityStatus = 'done' | 'available' | 'blocked'

export interface StageActivity {
  id: string
  label: string
  /** The slash command this belongs to (commands/<command>.md), or null. */
  command: string | null
  kind: ActivityKind
  optional: boolean
  /** Repo-relative files a `create` activity starts from templates. */
  creates: string[]
  after: string[]
  status: ActivityStatus
  /** A plain sentence when `blocked`, otherwise null. */
  reason: string | null
}

/** What starting a `create` activity did: which files it wrote and which already existed (and
 * were left exactly as they were). `opened` is the file the editor should open first. */
export interface StartActivityResult {
  ok: boolean
  created: string[]
  existing: string[]
  opened?: string
  error?: string
}

/** The result of one of the two checks the Workflow tab can run (spec 0024). `has_data` false
 * is "nothing to check yet" and never reads as "no problems" or as a zero count. */
export type ActivityCheckResult =
  | { ok: false; error: string }
  | {
      ok: true
      check: 'rules-check'
      hasData: boolean
      notes: string[]
      findings: Array<{ subject: string; message: string }>
    }
  | {
      ok: true
      check: 'data-check'
      hasData: boolean
      notes: string[]
      fieldCount: number
      piiCount: number
      piiFields: string[]
      riskImplication: string | null
    }

/** One stage report the plugin wrote (generate_phase_report.py --json). `output` is a path inside the
 * project's .sdlc/reports/. */
export interface PhaseReportEntry {
  phase: string
  phaseName: string
  output: string
  found: number
  missing: number
  total: number
  /** Filenames of the stage's documents that were not present, in the stage's declared order. */
  missingNames: string[]
}

export interface PhaseReportResult {
  ok: boolean
  error?: string
  /** One entry for a single stage, one per stage for "all". */
  reports: PhaseReportEntry[]
  /** The index page `--all` writes. */
  index?: string
}

export interface IntakeDocument {
  id: string
  file: string
  type: string
  tokens: number
  skipped: boolean
  /** Position in the priority order, or null when none was set. */
  priority: number | null
}

/** The reference-document catalogue (intake_documents.py --json). `locked` means the DOC-NNN ids
 * are frozen and the script refuses further skip / priority / rescan changes. */
export interface IntakeCatalogue {
  ok: boolean
  error?: string
  documents: IntakeDocument[]
  locked: boolean
  priorityOrder: string[]
  totals: { documents: number; estimatedTokens: number; activeDocuments: number }
}

/** What to change in the catalogue in one call; omit everything to just (re)read it. */
export interface IntakeChange {
  skip?: string[]
  priority?: string[]
  lock?: boolean
}

export interface NarrativeArtifact {
  name: string
  /** "present" when a .narrative.md companion exists, otherwise "none". */
  status: 'none' | 'present'
  /** True/false when it could be judged, null when it could not (no git history). */
  stale: boolean | null
}

/** Which of a stage's documents have a plain-language summary (narrative_status.py --json).
 * `hasData` false is "no documents in this stage yet" and never reads as "0 of 0". */
export interface NarrativeCoverage {
  ok: boolean
  error?: string
  hasData: boolean
  notes: string[]
  withNarrative: number
  total: number
  artifacts: NarrativeArtifact[]
}

/** The standing picture of review findings (record_findings.py report --json). */
export interface ReviewStanding {
  ok: boolean
  error?: string
  tracked: number
  openDebt: number
  fixedClaimMismatches: number
}

/** `record_findings.py report --strict`: exit 2 is a RESULT (a finding marked fixed whose file
 * never changed), so it arrives here as ok:true with a count, not as an error. */
export interface StrictCheckResult {
  ok: boolean
  error?: string
  mismatches: number
}

/** A stage's own guidance file from the plugin (its `definition`), as text. */
export interface StageGuide {
  ok: boolean
  markdown?: string
  error?: string
}

export interface StageReadiness {
  ok: boolean
  stageId: string
  /** Absent from a plugin that predates activities (spec 0023): then nothing extra is drawn. */
  activities?: StageActivity[]
  /** The plugin's phase definition path, relative to the plugin root (e.g. "phases/00-discovery.md"). */
  definition?: string | null
  /** The plugin's own warnings about this stage's readiness (e.g. a broken activities declaration). */
  warnings?: string[]
  /** What the installed plugin says it can do (generate_status.py --json); absent from a plugin
   * that predates it. Used to disable a control with a reason instead of letting it fail. */
  capabilities?: string[]
  /** The registry's own phase name (e.g. "discovery"), not the human-facing `display`. */
  name: string
  display: string
  description?: string
  isCurrent: boolean
  documents: StageDocument[]
  findings: ReadinessFinding[]
  /** The exit-gate questions no file check can answer, for whoever signs off — each with what
   * the software could see about it and who, if anyone, has already confirmed it. */
  judgement: SignOffQuestion[]
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

// --- Chat authoring (spec 0016) ---------------------------------------------------------
//
// A real, multi-turn `claude` conversation drives a stage's documents. Two structural rules
// carry every acceptance check in the spec:
//
//  * A write is never applied on arrival — a ChatProposal is a PROPOSAL, exactly like
//    FieldEditor's own draft. It reaches disk only through documents.setField, and its outcome
//    (whatever it is) is recorded through drafts.recordDraftOutcome — the same write path and
//    the same ledger spec 0010 built, never a second one of either.
//  * A structured question is a real tool call the driver parses structurally
//    (ChatQuestion.options), never free text pattern-matched out of the model's prose.

export interface ChatProposal {
  id: string
  document: string
  section: string
  field: string
  value: string
  /** Set once the person decides. Absent means still waiting on them. */
  outcome?: DraftOutcome
}

export interface ChatQuestion {
  id: string
  question: string
  options: string[]
  /** The option label the person picked, once they have. Absent means still waiting. */
  answeredWith?: string
}

export type ChatMessageRole = 'assistant' | 'user' | 'subagent'

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  text: string
  /** Every structured, multiple-choice question this message asked — rendered as selectable
   * options, never as prose the person has to answer by typing. A single reply may call
   * AskStructuredQuestion more than once; each call is its own entry here rather than the
   * later ones silently overwriting the earlier, so every question the model actually asked
   * is surfaced and answerable. Empty (never undefined) when the message asked none. */
  questions: ChatQuestion[]
  /** Every document write this message proposed. Same reasoning as `questions`: a reply that
   * calls ProposeWrite more than once gets one card per call, each independently
   * accept/edit/discard-able and independently recorded to the draft ledger — never just the
   * last call's proposal, with the earlier ones' MCP acknowledgement having no card to show
   * for it. Empty (never undefined) when the message proposed none. */
  proposals: ChatProposal[]
  /** Which of the plugin's real discipline sub-agents produced this message, when
   * role is 'subagent' — e.g. "claude-code-sdlc:discovery-analyst". This is the sub-agent's
   * OWN output, forwarded by the CLI (`--forward-subagent-text`), never a paraphrase Studio
   * wrote. */
  subagentType?: string
  at: string
}

/** One stage's chat conversation, as Studio persists it locally (never synced — see the
 * spec's Decision List). `sessionId` is what ties consecutive `claude` processes into one
 * conversation via --resume; null before the first turn has run. */
export interface ChatState {
  sessionId: string | null
  messages: ChatMessage[]
}

export interface ChatTurnResult {
  ok: boolean
  state: ChatState
  error?: string
}

// --- Pipeline evidence (Foundation) --------------------------------------------------------

/** How a delivery rail stands, as pipeline_proof.py classifies it from GitHub's own history.
 * NO_DATA is its own state on purpose: a local hook GitHub cannot see, or a history that could
 * not be read, is never reported as "never fired" or as a zero. */
export type PipelineRailStatus = 'PROVEN' | 'RAN_UNPROVEN' | 'NEVER_FIRED' | 'BROKEN' | 'NO_DATA'

export interface PipelineEvidenceLink {
  label: string
  url: string
}

export interface PipelineRail {
  rail: string
  status: PipelineRailStatus
  reason: string
  /** Null when the history could not be read — never a fabricated zero. */
  runs: number | null
  red: number | null
  evidence: PipelineEvidenceLink[]
}

export interface PipelineProofNeeded {
  rail: string
  proof: string
  touches: string
}

export interface PipelineEvidenceResult {
  ok: boolean
  error?: string
  repo?: string
  gatheredAt?: string
  rails: PipelineRail[]
  proofsNeeded: PipelineProofNeeded[]
  /** Whether GitHub is actually enforcing the required checks, and a one-line reason. */
  protection?: {
    state: 'enforcing' | 'not_enforcing' | 'none' | 'unreadable'
    detail: string
  }
  /** Merges since enforcement began that had no approval; null when that could not be known. */
  unapprovedMerges?: number | null
  /** Repo-relative path of the document the evidence was written to. */
  wrote?: string
}

/** What the model is doing mid-turn, pushed to the chat panel while a turn runs so a long wait
 * reads as progress rather than a hang. Scoped to a project + stage because turns for different
 * stages can overlap; the panel shows only the one it is on. */
export interface ChatActivity {
  projectPath: string
  stageId: string
  /** Plain words ("Reading requirements.md"), never a raw tool name. */
  label: string
}

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
  /** Each team's own alarm thresholds from cadence-plan.md, and whether the project-wide
   * median waits above compare over or under them — absent entirely on a project with no
   * cadence-plan.md, since there is nothing to compare against. The comparison itself comes
   * from the plugin (spec 0013: "the app performs no arithmetic"), never computed here from
   * review_wait_median_hours directly. `null` on either `_over_alarm` field means "no wait
   * data to compare" — never guessed as false. */
  team_alarms?: Record<string, {
    review_alarm_hours: number
    review_alarm_hours_default: boolean
    security_alarm_hours: number
    security_alarm_hours_default: boolean
    review_over_alarm: boolean | null
    security_over_alarm: boolean | null
  }>
}

/** One gate, as the rails guide describes it and as this project actually has it. */
/** Which credential the code host's review gates will sign in with.
 *
 * Reports only WHETHER one exists, never any part of its value — the plugin refuses to return
 * it and Studio has no use for it. `gates_can_sign_in: false` is the state that matters: the
 * correctness and security reviews fail closed on the pull requests they review.
 */
export interface GateAuthStatus {
  ok: boolean
  repo: string | null
  configured: Array<'subscription' | 'api-key' | string>
  gates_can_sign_in: boolean
  detail: string
}

export interface GateAuthResult {
  ok: boolean
  repo?: string
  mode?: string
  secret?: string
  /** Stated at the moment of choosing, because the cost IS the decision between the two. */
  cost?: string
  gates_can_sign_in?: boolean
  message?: string
  refusal?: { kind: string; message: string }
}

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
  /** Where this project's description of the gate disagrees with the playbook's, in both
   * their words. Reported, never resolved — a project may legitimately have adapted a gate,
   * and which copy is right is not the tool's call. Absent when they agree. */
  differs?: string
}

export interface GateInventory {
  ok: boolean
  /** Which copy of the guide was read — the project's own wins over the playbook's. */
  guide_source: string | null
  gates: GateEntry[]
  unexpected: Array<{ file: string; detail: string }>
  /** Gates the playbook expects that this project's own guide never lists — so nothing in
   * `gates` checked for them. The case reading only the project's copy cannot surface: a gate
   * dropped from the project's description simply stops being asked about. */
  not_in_project_guide?: Array<{ gate: string; file: string; blocks: string; detail: string }>
  /** Whether a comparison happened at all. Without it, "no disagreements" and "nothing was
   * compared" look identical. */
  compared_with_playbook?: boolean
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
    /** What this spec's own state already says about whether somebody has decided to finish
     * it: being_finished (in progress), needs_a_call (ready but nobody has started it), or
     * not_committed (still a draft). Derived by the plugin from what is recorded — Studio does
     * not work it out, so a screen and the command that refuses cannot disagree. */
    intent?: 'being_finished' | 'needs_a_call' | 'not_committed' | string
  }>
  teams?: string[]
  /** How many unfinished specs fall in each of those groups. */
  by_intent?: Record<string, number>
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

/** Moving the project to the next stage, which is also what records the declaration (0014).
 *
 * `advancedLocally` is the half-and-half case, kept separate for the same reason it is
 * everywhere else in this product: a stage that moved on one machine is not a stage that
 * moved, and the person needs to know which they have.
 */
export interface AdvanceResult {
  ok: boolean
  fromPhase?: string
  toPhase?: string
  signedBy?: string
  /** When the project records the declaration as having happened, read back OUT of the record.
   * Null when nothing was recorded — which is reported as such, never filled in with now. */
  declaredAt?: string | null
  advancedLocally?: boolean
  note?: string
  error?: string
}

/** What `check_gates.py` said, parsed from its text output (it has no `--json`). */
export interface GateCheckResult {
  blocked: boolean
  /** Only the MUST-severity non-compliant messages — the ones that actually block. */
  mustFailures: string[]
  /** The full text, for display when a person wants to see everything, not just the blockers. */
  raw: string
}

/** One optional discipline sign-off a person can attach to a phase sign-off — the same
 * `Discipline:Section:Name` triple `/sdlc-next` offers to capture. */
export interface DisciplineSignoff {
  discipline: string
  section: string
  by: string
}

/** Signing off a phase from Studio: check the gates, confirm every judgement question, draft and
 * validate a frozen-layer summary, snapshot the artifact record, then advance — same order
 * `/sdlc-next` follows. `stage` names exactly where it stopped, so a refusal is never a mystery. */
export type SignOffResult =
  | { ok: true; fromPhase?: string; toPhase?: string; note?: string }
  | { ok: false; stage: 'plugin' | 'name' | 'not-current' | 'confirmations' | 'gates' | 'frozen-layer' | 'advance'; error: string }

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
  /** Makes `<parent>/<name>` and starts version tracking in it, so a person with no folder yet
   * never has to leave the app to make one. Refuses an unsafe name or a folder that already
   * exists; the caller continues into the normal setup wizard with the returned path. */
  createProject(parent: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }>
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
  /** Starts every file a `create` activity declares from the plugin's template for it — never
   * overwriting one that exists — and says which were created. Spec 0024. */
  startActivity(projectPath: string, stageId: string, activityId: string): Promise<StartActivityResult>
  /** Runs one of the Workflow tab's two checks (`rules-check`, `data-check`) and returns it parsed. */
  runActivityCheck(projectPath: string, activityId: string): Promise<ActivityCheckResult>
  /** Reads a stage's guidance file from the plugin (the `definition` path readiness reports). */
  getStageGuide(definition: string): Promise<StageGuide>
  /** Writes a stage's HTML report (or every stage's, when `all`) through generate_phase_report.py. */
  exportPhaseReport(projectPath: string, stageId: string, all: boolean): Promise<PhaseReportResult>
  /** Opens a generated report in the default program. Refuses anything outside
   * `<project>/.sdlc/reports/`. */
  openReport(projectPath: string, reportPath: string): Promise<{ ok: boolean; error?: string }>
  /** Reads (and, with a change, updates) the reference-document catalogue. */
  runIntake(projectPath: string, change?: IntakeChange): Promise<IntakeCatalogue>
  getNarrativeCoverage(projectPath: string, stageId: string): Promise<NarrativeCoverage>
  getReviewStanding(projectPath: string): Promise<ReviewStanding>
  runStrictReviewCheck(projectPath: string): Promise<StrictCheckResult>
  /** Reads GitHub's own history (read-only: nothing is opened, merged or changed) to say which
   * delivery rails have actually fired, and writes the result to pipeline-proof.md. Needs the
   * `gh` CLI signed in on this machine; says so plainly when it is not. */
  gatherPipelineEvidence(projectPath: string): Promise<PipelineEvidenceResult>
  /** Sign off a stage and advance the phase — the general version of `advanceAfterDeclaration`.
   * Checks the gates, confirms every judgement question, drafts and validates a frozen-layer
   * summary, then advances. `stage` on a refusal names exactly where it stopped. */
  signOffStage(
    projectPath: string, stageId: string, signedBy: string, disciplineSignoffs: DisciplineSignoff[],
  ): Promise<SignOffResult>
  /** Record (or withdraw) one person's confirmation of one sign-off question. */
  setJudgementConfirmation(
    projectPath: string, stageId: string, questionId: string, confirmed: boolean, actor: string,
  ): Promise<{ ok: boolean; error?: string }>
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
  /** Which credential the review gates sign in with. Never returns the value itself. */
  getGateAuth(projectPath: string): Promise<GateAuthStatus>
  /** Set it. The credential reaches the plugin on standard input and is never logged,
   * never stored by Studio, and never written to this machine. */
  setGateAuth(projectPath: string, mode: 'subscription' | 'api-key', credential: string):
    Promise<GateAuthResult>
  clearGateAuth(projectPath: string, mode: 'subscription' | 'api-key'): Promise<GateAuthResult>
  /** What Foundation handed to Build, read from those documents. */
  getFoundationSummary(projectPath: string): Promise<FoundationSummary>
  /** What stands between this project and declaring Build finished. Read-only. */
  getDeclarationStatus(projectPath: string, confirmedTeams: Record<string, string>):
    Promise<DeclarationStatus>
  /** Refuse, or report that a declaration is permitted. Refuses in the PLUGIN. */
  declareComplete(projectPath: string, declaredBy: string, confirmedTeams: Record<string, string>):
    Promise<DeclarationResult>
  /** Defer one spec with a reason. The plugin refuses an empty or token reason. */
  advanceAfterDeclaration(projectPath: string, declaredBy: string): Promise<AdvanceResult>
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

  // --- Chat authoring (spec 0016) ---
  /** Reads the stage's chat state without ever starting the model — used on mount so opening
   * a stage that already has a conversation shows it without a network call. */
  getChatState(projectPath: string, stageId: string): Promise<ChatState>
  /** Live "what is the assistant doing" updates for any chat turn in flight. Returns an
   * unsubscribe function. Carries no turn result — that still arrives through the invoke below. */
  onChatActivity(callback: (activity: ChatActivity) => void): () => void
  /** Starts the conversation if it has never been started AND the stage has a document not yet
   * begun — the assistant's own opening message, never a blank box waiting on the person.
   * A no-op (returns the existing state unchanged) on a stage whose documents are all already
   * started, or whose chat has already been greeted. Takes no `actor`: nothing this call does
   * (or `sendChatMessage`/`answerChatQuestion` below) attributes anything to a person — only
   * `resolveChatProposal` writes to the draft ledger, which is what actually needs one. */
  ensureChatStarted(projectPath: string, stageId: string): Promise<ChatTurnResult>
  /** An ordinary next turn — the person's own words, or (from answerChatQuestion) the option
   * label they picked. Resumes the same `claude` session via --session-id/--resume. */
  sendChatMessage(projectPath: string, stageId: string, text: string): Promise<ChatTurnResult>
  /** Answers a pending structured question by submitting the OPTION's label as the next plain
   * turn — the mechanism spec 0016's own spike measured actually works, not a formal
   * tool_result the CLI's print mode has no way to accept out of band. `questionId` is the
   * QUESTION's own id (ChatQuestion.id) — distinct from its message's id, since one message
   * can carry more than one question. */
  answerChatQuestion(
    projectPath: string, stageId: string, questionId: string, optionLabel: string,
  ): Promise<ChatTurnResult>
  /** Accept, edit-then-accept, or discard one proposed write. Accepting (in either shape)
   * writes through documents.setField — the SAME path spec 0010 built, never a second one.
   * Every outcome, including discarded, is recorded through drafts.recordDraftOutcome.
   * `proposalId` is the PROPOSAL's own id (ChatProposal.id) — distinct from its message's id,
   * since one message can carry more than one proposal. */
  resolveChatProposal(
    projectPath: string, stageId: string, proposalId: string,
    outcome: DraftOutcome, finalValue: string, actor: string,
  ): Promise<ChatTurnResult>
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
  /** Real hours since review was (re-)requested, and whether that is over the row's own
   * team's alarm threshold from cadence-plan.md — both absent when nobody is currently
   * named as reviewer, since there is nothing to time (spec 0011/0012's shared gap: this
   * used to be computed, humanized into waitingOn, and then thrown away). */
  waitHours?: number
  overAlarm?: boolean
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
