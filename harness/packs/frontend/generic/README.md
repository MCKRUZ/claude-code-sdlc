# generic — frontend pack

The framework-agnostic base of the **frontend axis** (`packs/frontend/<id>`). Installed
whenever the profile declares a frontend (`stack.frontend` present), regardless of framework.

Ships the **`ux-reviewer` agent**: reviews user-facing changes for missing states
(loading/empty/error/success), accessibility basics, adherence to the codebase's existing
screen patterns, and drives the changed flow with the browser plug-in when available.
Advisory — it reports, a human decides.

A framework pack (`packs/frontend/react`, later `angular`) composes **on top** of this one and
overlays the agent with a framework-aware version — so a React repo gets the React reviewer,
and a repo on a framework with no pack yet still gets this generic one (graceful degrade with
content, not a warning and nothing).
