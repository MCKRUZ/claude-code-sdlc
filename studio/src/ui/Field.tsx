// #7 Field: the label / hint / error frame. It owns the ids (`useId`) and hands them to the
// inner control through context, so Input / Textarea / Select pick up `id`, `aria-describedby`
// and `aria-invalid` without the caller wiring three attributes by hand — the association is
// made once, here, and cannot be half-done.
import { createContext, useContext, useId } from 'react'
import type { FieldProps } from './contract'
import { cn } from './cn'

export interface FieldContextValue {
  id: string
  describedBy?: string
  invalid: boolean
  required: boolean
}

export const FieldContext = createContext<FieldContextValue | null>(null)

/** What a control inside a Field spreads onto its element. Explicit props on the control win. */
export function useFieldControl(own: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false'; required?: boolean }) {
  const field = useContext(FieldContext)
  return {
    id: own.id ?? field?.id,
    'aria-describedby': own['aria-describedby'] ?? field?.describedBy,
    'aria-invalid': own['aria-invalid'] ?? (field?.invalid ? true : undefined),
    required: own.required ?? (field?.required || undefined),
  }
}

export function Field({ label, hint, error, required = false, children, id, className }: FieldProps) {
  const generated = useId()
  const controlId = id ?? `field-${generated}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-1', className)}>
        <label htmlFor={controlId} className="text-xs font-medium text-ink-2">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-status-error-ink">
              *
            </span>
          ) : null}
        </label>
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-status-error-ink">
            {error}
          </p>
        ) : null}
        {hint ? (
          <p id={hintId} className="text-xs text-ink-3">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}
