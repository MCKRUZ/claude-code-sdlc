# react — frontend pack

The React specialization of the **frontend axis**. The installer composes
`packs/frontend/generic` first, then this pack — its React-aware `ux-reviewer` overlays the
generic one (last wins), adding the framework's own failure modes to the review: effect misuse
that flickers or stales the UI, list `key` bugs, controlled/uncontrolled input flips,
keyboard-invisible click handlers, missing Suspense/error-boundary states.

Selected when the profile declares `stack.frontend.framework: react`. A framework with no pack
yet gets the generic reviewer plus a warning — never a failed setup.
