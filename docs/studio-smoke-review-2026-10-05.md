# SDLC Studio: a first smoke review, 2026-10-05

What a person finds when they use Studio for the first time and a few days in, from the new smoke suite
(`studio/test/e2e/smoke.spec.ts`) plus a read of its screenshots. The suite walked 168 screens at three window
sizes (1280, 1024 and 640 px wide), clicked every read-only control, and used a stand-in for the live model.

Everything below was observed in the real window against the real plugin. Nothing here has been fixed yet.
Items 3 to 9 are still recorded in `studio/test/smoke/knownIssues.ts`, so the suite reports them without
failing; fixing one means deleting its entry.

## Bugs, most serious first

1. **[Fixed] A brand-new project shows a red "Sync error" on every screen.** Now reads "Saved on this computer
   only / Not shared with a team yet", the Console no longer lists the failed checks, and a save says in plain
   words that the project is not connected to a shared repository. The original finding follows. A project with no shared repository (which
   is every project when it is created) fails the background sync, and the sidebar says "Sync error" in red. The
   reason is only in a hover tooltip. The Console lists the same two failed checks in red, with a bare "EXIT 128".
   Cause: `sync.ts` `pull()` runs `git fetch origin`, which fails when there is no `origin`.
   (Control: not measured against a project that has a remote. This is the cause of the message, but I have not
   confirmed the message disappears with a remote.)
2. **[Fixed] The primary button on a new document is Edit, and it fails.** A step whose document does not exist now
   offers **Start this document**, which creates it from the plugin's template and opens it. The original finding follows. A document that has not been created yet shows
   a blue **Edit** button; pressing it ends in `<path> does not exist`. Seen on the first step of every stage.
3. **At 640 px the middle column is about 40 px wide.** The sidebar and the chat take everything, and the content
   is unreadable. Nothing in the window setup (`electron/main/index.ts`) sets a minimum width, so a person can
   drag it this narrow.
4. **At 1024 px (an ordinary laptop) the Workflow step panel runs past its edge on every stage.** Back, Previous,
   Next and Edit scroll off to the right. The Closing screen is wider than the window too.
5. **Settings scrolls sideways even at 1280 px.** The folder path in the Repository card does not wrap.
6. **"Talk it through" can fail with "The chat is still connecting. Try again in a moment."** when pressed in the
   first seconds after a project opens. (Observed in the earlier runs, which used the live chat; the stand-in chat
   cannot show it.)
7. **"Run the review" can be pressed with nothing to review** and answers with a red error.
8. **The document editor's text boxes have no accessible name.** The caption sits beside each box but is not tied
   to it, so a screen reader announces an unnamed edit box. Nine fields on a requirements document.

9. **When the GitHub CLI is not signed in, its own instructions are shown word for word** on the Build board and in
   Settings: "…set the GH_TOKEN environment variable. Example: env: GH_TOKEN: ${{ github.token }}". Found by the
   CI run, where it is never signed in (my machine is, so my own runs never showed it). A person who has not run
   `gh auth login` would see the same kind of text.

## Rough edges seen only by looking

- **The playbook picker says "Ado Enterprise"** for the playbook `ado-enterprise`, so "ADO" is mangled
  (`SetupFlow.tsx` turns the folder name into capitalised words). The wizard never says what a playbook is or how the options differ, and "This will create" is a list of folder names.
- **The Build board opens on "Needs me" and shows nothing**: "8 specs · 0 shown", "Nothing is waiting on you".
  A new person sees an empty board while specs exist behind the Everything filter. Its banner ends with a
  lowercase fragment: "needs the code host. no git remotes found".
- **"Declare Build complete" is a live blue button** while the screen above it lists six undecided specs. Other
  screens disable the action and say why; this one does not. "6 spec(s)" and "1 team(s)" read as unfinished.
- **The action cards under "Also in this stage" all use the same blue primary button** (Run the review, Export
  this stage's report, Talk it through, Gather pipeline evidence), so nothing says which to press first. With
  nothing in the stage yet, "Export" and "Run the review" have nothing to act on.
- **Step titles are file names** (`constitution.md`, `non-functional-requirements.md`), and the long ones are cut
  off in the step list.
- **"What Build inherited" repeats one sentence five times** ("Foundation did not produce this, or it has not
  been written yet"), once per missing document, with the full path under each.
- **Small click targets:** "← Back to Workflow" and "← Back to the stage" are 16 px tall (65 and 12 screens);
  "Defer" and "Confirm this team's list" are 22 px.
- **Wording written for developers** in text meant for a project manager: "YAML" (44 screens), "JSON", "ledger",
  "frontmatter", and the plugin's lowercase "no artifacts found in the selected phase folder(s)".
- **A later stage reads "Not started" in the sidebar even when its document exists.** The Requirements stage shows
  "Not started" while a requirements document is open in front of the reader. (This may be deliberate: the label
  follows the stage, not its files. It reads as a contradiction.)

## Feature suggestions

Each follows from something observed above; none is built.

1. **A way back to the project list.** Nothing inside a project leads back to it (`App.tsx` only reaches the
   Welcome screen from loading, tooling, New project and Set up). Switching project means restarting the app. A
   project name in the sidebar header that opens "Recent projects / Open another" would close it.
2. **"Start this document"** wherever a document is not yet there, instead of Edit. It would create the file from
   its template (Studio already does this on a first accepted chat proposal) and open it, which also removes
   bug 2.
3. **A local-only state.** "Saved on this computer only. Connect a shared repository to sync with your team," with
   one button that explains how. It turns the first screen every new user sees from an error into an invitation.
4. **One "what next" card at the top of each stage.** Today the answer to "what do I do now?" is spread across a
   step list, a Documents tab, five action cards and the chat. A single card ("Start the project constitution —
   10 minutes, Claude will interview you") would make the next step obvious.
5. **Mark unfilled template text inside a document.** The requirements document shows
   "P0 (Must Have) / P1 (Should Have) / P2 (Nice to Have)" in the Priority field as if it were a value. A visible
   "still the template's wording" marker would show what to change without opening the readiness list. (I have not
   confirmed the readiness check flags this one; the screenshot is from a copy of the plugin's own fixture.)
6. **A short "what is a playbook" line, and a description per playbook, in the setup wizard.** A profile file has
   no description field today (it starts with `company` and `stack`), so the plugin would need to add one; the
   wizard only has the folder name to show.
7. **Search across a project's documents.** A project spreads its documents across nine stages, plus summaries and
   findings. The only search box I saw is the Build board's, which filters specs. Nothing answers "where did we
   say the retention period was?"
8. **Default the Build board to Everything for someone who owns nothing**, or say "You own none of these 8 specs.
   Show all."

## What was not covered

- **Anything that changes or sends something.** Sign-off, lock, keep and discard, build the brief, hand-off,
  summarise and analyse. The report lists each such control by screen. The other specs in `studio/test/e2e/`
  cover them, each with its own fixture.
- **A real model reply.** The suite replaces the chat and draft entry points with stand-ins, so what the
  assistant actually says, and how long it takes, is not looked at.
- **A project with a real shared repository.** The fixture has none, so what a healthy "Synced 2 minutes ago"
  looks like, and what a sync clash screen looks like, were not captured.
- **Contrast and screen-reader order.** The suite checks that controls have names and sizes. It does not check
  colour contrast or reading order; an accessibility library would be a new dependency, so it was left out.
- **macOS and Linux.** Run on Windows only.
