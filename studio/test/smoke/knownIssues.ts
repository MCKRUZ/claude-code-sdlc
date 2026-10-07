/** Problems the smoke run has already found, written down so they are reported without failing the run.
 *
 * The point of the suite is to fail on something NEW. Without this list the first run, which found a
 * dozen real problems, would turn the whole Studio check red until every one was fixed, and a check
 * that is always red is a check people stop reading. Every entry names the problem in a user's terms
 * and says what fixing it looks like; the report lists these under "Known, not yet fixed" so they stay
 * in view. Fix one, delete its entry. An entry never hides a different problem: it matches one kind
 * of finding with one piece of detail, and a finding that matches nothing here fails the run.
 */

import type { Finding } from './findings'

export interface KnownIssue {
  kind: string
  /** Matched against the finding's detail. */
  detail: RegExp
  /** The problem as a user meets it. */
  problem: string
  /** What fixing it would mean. */
  fix: string
}

export const KNOWN_ISSUES: KnownIssue[] = [
  {
    kind: 'scrolls-sideways',
    detail: /<span> "(Artifacts|Signed off by|Entered|Completed|State)"/,
    problem: 'On a narrower window (1024 px with the chat open, and 640 px) the Lifecycle table at the top of every stage is wider than the window: its Artifacts, Signed off by, Entered and Completed columns run past the edge.',
    fix: 'Let the table scroll inside its own box, or drop the lesser columns below about 1100 px.',
  },
  {
    kind: 'scrolls-sideways',
    detail: /Widen the window to at least 640/,
    problem: 'At 640 px the dependency Graph panel tells the person to widen the window to at least 640 px, and then overflows a 640 px window.',
    fix: 'Show the Table twin below its minimum instead of a graph that does not fit.',
  },
  {
    kind: 'scrolls-sideways',
    detail: /<button> "(Guide|I check|Everything|Checks and gates)"|"core\u00b7 2 in flight/,
    problem: 'At 640 px several rows do not wrap and run past the edge: the stage tabs and step list, the Build board\'s team chips and filter buttons, and the tabs on "How it is going".',
    fix: 'Let those rows wrap, or stack the chat under the content at this width.',
  },
  {
    kind: 'error-showing',
    detail: /Talked to the code host — failed after [\d.]+s\.$|^EXIT 4$/,
    problem: 'When the code host (GitHub) is not signed in, the Console lists each attempt to reach it in red, with a bare "EXIT 4". The record is honest; what is missing is anything outside the Console telling the person to sign in.',
    fix: 'Show one calm line where the person is working ("Sign in to GitHub to see live status") and keep the red entries as the log they are.',
  },
  {
    kind: 'leaked-internals',
    detail: /^raw-tool-message/,
    problem: 'When the GitHub CLI is not signed in, its own instructions are shown word for word on the Build board and in Settings ("set the GH_TOKEN environment variable… Example: env: GH_TOKEN: ${{ github.token }}"). Found by the CI run, where it is never signed in; a person who has not run "gh auth login" would see the same.',
    fix: 'Say it in Studio\'s words ("Studio cannot read your code host yet. Sign in to GitHub, then come back") and keep the tool\'s own text behind a "details" fold or in the Console.',
  },
  {
    kind: 'control-without-name',
    detail: /^<input> near "/,
    problem: 'In the document editor, each field\'s text box has no label of its own: its caption sits beside it but is not tied to it, so a screen reader announces an unnamed edit box.',
    fix: 'Associate each caption with its input (a label element or aria-labelledby) in FieldEditor.',
  },
  {
    kind: 'error-showing',
    detail: /chat is still connecting/i,
    problem: 'Choosing "Talk it through" (or Next/Back in a step) a few seconds after opening a project fails with "The chat is still connecting. Try again in a moment."',
    fix: 'Hold the request and send it once the chat is ready, or disable the control with a "Connecting…" label until it is.',
  },
  {
    kind: 'error-showing',
    detail: /There are no .* documents to review yet/,
    problem: '"Run the review" can be pressed with nothing to review, and answers with a red error.',
    fix: 'Disable it with the reason beside it ("Nothing to review until a document exists"), the way Build is disabled in the brief form.',
  },
]

export function knownIssueFor(finding: Finding): KnownIssue | undefined {
  if (finding.severity !== 'bug') return undefined
  return KNOWN_ISSUES.find((k) => k.kind === finding.kind && k.detail.test(finding.detail))
}
