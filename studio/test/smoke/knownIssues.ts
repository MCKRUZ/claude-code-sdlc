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
    detail: /python(\.exe)? failed after [\d.]+s\.$|^EXIT 1$/,
    problem: 'The Console lists, in red, the failed read behind the Edit-on-a-missing-document error below ("python … failed", "EXIT 1").',
    fix: 'Goes away with that fix: once a missing document is started from its template, there is no failing read to log.',
  },
  {
    kind: 'error-showing',
    detail: /\.md does not exist$/,
    problem: 'On a document that has not been created yet, the Edit button is offered and then fails with "<path> does not exist".',
    fix: 'Offer "Create this document" (which starts it from its template) where Edit is shown for a document that is not there yet.',
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
  {
    kind: 'scrolls-sideways',
    detail: /Back to Workflow|Previous/,
    problem: 'At a 1024 px window (an ordinary laptop with the chat open), the step panel on every stage\'s Workflow tab is wider than the space it gets, so its Back / Previous / Next / Edit buttons run past the edge and the panel scrolls sideways.',
    fix: 'Let the step list and the step panel stack (list above, detail below) once the middle column is narrower than about 640 px, instead of side by side.',
  },
  {
    kind: 'scrolls-sideways',
    detail: /the page is wider than the window/,
    problem: 'At 1024 px the Build "Closing" screen is wider than the window.',
    fix: 'Wrap the spec rows (id, title, risk, owner, Defer) onto a second line instead of keeping them on one.',
  },
  {
    kind: 'scrolls-sideways',
    detail: /This project lives at|Stored in /,
    problem: 'On Settings, the folder path in the Repository card (and the "Stored in …" file paths at 1024 px) run past the card, so the whole Settings page scrolls sideways even at the normal 1280 px size.',
    fix: 'Let long paths wrap or truncate in the middle with the full path on hover, rather than forcing the card wider.',
  },
  {
    kind: 'scrolls-sideways',
    detail: /<aside> "Chat/,
    problem: 'At the narrowest window (640 px), the chat panel is wider than the space left, and the whole page scrolls sideways.',
    fix: 'Stack the chat under the content from 640 px down, or give the window a minimum width that fits the three columns.',
  },
]

export function knownIssueFor(finding: Finding): KnownIssue | undefined {
  if (finding.severity !== 'bug') return undefined
  return KNOWN_ISSUES.find((k) => k.kind === finding.kind && k.detail.test(finding.detail))
}
