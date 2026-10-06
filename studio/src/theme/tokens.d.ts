// The token NAMES of studio-observatory.md §2, as TypeScript unions. Types only — the values live
// in `src/index.css` (the CSS is the source of truth a theme flips at runtime) and this file exists
// so a component that names a token can be typechecked against the list the CSS actually defines.
// Frozen in Wave 0-0 so the kit, the motion layer and the scenes all spell the same names.

/** `--color-surface-*`: what things sit on. `code` and `code-error` stay dark in both themes. */
export type SurfaceToken = 'surface-0' | 'surface-1' | 'surface-2' | 'surface-3' | 'surface-raised' | 'surface-code' | 'surface-code-error' | 'scrim'

/** `--color-ink-*`: text. `ink-4` is the colour of eyebrows, placeholders and the words "no data". */
export type InkToken = 'ink-1' | 'ink-2' | 'ink-3' | 'ink-4' | 'ink-inverse'

/** `--color-line-*`: hairlines, input borders, emphasised borders. */
export type LineToken = 'line-1' | 'line-2' | 'line-3'

/** The one accent scale. `brand-*` is the same scale under its legacy name (kept because tests
 * and pinned markup reference `bg-brand-600`). */
export type AccentStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export type AccentToken = `accent-${AccentStep}`
export type BrandToken = `brand-${AccentStep}`

/** §2.3 groups — the plugin's own vocabulary for a stage. `completed` reuses `signed`'s hue on
 * purpose: the cue is shape (hollow core), not colour. */
export type StageGroup = 'stage-signed' | 'stage-current' | 'stage-later'

/** §2.3 status groups. `status-running` is its own hue because running is not a warning. */
export type StatusGroup = 'status-ok' | 'status-warn' | 'status-error' | 'status-running'

/** §2.3 spec tones — body colour in the constellation and Chip tone, same meanings as the
 * `SprintBoard` CHIP map. */
export type SpecToneToken = 'spec-ready' | 'spec-inflight' | 'spec-merged' | 'spec-deferred' | 'spec-notready'

/** Every stage and status group carries four values: fill / bg / ink / line. */
export type ToneSlot = 'fill' | 'bg' | 'ink' | 'line'
export type StageToken = `${StageGroup}-${ToneSlot}`
export type StatusToken = `${StatusGroup}-${ToneSlot}`

/** Every semantic colour token name, without the `--color-` prefix. `focus` is the universal
 * focus ring. */
export type ColorToken =
  | SurfaceToken
  | InkToken
  | LineToken
  | 'focus'
  | AccentToken
  | BrandToken
  | StageToken
  | StatusToken
  | SpecToneToken

/** The CSS custom property for a colour token, e.g. `--color-surface-1`. What
 * `useThemeColors` reads through `getPropertyValue`. */
export type ColorVar = `--color-${ColorToken}`

/** §2.5 type scale. `2xs`, `md` and `display` are new; `code` is the mono size. */
export type TypeToken = '2xs' | 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl' | 'display' | 'code'
export type TypeVar = `--text-${TypeToken}`

/** §2.6 radii. `lg` and `xl` are the remapped Tailwind names (10 px and 14 px). */
export type RadiusToken = '1' | '2' | '3' | '4' | 'pill' | 'lg' | 'xl'
export type RadiusVar = `--radius-${RadiusToken}`

/** §2.6 elevation. Dark mode renders these as a rim light, not blur. */
export type ShadowToken = '1' | '2' | '3'
export type ShadowVar = `--shadow-${ShadowToken}`

/** §2.6 density-driven spacing variables redefined under `[data-density="compact"]`. */
export type DensityVar = '--pad-card' | '--pad-row' | '--gap-list'

/** §2.7 durations. The number is the ms value in the CSS; `src/motion/contract.ts` mirrors it. */
export type DurationToken = 'dur-1' | 'dur-2' | 'dur-3' | 'dur-4' | 'dur-5'
export type DurationVar = `--${DurationToken}`

/** §2.7 staggers. `stagger-1` is also capped by GSAP's `amount: 0.32`. */
export type StaggerToken = 'stagger-1' | 'stagger-2'
export type StaggerVar = `--${StaggerToken}`

/** The GSAP ease names §2.7 permits. `back.out(1.4)` ("pop") is only for elements ≤ 24 px;
 * `sine.inOut` is the ambient breathing ease. */
export type EaseName =
  | 'power2.out' | 'power2.inOut' | 'power3.out' | 'power3.inOut' | 'expo.out' | 'expo.inOut'
  | 'back.out(1.2)' | 'back.out(1.4)' | 'sine.inOut'

/** `<html data-theme>` as resolved (never `system`; that is a preference, resolved before mount). */
export type ThemeAttr = 'light' | 'dark'
/** `localStorage['studio.theme']`. */
export type ThemePreference = 'system' | ThemeAttr

/** `<html data-density>` and `localStorage['studio.density']`. */
export type DensityAttr = 'comfortable' | 'compact'

/** `<html data-motion>`: what the CSS reads. The three-way preference lives in
 * `src/motion/contract.ts`. */
export type MotionAttr = 'on' | 'off'

/** Every `localStorage` key §2.1 lists. The constellation key carries a per-project hash
 * suffix; the pinned prefix is what a reader greps for. */
export type PreferenceStorageKey =
  | 'studio.theme'
  | 'studio.density'
  | 'studio.motion'
  | 'studio.spine.collapsed'
  | 'studio.sprint.surface'
  | 'studio.palette.recent'
  | `studio.constellation.${string}`
