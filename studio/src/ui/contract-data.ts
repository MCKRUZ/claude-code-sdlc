// Prop TYPES for §3 primitives #17–#31: data display, overlays, feedback and the two
// `src/components/` hosts. Re-exported from `./contract.ts`; import from there.
import type { ComponentPropsWithoutRef, ElementType, ReactNode, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'

type Rest<E extends ElementType, Owned extends PropertyKey = never> = Omit<ComponentPropsWithoutRef<E>, Owned>

// --- #17 DataTable -----------------------------------------------------------------------------

export interface DataTableColumn<Row> {
  id: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  /** `scope="col"` is always emitted; this only adds alignment and width classes. */
  align?: 'start' | 'end'
  width?: string
  mono?: boolean
}

/** `<table>` semantics with a sticky `<thead>` inside its own scroll box. `rowProps` is how the
 * pinned `data-testid="sprint-slate-row"` and `data-spec` reach a `<tr>`; `renderDetails` keeps
 * the DoR `<details>` row (`sprint.spec:114` counts `details[open]`). */
export interface DataTableProps<Row> extends Rest<'table'> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  rowProps?: (row: Row) => Rest<'tr'>
  renderDetails?: (row: Row) => ReactNode
  stickyHeader?: boolean
  dense?: boolean
  /** Shown in a single full-width row when `rows` is empty — the caller's sentence, never a count. */
  empty?: ReactNode
  /** `aria-label` for the table when no visible caption names it. */
  label?: string
}

// --- #18 DefinitionList ------------------------------------------------------------------------

export interface DefinitionItem {
  term: ReactNode
  detail: ReactNode
  key?: string
}

export interface DefinitionListProps extends Rest<'dl'> {
  items: DefinitionItem[]
  columns?: 1 | 2 | 3 | 4
}

// --- #19 Dialog --------------------------------------------------------------------------------

export type DialogSize = 'sm' | 'md' | 'lg'

/** Portals into `#overlays` (a sibling of `#root`), `role="dialog" aria-modal`, focus trap,
 * Escape, scroll lock, focus restore. Never an `<aside>`. */
export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: DialogSize
  initialFocus?: RefObject<HTMLElement | null>
  /** Default true: focus returns to the opener on close. */
  returnFocus?: boolean
  footer?: ReactNode
  children?: ReactNode
  /** Overrides the title as the accessible name (the palette uses "Command palette"). */
  label?: string
  className?: string
  'data-testid'?: string
  /** False renders no header band or close button (the command palette owns its own input
   * row). Escape and the scrim still close it. Default true. */
  chrome?: boolean
  /** Round 2 (M5): the body becomes its own scroll box, `max-h-[min(60vh,560px)]`, so a long
   * list (ShortcutsHelp, the palette) scrolls inside the panel while the header and footer stay
   * put; the footer takes `rounded-b-[inherit]`. Default false. */
  scrollBody?: boolean
  /** Where the panel sits on the scrim. `center` (default) for a verdict, a hand-off, a confirm.
   * `top` anchors the panel 12vh from the top so a panel whose height follows its content — the
   * command palette's result list — never moves the field the person is typing into (v13: the
   * centred palette jumped ≈ 150 px between a one-row and an eight-row result). */
  placement?: 'center' | 'top'
}

// --- #20 Popover / HoverCard -------------------------------------------------------------------

export type Placement = 'top' | 'bottom' | 'left' | 'right'

/** Opens on hover AND `focus-visible`; Escape closes; `pointer-events: none` on the content;
 * `role="tooltip"` when `content` is text-only. The content never contains a write control. */
export interface HoverCardProps {
  trigger: ReactNode
  content: ReactNode
  placement?: Placement
  /** ms; defaults 350 / 120. */
  openDelay?: number
  closeDelay?: number
  className?: string
}

export type PopoverProps = HoverCardProps

// --- #21 Tooltip -------------------------------------------------------------------------------

export interface TooltipProps {
  label: string
  kbd?: string[]
  children: ReactNode
  placement?: Placement
}

// --- #22 Kbd -----------------------------------------------------------------------------------

/** `<kbd>` semantics; renders ⌘ or Ctrl for the `'Mod'` key by platform. */
export interface KbdProps extends Rest<'kbd'> {
  keys: string[]
}

// --- #23 BackLink ------------------------------------------------------------------------------

/** Keeps the exact visible text including the arrow ("← Back to the board") — tests locate it. */
export interface BackLinkProps extends Rest<'button', 'type'> {
  label: string
}

// --- #24 Icon ----------------------------------------------------------------------------------

/** 12 is for chip and badge glyphs only (C5) — a 14 px icon in a 20 px chip crowds the text. */
export type IconSize = 12 | 14 | 16 | 18

/** `aria-hidden` unless `label` is given (then `role="img"`). */
export interface IconProps {
  icon: LucideIcon
  size?: IconSize
  label?: string
  className?: string
}

// --- #25 Toast ---------------------------------------------------------------------------------

export type ToastTone = 'ok' | 'info' | 'warn' | 'error'

export interface ToastInput {
  tone: ToastTone
  title: ReactNode
  detail?: ReactNode
  action?: { label: string; onClick: () => void }
  /** Stays until dismissed; otherwise ttl 6000 ms, paused on hover / focus. */
  sticky?: boolean
}

export interface ToastItem extends ToastInput {
  id: string
  createdAt: number
}

/** `<section role="region" aria-label="Notifications" aria-live="polite">` (errors
 * `assertive`); never an `<aside>`; shows at most `max` (default 3). */
export interface ToastRegionProps {
  max?: number
  className?: string
}

export interface ToastApi {
  toast: (input: ToastInput) => string
  dismiss: (id: string) => void
  items: readonly ToastItem[]
}

// --- #26 Spinner / ProgressRing ----------------------------------------------------------------

/** CSS keyframe; static under motion-off. The overlay's element keeps `animate-spin` for parity. */
export interface SpinnerProps extends Rest<'span'> {
  size?: IconSize
  label: string
}

export interface ProgressRingProps extends Rest<'span'> {
  size?: IconSize
  label: string
  /** 0–1, or null for an indeterminate ring (never a fabricated 0). */
  value: number | null
}

// --- #27 VisuallyHidden / SkipLink -------------------------------------------------------------

export interface VisuallyHiddenProps extends Rest<'span'> {
  as?: 'span' | 'div'
}

/** `<a href="#main">`, first child of `#root`. */
export interface SkipLinkProps extends Rest<'a', 'href'> {
  label?: string
}

// --- #28 Surface3DToggle -----------------------------------------------------------------------

export type SceneSurfaceValue = 'graph' | 'table'

/** A `Segmented` of exactly two buttons "Graph" / "Table" with `aria-pressed`. Rendered by the
 * scene host, never inside `[data-testid=sprint-board]`. */
export interface Surface3DToggleProps {
  value: SceneSurfaceValue
  onChange: (value: SceneSurfaceValue) => void
  disabled?: boolean
  disabledReason?: string
  className?: string
}

// --- #29 Preferences toggles -------------------------------------------------------------------

/** Each is a `Segmented` with `aria-pressed` — buttons only, no `<input>`. They read and write the
 * preference through their own layer (theme.ts / motion contract), so the only props are layout. */
export interface PreferenceToggleProps {
  size?: 'sm' | 'md'
  className?: string
  /** Shown as a note under the control (Settings › Appearance explains `on` overrides the OS). */
  note?: ReactNode
}

export type ThemeToggleProps = PreferenceToggleProps
export type DensityToggleProps = PreferenceToggleProps
export type MotionToggleProps = PreferenceToggleProps

// --- #30 FocusedActivityHost (`src/components/`) ----------------------------------------------

/** Renders the picked activity panel in WorkflowTab's right (main) slot. `activity` is the
 * plugin's own row as the activities adapter already types it; this contract does not re-declare
 * it, so the host imports that type from where it lives today. */
export interface FocusedActivityHostProps<Activity> {
  activity: Activity
  onClose: () => void
  children?: ReactNode
}

// --- #31 RosterPicker (`src/components/`) -----------------------------------------------------

export interface RosterEntry {
  handle: string
  name: string
  team?: string
}

/** `role="combobox"`; the `<input>` lives inside `<main>` only. */
export interface RosterPickerProps {
  roster: RosterEntry[]
  value: string
  onChange: (value: string) => void
  allowFreeText?: boolean
  label: string
  id?: string
  disabled?: boolean
  disabledReason?: string
  placeholder?: string
}
