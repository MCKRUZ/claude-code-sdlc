// Prop TYPES for §3 form controls #7–#9: Field + Input / Textarea / Select, Segmented, Tabs.
// Re-exported from `./contract.ts`; import from there. Split out only to keep each contract file
// under the size cap — the rules are the same: `disabledReason` on every control, rest props
// spread last, buttons only where the design says buttons (Segmented, Tabs).
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ControlSize, Disableable, NativeProps } from './contract'

// --- #7 Field + Input / Textarea / Select -----------------------------------------------------

/** The label/hint/error frame. `useId` ties label, `aria-describedby` and `aria-invalid`
 * together, so the inner control gets `fieldProps` rather than wiring its own ids. */
export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  /** Set by Field on its child control. */
  children: ReactNode
  id?: string
  className?: string
}

export interface InputProps extends Disableable, NativeProps<'input', 'size' | 'disabled'> {
  size?: ControlSize
  /** JetBrains Mono for paths and ids. */
  mono?: boolean
  invalid?: boolean
}

export interface TextareaProps extends Disableable, NativeProps<'textarea', 'disabled'> {
  size?: ControlSize
  mono?: boolean
  invalid?: boolean
}

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  disabled?: boolean
}

/** `options` is the plain list; `roster` is the Settings people list (handles with names), the
 * only other shape a Studio `<select>` ever shows. */
export interface SelectProps<V extends string = string> extends Disableable, NativeProps<'select', 'size' | 'disabled' | 'value' | 'onChange'> {
  size?: ControlSize
  value: V
  onChange: (value: V) => void
  options?: SelectOption<V>[]
  roster?: { handle: V; name: string }[]
  invalid?: boolean
}

// --- #8 Segmented ------------------------------------------------------------------------------

export type SegmentedTone = 'accent' | 'inverse' | 'neutral'

export interface SegmentedOption<V extends string = string> {
  value: V
  label: string
  icon?: LucideIcon
  disabled?: boolean
  disabledReason?: string
}

/** Buttons only, each `aria-pressed`; group `role="group" aria-label={label}`; ←/→/Home/End
 * roving. `tone=accent` emits literally `bg-brand-600 text-white`; `tone=inverse` emits
 * `bg-slate-900 text-white` (dark handled by the §2.4 exception). */
export interface SegmentedProps<V extends string = string> extends Disableable {
  options: SegmentedOption<V>[]
  value: V
  onChange: (value: V) => void
  tone?: SegmentedTone
  size?: ControlSize
  label: string
  className?: string
  'data-testid'?: string
}

// --- #9 Tabs -----------------------------------------------------------------------------------

export interface TabListProps<V extends string = string> extends NativeProps<'div', 'onChange' | 'role'> {
  value: V
  onChange: (value: V) => void
  /** `aria-label` of the tablist ("Stage view" is pinned by StageHome). */
  label: string
}

export interface TabProps<V extends string = string> extends Disableable, NativeProps<'button', 'disabled' | 'type' | 'value' | 'role'> {
  value: V
  icon?: LucideIcon
}

export interface TabPanelProps<V extends string = string> extends NativeProps<'div', 'role'> {
  value: V
}
