# angular — frontend pack

The Angular specialization of the **frontend axis**. The installer composes
`packs/frontend/generic` first, then this pack — its Angular-aware `ux-reviewer` overlays the
generic one (last wins), adding the framework's own failure modes to the review: the single-else
`async` pipe that collapses loading, error, and empty into one branch; `catchError` paths that
spin forever or disguise a failure as an empty list; `OnPush` subtrees that never repaint after an
in-place mutation; `ExpressionChangedAfterItHasBeenCheckedError` going silent in production;
subscriptions with no teardown; resolvers that block navigation with no visible waiting story;
`[disabled]` bound instead of `disable()`, and validation errors that never render or fire before
the user has typed; `(click)` on a `<div>` and focus unmanaged across route and dialog changes.

The reviewer checks `@angular/core` in `package.json` before citing syntax — the new control flow,
signals, and `takeUntilDestroyed` each stabilized in different versions, and it reviews the idiom
the repo actually uses.

Selected when the profile declares `stack.frontend.framework: angular` (the installer normalizes
`angular-17` / `Angular 17` to the `angular` alias). A framework with no pack yet gets the generic
reviewer plus a warning — never a failed setup.

## Provenance

Authored 2026-07-16 against the `microsoft-enterprise` profile's `stack.frontend.framework:
angular-17` declaration. Content verified against the Angular documentation — the control-flow
guide (`@for` / `@empty`), `best-practices/skipping-subtrees` (OnPush checks inputs with `==`,
so an in-place mutation is not a change), the NG0100 error reference (dev-mode only), the
`guide/routing/data-resolvers` guide ("navigation is blocked while resolvers execute"),
`best-practices/a11y` (native elements over div-based re-implementations; focus the main content
header on `NavigationEnd`; `cdkTrapFocus`), the `takeUntilDestroyed` API reference (stable since
v19.0), and the v17/v18 release notes for control-flow and signal stability. Not yet exercised on
a real Angular repo.
