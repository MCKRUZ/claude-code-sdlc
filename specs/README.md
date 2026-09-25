# Specs for SDLC Studio

These specs build the work designed in the SDLC Studio canvas and scoped in
`docs/proposals/studio-plugin-work.md`. Each one is a single change: one spec, one branch,
one pull request. Validate any of them with:

```
uv run scripts/check_spec.py --spec specs/0001-spec-people-fields.md
```

## Order

**Plugin changes (this repository) — build these first; the app depends on them.**

| Spec | What it does | Risk |
|---|---|---|
| 0001 | A spec records its owner, developer, checker and team; the project gets a roster of people | MEDIUM |
| 0002 | A spec can be deferred, with a reason, and the reason reaches the hand-over report | MEDIUM |
| 0003 | Work-in-progress limits per team, and the review-wait alarm | MEDIUM |
| 0004 | The scorecard builds itself from GitHub's history instead of hand-recorded events | MEDIUM |
| 0005 | One command hands a spec off: branch, frontmatter, assignment, Claude Code | MEDIUM |
| 0006 | A spec can report where it is, read from its pull request | MEDIUM |
| 0007 | Templates get a shape, so an app can render and write documents without losing anything | HIGH |

**SDLC Studio desktop app.** These build in the Studio application repository, not this one.
Until that repository exists they live here so the order and the dependencies stay visible;
move them when it does.

| Spec | What it does | Risk |
|---|---|---|
| 0008 | The app shell: open a project from a folder, stages, chat, console | MEDIUM |
| 0009 | Repository sync: pull, save as a commit, resolve clashes | HIGH |
| 0010 | Reading and editing documents, with history and approval | HIGH |
| 0011 | The Build board and the spec screens | MEDIUM |
| 0012 | Settings: repository, people and teams, Build rules | MEDIUM |
| 0013 | Read-only views: Build opens, scorecard, checks and gates | MEDIUM |
| 0014 | Declaring Build feature-complete | MEDIUM |

## Design source

The canvas is the visual reference for 0008–0014. Each of those specs names the screens it
builds. Where a screen and a spec disagree, the spec wins — and the screen gets fixed.
